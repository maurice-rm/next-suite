import { resolvesToAny, toTrustedDomain } from "./dns";
import {
  extractServerNames,
  renderAcmeBootstrap,
  renderNginxBlock,
} from "./nginx";
import type { ProvisionContext } from "./provision-context";
import { getCertificateDirectory, getNginxConfPath } from "./server-paths";
import {
  assertHeredocSafe,
  buildCertbotArgs,
  buildNginxWriteScript,
} from "./server-scripts";
import { quoteShellWord } from "./shell-quote";
import {
  formatDestination,
  isRemoteSuccess,
  listRemoteIps,
  readRemoteFile,
  runRemote,
} from "./ssh";

export interface PreviousConf {
  content: string;
  isServingDomain: boolean;
  droppedNames: string[];
}

interface CertificateState {
  isReady: boolean;
  isReplacingStaging: boolean;
}

const STAGING_ISSUER = /staging/i;

const WRITING_NGINX_CONFIG = "Writing nginx config…";

export const inspectCertificate = async ({
  request,
  target,
  run,
  stepLog,
}: ProvisionContext): Promise<CertificateState> => {
  const chainPath = `${getCertificateDirectory(request.domain)}/fullchain.pem`;
  const hasCertificate = await isRemoteSuccess(
    target,
    `test -f ${chainPath}`,
    run,
  );
  if (!hasCertificate || request.isStaging) {
    return { isReady: hasCertificate, isReplacingStaging: false };
  }

  const issuer = await run("ssh", [
    formatDestination(target),
    `openssl x509 -noout -issuer -in ${chainPath}`,
  ]);
  if (issuer.exitCode !== 0 || !STAGING_ISSUER.test(issuer.stdout)) {
    return { isReady: true, isReplacingStaging: false };
  }
  stepLog.step("TLS: staging certificate found — reissuing a real one");
  return { isReady: false, isReplacingStaging: true };
};

export const readPreviousConf = async ({
  request,
  target,
  deploy,
  run,
}: ProvisionContext): Promise<PreviousConf> => {
  const content = await readRemoteFile(
    target,
    getNginxConfPath(deploy.name),
    run,
  );
  // Checked before anything is written: the restore after a failed certificate
  // must not be the step that discovers the conf cannot be re-uploaded.
  assertHeredocSafe(content);
  const serverNames = extractServerNames(content);
  return {
    content,
    isServingDomain: serverNames.includes(request.domain),
    droppedNames: serverNames.filter(
      (serverName) => serverName !== request.domain,
    ),
  };
};

export const reportDroppedNames = (
  { request, stepLog }: ProvisionContext,
  droppedNames: string[],
): void => {
  if (droppedNames.length === 0) return;
  stepLog.step(
    `⚠ nginx: the existing config also served ${droppedNames.join(", ")} — the generated block only serves ${request.domain}, so re-add them by hand if you need them`,
  );
};

const writeBootstrapConf = async (
  { request, target, deploy, run, stepLog }: ProvisionContext,
  previousConf: PreviousConf,
): Promise<void> => {
  if (previousConf.isServingDomain) {
    stepLog.step(
      "nginx: existing config serves the ACME challenge — left in place",
    );
    return;
  }
  stepLog.start(WRITING_NGINX_CONFIG);
  await runRemote(
    target,
    buildNginxWriteScript(deploy.name, renderAcmeBootstrap(request.domain)),
    run,
  );
  stepLog.step("nginx: bootstrap config written");
};

const warnUnresolvedDomain = async (
  { request, target, run, stepLog }: ProvisionContext,
  lookup?: (domain: string) => Promise<string[]>,
): Promise<void> => {
  const ips = await listRemoteIps(target, run);
  if (await resolvesToAny(request.domain, ips, lookup)) return;
  stepLog.step(
    `⚠ ${request.domain} does not resolve to this server (${ips.join(", ")}); attempting certbot anyway.`,
  );
};

const requestCertificate = async (
  { request, target, run }: ProvisionContext,
  isReplacingStaging: boolean,
): Promise<boolean> => {
  const args = buildCertbotArgs(request.domain, request.config.certbotEmail);
  if (request.isStaging) args.push("--staging");
  if (isReplacingStaging) args.push("--force-renewal");
  const script = ["certbot", ...args].map(quoteShellWord).join(" ");
  const result = await run("ssh", [formatDestination(target), "bash", "-s"], {
    input: script,
  });
  return result.exitCode === 0;
};

const deferCertificate = async (
  { target, deploy, run, stepLog }: ProvisionContext,
  previousConf: PreviousConf,
): Promise<void> => {
  if (previousConf.isServingDomain || previousConf.content.trim() === "") {
    stepLog.step("TLS: deferred");
    return;
  }
  await runRemote(
    target,
    buildNginxWriteScript(
      deploy.name,
      `${previousConf.content.replace(/\n*$/, "")}\n`,
    ),
    run,
  );
  stepLog.step("TLS: deferred — previous nginx config restored");
};

export const obtainCertificate = async (
  context: ProvisionContext,
  options: {
    previousConf: PreviousConf;
    isReplacingStaging: boolean;
    lookup?: (domain: string) => Promise<string[]>;
  },
): Promise<boolean> => {
  const { request, stepLog } = context;
  // Before the bootstrap block replaces the conf: a lookup that throws must
  // not leave the previous site switched off.
  await warnUnresolvedDomain(context, options.lookup);
  await writeBootstrapConf(context, options.previousConf);

  stepLog.start("Requesting TLS certificate (can take a minute)…");
  if (await requestCertificate(context, options.isReplacingStaging)) {
    stepLog.step(
      `TLS: certificate obtained${request.isStaging ? " (staging)" : ""}`,
    );
    return true;
  }
  await deferCertificate(context, options.previousConf);
  return false;
};

const reportStaleCertificates = async (
  { target, run, stepLog }: ProvisionContext,
  droppedNames: string[],
): Promise<void> => {
  const trustedNames = droppedNames.flatMap(
    (droppedName) => toTrustedDomain(droppedName) ?? [],
  );
  for (const staleName of trustedNames) {
    const hasLineage = await isRemoteSuccess(
      target,
      `test -d ${quoteShellWord(getCertificateDirectory(staleName))}`,
      run,
    );
    if (!hasLineage) continue;
    stepLog.step(
      `Note: the certificate for ${staleName} stays on the server and keeps renewing — remove it with \`certbot delete --cert-name ${staleName}\``,
    );
  }
};

export const writeSiteConf = async (
  context: ProvisionContext,
  options: { port: number; droppedNames: string[] },
): Promise<void> => {
  const { request, target, deploy, run, stepLog } = context;
  stepLog.start(WRITING_NGINX_CONFIG);
  await runRemote(
    target,
    buildNginxWriteScript(
      deploy.name,
      renderNginxBlock(request.domain, options.port),
    ),
    run,
  );
  stepLog.step(
    `nginx: ${request.domain} → 127.0.0.1:${String(options.port)} configured (deploy the stack to serve it)`,
  );
  await reportStaleCertificates(context, options.droppedNames);
};
