import { execa } from "execa";

import type { ProjectManifest } from "@/generator/manifest";

import {
  certbotArgs,
  deployTargets,
  domainConflictScript,
  ghDeployConfig,
  type GhEntry,
  ghRepoArgs,
  nginxWriteScript,
  serverSetupScript,
  shQuote,
} from "./commands";
import type { GlobalConfig } from "./config";
import { resolvesToAny } from "./dns";
import {
  deriveServerEnv,
  forceAppPort,
  mergeEnv,
  needsAppUrl,
  parseEnvKeys,
} from "./env";
import {
  extractServerNames,
  renderAcmeBootstrap,
  renderNginxBlock,
} from "./nginx";
import { allocatePort } from "./port";
import {
  defaultRunner,
  loadOrCreateKeypair,
  readRemoteFile,
  remoteIps,
  type Runner,
  runRemote,
  uploadFile,
  uploadFileAtomic,
} from "./ssh";

/** From `ss -ltn` output, the port of each Local Address:Port field (4th column). */
export const parseSsPorts = (ssOutput: string): number[] => {
  const ports = new Set<number>();
  for (const line of ssOutput.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("State")) continue;
    const match = trimmed.split(/\s+/)[3]?.match(/:(\d+)$/);
    if (match) ports.add(Number(match[1]));
  }
  return [...ports];
};

/** One block for the whole manual-secrets checklist — a multi-line value (the
 * SSH private key) gets its own label line, so it renders verbatim instead of
 * breaking a single `key: value` line across the terminal. */
export const formatManualChecklist = (entries: GhEntry[]): string => {
  let body = "";
  let prevMultiline = false;
  for (const entry of entries) {
    const value = entry.value.replace(/\n+$/, "");
    const multiline = value.includes("\n");
    const chunk = multiline
      ? `${entry.kind} ${entry.name}:\n${value}`
      : `${entry.kind} ${entry.name}: ${value}`;
    if (body !== "") body += multiline || prevMultiline ? "\n\n" : "\n";
    body += chunk;
    prevMultiline = multiline;
  }
  return body;
};

export interface ProvisionOptions {
  staging: boolean;
  skipGithub: boolean;
  /** `owner/repo` the GitHub secrets go to; omitted lets `gh` resolve it. */
  repo?: string;
}

export type GhRunner = (args: string[], input?: string) => Promise<void>;

export interface ProvisionDeps {
  run?: Runner;
  gh?: GhRunner;
  lookup?: (domain: string) => Promise<string[]>;
  genKeypair?: (
    comment: string,
  ) => Promise<{ publicKey: string; privateKey: string }>;
  onStep?: (line: string) => void;
  onStepStart?: (label: string) => void;
  /** One clean framed block, for output that can't survive being split into
   * step lines (a multi-line SSH private key). Falls back to a no-op — the
   * block is always appended to the returned log regardless. */
  onBlock?: (title: string, body: string) => void;
}

export const defaultGh: GhRunner = async (args, input) => {
  await execa("gh", args, { input });
};

/** `owner/repo` of the repository `gh` resolves here, or undefined if it can't. */
export const resolveGhRepo = async (): Promise<string | undefined> => {
  const r = await execa(
    "gh",
    ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
    { reject: false },
  );
  const slug = r.stdout.trim();
  return r.exitCode === 0 && slug !== "" ? slug : undefined;
};

type PortRegistry = Record<string, number>;

const parsePortRegistry = (raw: string): PortRegistry =>
  raw.trim() === "" ? {} : (JSON.parse(raw) as PortRegistry);

export interface ProvisionResult {
  log: string[];
  certReady: boolean;
}

export const runProvision = async (
  manifest: ProjectManifest,
  config: GlobalConfig,
  domain: string,
  envExample: string,
  opts: ProvisionOptions,
  deps: ProvisionDeps = {},
): Promise<ProvisionResult> => {
  const run = deps.run ?? defaultRunner;
  const gh = deps.gh ?? defaultGh;
  const onStep = deps.onStep ?? (() => {});
  const onStepStart = deps.onStepStart ?? (() => {});
  const onBlock = deps.onBlock ?? (() => {});

  const t = { host: config.host, user: config.adminUser };
  const deploy = deployTargets(manifest.name, config.host);
  const dest = `${t.user}@${t.host}`;
  const log: string[] = [];
  const step = (line: string): void => {
    log.push(line);
    onStep(line);
  };

  const conflicts = await run("ssh", [dest, domainConflictScript(domain)]);
  const foreign = conflicts.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) => line !== "" && line !== `/etc/nginx/conf.d/${deploy.name}.conf`,
    );
  if (foreign.length > 0) {
    throw new Error(
      `${domain} is already served by ${foreign.join(", ")} on ${config.host}. nginx would keep the alphabetically first config and silently ignore the other. Pick a different domain, or deprovision that project first.`,
    );
  }

  const { publicKey, privateKey } = deps.genKeypair
    ? await deps.genKeypair(`${deploy.user}@${config.host}`)
    : await loadOrCreateKeypair(manifest.name);
  step(`Deploy key ready (~/.config/next-suite/keys/${manifest.name})`);

  onStepStart("Setting up server user…");
  await runRemote(t, serverSetupScript(deploy, publicKey), run);
  step(`Server: user ${deploy.user} + ${deploy.path} ready`);

  const registry = parsePortRegistry(
    await readRemoteFile(t, "/srv/ports.json", run),
  );
  let port = registry[manifest.name];
  if (port === undefined) {
    onStepStart("Scanning ports…");
    const ss = await run("ssh", [dest, "ss -ltn"]);
    if (ss.exitCode !== 0) {
      throw new Error(
        `Could not list listening ports on ${config.host} (ss -ltn exit ${ss.exitCode}): ${ss.stderr}`,
      );
    }
    port = allocatePort(Object.values(registry), parseSsPorts(ss.stdout));
    registry[manifest.name] = port;
    await uploadFileAtomic(
      t,
      `${JSON.stringify(registry, null, 2)}\n`,
      "/srv/ports.json",
      run,
    );
    step(`Port ${port} assigned (APP_PORT)`);
  } else {
    step(`Port ${port} reused`);
  }

  const existingEnv = await readRemoteFile(t, `${deploy.path}/.env`, run);
  const derived = deriveServerEnv(envExample, {
    name: manifest.name,
    port,
    domain,
  });
  const mergedEnv = forceAppPort(mergeEnv(existingEnv, derived), port);
  const stalePort = existingEnv.match(/^APP_PORT=(.*)$/m)?.[1];
  if (stalePort !== undefined && stalePort !== String(port)) {
    step(
      `.env: APP_PORT ${stalePort} → ${port} corrected (nginx and the stack have to agree)`,
    );
  }
  const existingAppUrl = existingEnv.match(/^NEXT_PUBLIC_APP_URL=(.*)$/m)?.[1];
  if (existingAppUrl !== undefined && existingAppUrl !== `https://${domain}`) {
    step(
      `⚠ .env keeps NEXT_PUBLIC_APP_URL=${existingAppUrl} (not https://${domain}) — edit it on the server if the domain changed. The GitHub variable is set to https://${domain}, so the next build bakes that in while the container still reads the old one.`,
    );
  }
  onStepStart("Uploading .env…");
  const envTmp = `${deploy.path}/.env.tmp`;
  await runRemote(
    t,
    `install -m 600 -o ${deploy.user} -g ${deploy.user} /dev/null ${envTmp}`,
    run,
  );
  await uploadFile(t, mergedEnv, envTmp, run);
  await runRemote(t, `mv ${envTmp} ${deploy.path}/.env`, run);
  const kept = parseEnvKeys(existingEnv).size;
  const uploaded = parseEnvKeys(mergedEnv).size;
  step(`.env: ${uploaded} keys uploaded (${kept} kept)`);

  const certCheck = await run("ssh", [
    dest,
    `test -f /etc/letsencrypt/live/${domain}/fullchain.pem`,
  ]);
  let certReady = certCheck.exitCode === 0;

  let replacingStaging = false;
  if (certReady && !opts.staging) {
    const issuer = await run("ssh", [
      dest,
      `openssl x509 -noout -issuer -in /etc/letsencrypt/live/${domain}/fullchain.pem`,
    ]);
    if (issuer.exitCode === 0 && /staging/i.test(issuer.stdout)) {
      certReady = false;
      replacingStaging = true;
      step("TLS: staging certificate found — reissuing a real one");
    }
  }

  const previousConf = await readRemoteFile(
    t,
    `/etc/nginx/conf.d/${deploy.name}.conf`,
    run,
  );
  const previousNames = extractServerNames(previousConf);
  const servesDomain = previousNames.includes(domain);

  const droppedNames = previousNames.filter((n) => n !== domain);
  if (droppedNames.length > 0) {
    step(
      `⚠ nginx: the existing config also served ${droppedNames.join(", ")} — the generated block only serves ${domain}, so re-add them by hand if you need them`,
    );
  }

  if (!certReady) {
    if (servesDomain) {
      step("nginx: existing config serves the ACME challenge — left in place");
    } else {
      onStepStart("Writing nginx config…");
      await runRemote(
        t,
        nginxWriteScript(deploy.name, renderAcmeBootstrap(domain)),
        run,
      );
      step("nginx: bootstrap config written");
    }

    const ips = await remoteIps(t, run);
    const dnsOk = await resolvesToAny(domain, ips, deps.lookup);
    if (!dnsOk) {
      step(
        `⚠ ${domain} does not resolve to this server (${ips.join(", ")}); attempting certbot anyway.`,
      );
    }

    onStepStart("Requesting TLS certificate (can take a minute)…");
    const args = certbotArgs(domain, config.certbotEmail);
    if (opts.staging) args.push("--staging");
    if (replacingStaging) args.push("--force-renewal");
    const script = ["certbot", ...args].map(shQuote).join(" ");
    const certbot = await run("ssh", [dest, "bash", "-s"], { input: script });
    if (certbot.exitCode === 0) {
      certReady = true;
      step(`TLS: certificate obtained${opts.staging ? " (staging)" : ""}`);
    } else if (!servesDomain && previousConf.trim() !== "") {
      await runRemote(
        t,
        nginxWriteScript(deploy.name, `${previousConf.replace(/\n*$/, "")}\n`),
        run,
      );
      step("TLS: deferred — previous nginx config restored");
    } else {
      step("TLS: deferred");
    }
  }

  if (certReady) {
    onStepStart("Writing nginx config…");
    await runRemote(
      t,
      nginxWriteScript(deploy.name, renderNginxBlock(domain, port)),
      run,
    );
    step(
      `nginx: ${domain} → 127.0.0.1:${port} configured (deploy the stack to serve it)`,
    );
    for (const stale of droppedNames) {
      const lineage = await run("ssh", [
        dest,
        `test -d /etc/letsencrypt/live/${stale}`,
      ]);
      if (lineage.exitCode === 0) {
        step(
          `Note: the certificate for ${stale} stays on the server and keeps renewing — remove it with \`certbot delete --cert-name ${stale}\``,
        );
      }
    }
  } else {
    step("nginx: TLS deferred — re-run after DNS");
  }

  const entries = ghDeployConfig(
    deploy,
    domain,
    privateKey,
    needsAppUrl(manifest),
  );

  if (!opts.skipGithub) {
    onStepStart("Setting GitHub secrets…");
    for (const entry of entries) {
      await gh(
        [entry.kind, "set", entry.name, ...ghRepoArgs(opts.repo)],
        entry.value,
      );
    }
    const secrets = entries.filter((e) => e.kind === "secret").length;
    const variables = entries.filter((e) => e.kind === "variable").length;
    step(`GitHub: ${secrets} secrets, ${variables} variables set`);
  } else {
    const title = "Skipped GitHub config (--skip-github) — set these manually";
    const body = formatManualChecklist(entries);
    log.push(title, body);
    onBlock(title, body);
  }

  return { log, certReady };
};
