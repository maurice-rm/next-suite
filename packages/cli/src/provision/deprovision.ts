import fs from "node:fs/promises";
import path from "node:path";

import * as p from "@clack/prompts";
import { defineCommand } from "citty";

import { classifyVersion } from "@/core/version-check";
import { fetchLatestVersion } from "@/latest-version";
import { navigableConfirm, renderProvisionOutro, renderTitle } from "@/ui";
import { isGoBack, required, runWizard, type WizardStep } from "@/wizard";

import pkg from "../../package.json";
import { ghRepoArgs } from "./commands";
import { configPath, parseGlobalConfig } from "./config";
import { isValidHostname } from "./dns";
import { parseManifest } from "./manifest";
import { extractServerName } from "./nginx";
import { createStepSpinner } from "./spinner-steps";
import {
  defaultRunner,
  readRemoteFile,
  type Runner,
  runRemote,
  type SshTarget,
  uploadFileAtomic,
} from "./ssh";
import { defaultGh, type GhRunner, resolveGhRepo } from "./steps";

/** A domain from an untrusted source (remote conf, CLI flag) — only usable once it passes hostname shape rules, since it flows unescaped into shell commands. */
const knownDomain = (raw: string | undefined): string | undefined =>
  raw !== undefined && isValidHostname(raw) ? raw : undefined;

/** Compose derives the project name from the deploy directory and strips what it disallows — of the characters `SAFE_NAME` permits, only the dot. */
export const composeProject = (name: string): string =>
  name.replaceAll(".", "");

type PortRegistry = Record<string, number>;

const parsePortRegistry = (raw: string): PortRegistry =>
  raw.trim() === "" ? {} : (JSON.parse(raw) as PortRegistry);

export const removePortEntry = (registryJson: string, name: string): string => {
  const registry = parsePortRegistry(registryJson);
  delete registry[name];
  return `${JSON.stringify(registry, null, 2)}\n`;
};

const keyFilePath = (name: string): string =>
  path.join(path.dirname(configPath()), "keys", name);

const localKeyExists = async (name: string): Promise<boolean> => {
  try {
    await fs.access(keyFilePath(name));
    return true;
  } catch {
    return false;
  }
};

export interface DeproState {
  confExists: boolean;
  domain?: string;
  certExists: boolean;
  userExists: boolean;
  srvExists: boolean;
  portEntry: boolean;
  localKeys: boolean;
}

export const discoverState = async (
  name: string,
  t: SshTarget,
  run: Runner = defaultRunner,
): Promise<DeproState> => {
  const dest = `${t.user}@${t.host}`;
  const reach = await run("ssh", [dest, "true"]);
  if (reach.exitCode !== 0) {
    throw new Error(`Cannot reach ${t.user}@${t.host}: ${reach.stderr}`);
  }

  const conf = await readRemoteFile(t, `/etc/nginx/conf.d/${name}.conf`, run);
  const confExists = conf.trim() !== "";
  const domain = knownDomain(extractServerName(conf));

  const certExists = domain
    ? (await run("ssh", [dest, `test -d /etc/letsencrypt/live/${domain}`]))
        .exitCode === 0
    : false;
  const userExists = (await run("ssh", [dest, `id -u ${name}`])).exitCode === 0;
  const srvExists =
    (await run("ssh", [dest, `test -d /srv/www/${name}`])).exitCode === 0;

  const registry = parsePortRegistry(
    await readRemoteFile(t, "/srv/ports.json", run),
  );
  const portEntry = name in registry;

  const localKeys = await localKeyExists(name);

  return {
    confExists,
    domain,
    certExists,
    userExists,
    srvExists,
    portEntry,
    localKeys,
  };
};

export interface DeproChoices {
  domain?: string;
  server: boolean;
  github: boolean;
  localKeys: boolean;
  /** `owner/repo` to delete the secrets from; omitted lets `gh` resolve it. */
  repo?: string;
}

export interface DeproResult {
  log: string[];
  /** What the teardown could not remove — empty means it came off completely. */
  leftovers: string[];
}

export interface DeproDeps {
  run?: Runner;
  gh?: GhRunner;
  onStep?: (line: string) => void;
  onStepStart?: (label: string) => void;
}

export const runDeprovision = async (
  name: string,
  t: SshTarget,
  choices: DeproChoices,
  deps: DeproDeps = {},
): Promise<DeproResult> => {
  const run = deps.run ?? defaultRunner;
  const gh = deps.gh ?? defaultGh;
  const onStep = deps.onStep ?? (() => {});
  const onStepStart = deps.onStepStart ?? (() => {});
  const dest = `${t.user}@${t.host}`;
  const home = `/srv/www/${name}`;
  const log: string[] = [];
  const leftovers: string[] = [];
  const step = (line: string): void => {
    log.push(line);
    onStep(line);
  };

  if (choices.server) {
    if (choices.domain !== undefined && !isValidHostname(choices.domain)) {
      throw new Error(`Invalid domain: ${choices.domain}`);
    }

    const confPath = `/etc/nginx/conf.d/${name}.conf`;
    const conf = await readRemoteFile(t, confPath, run);
    const extracted = extractServerName(conf);
    if (extracted !== undefined && knownDomain(extracted) === undefined) {
      step(`nginx: ignoring invalid server_name "${extracted}" in the conf`);
    }
    const domain = knownDomain(extracted) ?? choices.domain;

    onStepStart("Removing nginx config…");
    const logs = domain
      ? ` /var/log/nginx/${domain}.access.log* /var/log/nginx/${domain}.error.log*`
      : "";
    const rm = await run("ssh", [
      dest,
      `rm -f ${confPath} ${confPath}.prev${logs}`,
    ]);
    const reload = await run("ssh", [
      dest,
      'nginx -t && (systemctl reload nginx 2>/dev/null || nginx -s reload); rc=$?; for j in nginx-limit-req nginx-botsearch; do fail2ban-client reload "$j" >/dev/null 2>&1 || true; done; exit $rc',
    ]);
    if (rm.exitCode !== 0) leftovers.push(confPath);
    step(
      rm.exitCode !== 0
        ? `nginx: ${confPath} NOT removed (${rm.stderr.trim() || `exit ${rm.exitCode}`})`
        : reload.exitCode === 0
          ? `nginx: ${confPath} removed`
          : `nginx: ${confPath} removed (reload failed — check nginx -t manually)`,
    );

    if (domain) {
      onStepStart("Removing TLS certificate…");
      const cert = await run("ssh", [
        dest,
        `certbot delete --cert-name ${domain} -n`,
      ]);
      step(
        cert.exitCode === 0
          ? `TLS: certificate for ${domain} removed`
          : `TLS: no certificate to remove for ${domain}`,
      );
    }

    onStepStart("Removing server user…");
    const passwd = await run("ssh", [
      dest,
      `getent passwd ${name} | cut -d: -f6`,
    ]);
    const currentHome = passwd.stdout.trim();
    if (currentHome === home) {
      const del = await run("ssh", [dest, `userdel -r ${name}`]);
      if (del.exitCode !== 0) leftovers.push(`user ${name}`);
      step(
        del.exitCode === 0
          ? `user: ${name} removed`
          : `user: ${name} not removed (${del.stderr.trim() || `exit ${del.exitCode}`})`,
      );
    } else if (currentHome !== "") {
      step(`user: ${name} has home ${currentHome} (not ${home}) — left alone`);
    }

    onStepStart("Removing app directory…");
    if (currentHome !== "" && currentHome !== home) {
      step(`srv: ${home} left alone (user ${name} lives in ${currentHome})`);
    } else {
      await runRemote(t, `rm -rf ${home}`, run);
      step(`srv: ${home} removed`);
    }

    onStepStart("Updating port registry…");
    const registryJson = await readRemoteFile(t, "/srv/ports.json", run);
    if (name in parsePortRegistry(registryJson)) {
      await uploadFileAtomic(
        t,
        removePortEntry(registryJson, name),
        "/srv/ports.json",
        run,
      );
      step("ports: registry entry removed");
    } else {
      step("ports: no registry entry to remove");
    }

    step(
      `Note: containers for ${name} are still running, and ${home} with the compose file is gone — "docker compose -p ${composeProject(name)} down -v" removes them and the database volume`,
    );
  }

  if (choices.github) {
    onStepStart("Removing GitHub secrets…");
    const remote = await run("git", ["remote", "get-url", "origin"]);
    if (remote.exitCode !== 0) {
      step("no GitHub remote — secrets NOT removed");
    } else {
      const authed = await gh(["auth", "status"]).then(
        () => true,
        () => false,
      );
      if (!authed) {
        step("gh not authenticated — GitHub secrets NOT removed");
      } else {
        const secrets = [
          "DEPLOY_SSH_KEY",
          "DEPLOY_SSH_HOST",
          "DEPLOY_SSH_USER",
        ];
        const variables = ["DEPLOY_PATH", "NEXT_PUBLIC_APP_URL"];
        const repoArgs = ghRepoArgs(choices.repo);
        const why = (error: unknown): string =>
          (error instanceof Error ? error.message : String(error))
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l !== "")
            .at(-1) ?? "unknown error";

        for (const secret of secrets) {
          try {
            await gh(["secret", "delete", secret, ...repoArgs]);
            step(`GitHub: secret ${secret} deleted`);
          } catch (error) {
            step(`GitHub: secret ${secret} not deleted — ${why(error)}`);
          }
        }
        for (const variable of variables) {
          try {
            await gh(["variable", "delete", variable, ...repoArgs]);
            step(`GitHub: variable ${variable} deleted`);
          } catch (error) {
            step(`GitHub: variable ${variable} not deleted — ${why(error)}`);
          }
        }
      }
    }
  }

  if (choices.localKeys) {
    const keyFile = keyFilePath(name);
    await fs.rm(keyFile, { force: true });
    await fs.rm(`${keyFile}.pub`, { force: true });
    step(`local keys: ${keyFile} removed`);
  }

  return { log, leftovers };
};

interface DeproGateAnswers {
  server: boolean;
  github: boolean;
  localKeys: boolean;
}

/** One confirm gate: back-navigable, and a cancel throws "Cancelled." (instead of
 * runWizard's own exit) so the caller keeps its existing "Nothing changed." message. */
const deproGate = (
  key: keyof DeproGateAnswers,
  message: string,
  fallback: boolean,
): WizardStep<DeproGateAnswers> => ({
  key,
  run: async (a, canGoBack) => {
    const answer = await navigableConfirm({
      message,
      initialValue: a[key] ?? fallback,
      canGoBack,
    });
    if (isGoBack(answer)) return answer;
    if (p.isCancel(answer)) throw new Error("Cancelled.");
    return answer;
  },
});

/**
 * Walk the teardown gates with back-navigation (server has no back — it's
 * first). --skip-github drops the github gate entirely rather than giving it
 * a silent step, so back-navigation from local-keys reaches server directly.
 */
const promptDeproGates = async (
  skipGithub: boolean,
): Promise<DeproGateAnswers> => {
  const steps: WizardStep<DeproGateAnswers>[] = [
    deproGate(
      "server",
      "Remove server-side config (nginx, cert, user, /srv/www, port entry)?",
      false,
    ),
    ...(skipGithub
      ? []
      : [
          deproGate(
            "github",
            "Delete GitHub Actions deploy secrets and variables?",
            true,
          ),
        ]),
    deproGate("localKeys", "Delete the local deploy key?", true),
  ];
  const answers = await runWizard<DeproGateAnswers>(steps);
  return {
    server: required(answers.server, "server"),
    github: skipGithub ? false : required(answers.github, "github"),
    localKeys: required(answers.localKeys, "localKeys"),
  };
};

const readLocalFile = async (file: string): Promise<string | undefined> => {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return undefined;
  }
};

export const deprovisionCommand = defineCommand({
  meta: {
    name: "deprovision",
    description: "Tear down a previously provisioned server target (over SSH)",
  },
  args: {
    domain: {
      type: "string",
      description:
        "Domain to target (fallback when none is found on the server)",
    },
    yes: {
      type: "boolean",
      alias: "y",
      description: "Non-interactive: remove everything found, no prompts",
    },
    "skip-github": {
      type: "boolean",
      description: "Skip deleting GitHub Actions secrets and variables",
    },
  },
  run: async ({ args }) => {
    try {
      const manifestRaw = await readLocalFile("next-suite.json");
      if (manifestRaw === undefined) {
        throw new Error(
          "No next-suite.json here. Run deprovision from a next-suite project directory.",
        );
      }
      const manifest = parseManifest(manifestRaw);

      const configRaw = await readLocalFile(configPath());
      if (configRaw === undefined) {
        throw new Error(
          "No global config found. Run `next-suite config` first.",
        );
      }
      const config = parseGlobalConfig(configRaw);

      if (!args.yes) {
        const latest = await fetchLatestVersion(pkg.name);
        renderTitle(pkg.version, classifyVersion(pkg.version, latest));
        p.intro("Deprovision a server");
      }

      const t = { host: config.host, user: config.adminUser };
      const spinner = createStepSpinner();
      spinner.onStepStart("Inspecting server…");
      let state: DeproState;
      try {
        state = await discoverState(manifest.name, t);
      } catch (error) {
        spinner.fail();
        throw error;
      }
      spinner.onStep("Server inspected");
      const domain = state.domain ?? args.domain;

      const found = [
        state.confExists &&
          `nginx conf: /etc/nginx/conf.d/${manifest.name}.conf`,
        domain && `domain: ${domain}`,
        state.certExists && "TLS certificate present",
        state.userExists && `user: ${manifest.name}`,
        state.srvExists && `/srv/www/${manifest.name}`,
        state.portEntry && "port registry entry",
        state.localKeys && "local deploy key",
      ].filter((line): line is string => Boolean(line));

      if (found.length === 0) {
        renderProvisionOutro("Nothing to deprovision.", [
          `Project: ${manifest.name}`,
          "Pass --domain to target a leftover certificate.",
        ]);
        return;
      }

      const repo = args["skip-github"] ? undefined : await resolveGhRepo();

      p.note(
        [
          `Server:  ${config.adminUser}@${config.host}`,
          ...(repo ? [`GitHub:  ${repo}`] : []),
          ...found,
        ].join("\n"),
        `Found for ${manifest.name}`,
      );

      let server: boolean;
      let github: boolean;
      let localKeys: boolean;

      if (args.yes) {
        server = true;
        github = !args["skip-github"];
        localKeys = true;
      } else {
        const gates = await promptDeproGates(Boolean(args["skip-github"]));
        server = gates.server;
        github = gates.github;
        localKeys = gates.localKeys;
      }

      if (!server && !github && !localKeys) {
        throw new Error("Cancelled.");
      }

      let result;
      try {
        result = await runDeprovision(
          manifest.name,
          t,
          { domain: args.domain, server, github, localKeys, repo },
          { onStepStart: spinner.onStepStart, onStep: spinner.onStep },
        );
      } catch (error) {
        spinner.fail();
        throw error;
      }

      const headline =
        result.leftovers.length > 0
          ? `${manifest.name} partly deprovisioned — ${result.leftovers.join(", ")} still there.`
          : `${manifest.name} deprovisioned.`;
      renderProvisionOutro(headline, [
        `Server: ${config.adminUser}@${config.host}`,
        ...(domain ? [`Domain: ${domain}`] : []),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message === "Cancelled.") {
        p.cancel("Nothing changed.");
        process.exit(0);
      }
      p.cancel(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  },
});
