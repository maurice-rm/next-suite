import {
  type Keypair,
  type KeypairGenerator,
  loadOrCreateKeypair,
} from "./deploy-keypair";
import { resolveDeployTarget } from "./deploy-target";
import { resolveAppUrl } from "./env";
import { buildGhRepoArgs, type GhRunner, runGh } from "./github-cli";
import {
  buildGithubDeployEntries,
  formatManualChecklist,
  type GithubEntry,
} from "./github-deploy";
import type { ProvisionContext, ProvisionRequest } from "./provision-context";
import {
  assertDomainUnclaimed,
  resolveAppPort,
  setupServerUser,
  uploadServerEnv,
} from "./provision-server";
import {
  inspectCertificate,
  obtainCertificate,
  readPreviousConf,
  reportDroppedNames,
  writeSiteConf,
} from "./provision-tls";
import { defaultRunner, type Runner } from "./ssh";
import { createStepLog, type StepHandlers } from "./step-log";

export interface ProvisionDeps extends StepHandlers {
  run?: Runner;
  gh?: GhRunner;
  lookup?: (domain: string) => Promise<string[]>;
  generateKeypair?: KeypairGenerator;
  /** One clean framed block, for output that can't survive being split into
   * step lines (a multi-line SSH private key). The block is always appended
   * to the returned log regardless. */
  onBlock?: (title: string, body: string) => void;
}

export interface ProvisionResult {
  log: string[];
  isCertReady: boolean;
}

const prepareDeployKeypair = async (
  { request, deploy, stepLog }: ProvisionContext,
  generate?: KeypairGenerator,
): Promise<Keypair> => {
  const { name } = request.manifest;
  const keys = generate
    ? await generate(`${deploy.user}@${deploy.host}`)
    : await loadOrCreateKeypair({ host: deploy.host, name });
  stepLog.step(
    `Deploy key ready (~/.config/next-suite/keys/${deploy.host}/${name})`,
  );
  return keys;
};

const setGithubEntries = async (
  { request, stepLog }: ProvisionContext,
  entries: GithubEntry[],
  gh: GhRunner,
): Promise<void> => {
  stepLog.start("Setting GitHub secrets…");
  for (const entry of entries) {
    await gh(
      [entry.kind, "set", entry.name, ...buildGhRepoArgs(request.repo)],
      entry.value,
    );
  }
  const secretCount = entries.filter((entry) => entry.kind === "secret").length;
  const variableCount = entries.length - secretCount;
  stepLog.step(
    `GitHub: ${String(secretCount)} secrets, ${String(variableCount)} variables set`,
  );
};

const reportManualChecklist = (
  { stepLog }: ProvisionContext,
  entries: GithubEntry[],
  onBlock?: (title: string, body: string) => void,
): void => {
  const title = "Skipped GitHub config (--skip-github) — set these manually";
  const body = formatManualChecklist(entries);
  stepLog.lines.push(title, body);
  onBlock?.(title, body);
};

const configureGithub = async (
  context: ProvisionContext,
  privateKey: string,
  deps: ProvisionDeps,
): Promise<void> => {
  const { request, deploy } = context;
  const entries = buildGithubDeployEntries(
    deploy,
    privateKey,
    resolveAppUrl(request.manifest, request.domain),
  );
  if (request.shouldSkipGithub) {
    reportManualChecklist(context, entries, deps.onBlock);
    return;
  }
  await setGithubEntries(context, entries, deps.gh ?? runGh);
};

export const runProvision = async (
  request: ProvisionRequest,
  deps: ProvisionDeps = {},
): Promise<ProvisionResult> => {
  const context: ProvisionContext = {
    request,
    target: { host: request.config.host, user: request.config.adminUser },
    deploy: resolveDeployTarget(request.manifest.name, request.config.host),
    run: deps.run ?? defaultRunner,
    stepLog: createStepLog(deps),
  };

  await assertDomainUnclaimed(context);
  const { publicKey, privateKey } = await prepareDeployKeypair(
    context,
    deps.generateKeypair,
  );
  await setupServerUser(context, publicKey);
  const port = await resolveAppPort(context);
  await uploadServerEnv(context, port);

  const certificate = await inspectCertificate(context);
  const previousConf = await readPreviousConf(context);
  reportDroppedNames(context, previousConf.droppedNames);

  const isCertReady =
    certificate.isReady ||
    (await obtainCertificate(context, {
      previousConf,
      isReplacingStaging: certificate.isReplacingStaging,
      lookup: deps.lookup,
    }));
  if (isCertReady) {
    await writeSiteConf(context, {
      port,
      droppedNames: previousConf.droppedNames,
    });
  } else {
    context.stepLog.step("nginx: TLS deferred — re-run after DNS");
  }

  await configureGithub(context, privateKey, deps);
  return { log: context.stepLog.lines, isCertReady };
};
