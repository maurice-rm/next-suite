import fs from "node:fs/promises";

import { getDeployKeyPath } from "./deploy-keypair";
import { getDeployPath } from "./deploy-target";
import { isValidHostname, toTrustedDomain } from "./dns";
import { buildGhRepoArgs, type GhRunner, runGh } from "./github-cli";
import { GITHUB_DEPLOY_NAMES, type GithubEntryName } from "./github-deploy";
import { extractServerName } from "./nginx";
import {
  parsePortRegistry,
  PORT_REGISTRY_PATH,
  removePortEntry,
} from "./port-registry";
import { getNginxConfPath } from "./server-paths";
import { NGINX_RELOAD_SCRIPT } from "./server-scripts";
import {
  defaultRunner,
  formatDestination,
  readRemoteFile,
  type Runner,
  runRemote,
  type RunResult,
  type SshTarget,
  uploadFileAtomic,
} from "./ssh";
import { createStepLog, type StepHandlers, type StepLog } from "./step-log";

export interface DeprovisionRequest {
  name: string;
  target: SshTarget;
  domain?: string;
  shouldRemoveServer: boolean;
  shouldRemoveGithub: boolean;
  shouldRemoveLocalKeys: boolean;
  /** `owner/repo` to delete the secrets from; omitted lets `gh` resolve it. */
  repo?: string;
}

export interface DeprovisionResult {
  log: string[];
  /** What the teardown could not remove — empty means it came off completely. */
  leftovers: string[];
}

export interface DeprovisionDeps extends StepHandlers {
  run?: Runner;
  gh?: GhRunner;
}

interface DeprovisionContext {
  request: DeprovisionRequest;
  destination: string;
  home: string;
  run: Runner;
  stepLog: StepLog;
  leftovers: string[];
}

/** Compose derives the project name from the deploy directory and strips what it disallows — of the characters `SAFE_NAME` permits, only the dot. */
export const composeProjectName = (name: string): string =>
  name.replaceAll(".", "");

const describeFailure = (result: RunResult): string =>
  result.stderr.trim() || `exit ${String(result.exitCode)}`;

const resolveConfDomain = async ({
  request,
  run,
  stepLog,
}: DeprovisionContext): Promise<string | undefined> => {
  const conf = await readRemoteFile(
    request.target,
    getNginxConfPath(request.name),
    run,
  );
  const extracted = extractServerName(conf);
  const trusted = toTrustedDomain(extracted);
  if (extracted !== undefined && trusted === undefined) {
    stepLog.step(
      `nginx: ignoring invalid server_name "${extracted}" in the conf`,
    );
  }
  return trusted ?? request.domain;
};

const removeNginxConf = async (
  { request, destination, run, stepLog, leftovers }: DeprovisionContext,
  domain: string | undefined,
): Promise<void> => {
  stepLog.start("Removing nginx config…");
  const confPath = getNginxConfPath(request.name);
  const logs = domain
    ? ` /var/log/nginx/${domain}.access.log* /var/log/nginx/${domain}.error.log*`
    : "";
  const removal = await run("ssh", [
    destination,
    `rm -f ${confPath} ${confPath}.prev${logs}`,
  ]);
  const reload = await run("ssh", [destination, NGINX_RELOAD_SCRIPT]);
  if (removal.exitCode !== 0) {
    leftovers.push(confPath);
    stepLog.step(
      `nginx: ${confPath} NOT removed (${describeFailure(removal)})`,
    );
    return;
  }
  stepLog.step(
    reload.exitCode === 0
      ? `nginx: ${confPath} removed`
      : `nginx: ${confPath} removed (reload failed — check nginx -t manually)`,
  );
};

const removeCertificate = async (
  { destination, run, stepLog }: DeprovisionContext,
  domain: string,
): Promise<void> => {
  stepLog.start("Removing TLS certificate…");
  const removal = await run("ssh", [
    destination,
    `certbot delete --cert-name ${domain} -n`,
  ]);
  stepLog.step(
    removal.exitCode === 0
      ? `TLS: certificate for ${domain} removed`
      : `TLS: no certificate to remove for ${domain}`,
  );
};

const readUserHome = async ({
  request,
  destination,
  run,
}: DeprovisionContext): Promise<string> => {
  const passwd = await run("ssh", [
    destination,
    `getent passwd ${request.name} | cut -d: -f6`,
  ]);
  return passwd.stdout.trim();
};

const removeServerUser = async (
  { request, destination, home, run, stepLog, leftovers }: DeprovisionContext,
  currentHome: string,
): Promise<void> => {
  const { name } = request;
  if (currentHome === "") return;
  if (currentHome !== home) {
    stepLog.step(
      `user: ${name} has home ${currentHome} (not ${home}) — left alone`,
    );
    return;
  }
  const removal = await run("ssh", [destination, `userdel -r ${name}`]);
  if (removal.exitCode !== 0) {
    leftovers.push(`user ${name}`);
    stepLog.step(`user: ${name} not removed (${describeFailure(removal)})`);
    return;
  }
  stepLog.step(`user: ${name} removed`);
};

const removeAppDirectory = async (
  { request, home, run, stepLog }: DeprovisionContext,
  currentHome: string,
): Promise<void> => {
  stepLog.start("Removing app directory…");
  if (currentHome !== "" && currentHome !== home) {
    stepLog.step(
      `srv: ${home} left alone (user ${request.name} lives in ${currentHome})`,
    );
    return;
  }
  await runRemote(request.target, `rm -rf ${home}`, run);
  stepLog.step(`srv: ${home} removed`);
};

const removeRegistryEntry = async ({
  request,
  run,
  stepLog,
}: DeprovisionContext): Promise<void> => {
  stepLog.start("Updating port registry…");
  const registryJson = await readRemoteFile(
    request.target,
    PORT_REGISTRY_PATH,
    run,
  );
  if (!(request.name in parsePortRegistry(registryJson))) {
    stepLog.step("ports: no registry entry to remove");
    return;
  }
  await uploadFileAtomic(
    request.target,
    {
      path: PORT_REGISTRY_PATH,
      content: removePortEntry(registryJson, request.name),
    },
    run,
  );
  stepLog.step("ports: registry entry removed");
};

const removeServerSide = async (context: DeprovisionContext): Promise<void> => {
  const { request, home, stepLog } = context;
  if (request.domain !== undefined && !isValidHostname(request.domain)) {
    throw new Error(`Invalid domain: ${request.domain}`);
  }

  const domain = await resolveConfDomain(context);
  await removeNginxConf(context, domain);
  if (domain) await removeCertificate(context, domain);

  stepLog.start("Removing server user…");
  const currentHome = await readUserHome(context);
  await removeServerUser(context, currentHome);
  await removeAppDirectory(context, currentHome);
  await removeRegistryEntry(context);

  stepLog.step(
    `Note: containers for ${request.name} are still running, and ${home} with the compose file is gone — "docker compose -p ${composeProjectName(request.name)} down -v" removes them and the database volume`,
  );
};

const summarizeError = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error))
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .at(-1) ?? "unknown error";

const isGhAuthenticated = (gh: GhRunner): Promise<boolean> =>
  gh(["auth", "status"]).then(
    () => true,
    () => false,
  );

const deleteGithubEntry = async (
  { request, stepLog }: DeprovisionContext,
  entry: GithubEntryName,
  gh: GhRunner,
): Promise<void> => {
  const label = `${entry.kind} ${entry.name}`;
  try {
    await gh([
      entry.kind,
      "delete",
      entry.name,
      ...buildGhRepoArgs(request.repo),
    ]);
    stepLog.step(`GitHub: ${label} deleted`);
  } catch (error) {
    stepLog.step(`GitHub: ${label} not deleted — ${summarizeError(error)}`);
  }
};

const removeGithubConfig = async (
  context: DeprovisionContext,
  gh: GhRunner,
): Promise<void> => {
  const { run, stepLog } = context;
  stepLog.start("Removing GitHub secrets…");
  const remote = await run("git", ["remote", "get-url", "origin"]);
  if (remote.exitCode !== 0) {
    stepLog.step("no GitHub remote — secrets NOT removed");
    return;
  }
  if (!(await isGhAuthenticated(gh))) {
    stepLog.step("gh not authenticated — GitHub secrets NOT removed");
    return;
  }
  for (const entry of GITHUB_DEPLOY_NAMES) {
    await deleteGithubEntry(context, entry, gh);
  }
};

const removeLocalKeys = async ({
  request,
  stepLog,
}: DeprovisionContext): Promise<void> => {
  const keyFile = getDeployKeyPath({
    host: request.target.host,
    name: request.name,
  });
  await fs.rm(keyFile, { force: true });
  await fs.rm(`${keyFile}.pub`, { force: true });
  stepLog.step(`local keys: ${keyFile} removed`);
};

export const runDeprovision = async (
  request: DeprovisionRequest,
  deps: DeprovisionDeps = {},
): Promise<DeprovisionResult> => {
  const context: DeprovisionContext = {
    request,
    destination: formatDestination(request.target),
    home: getDeployPath(request.name),
    run: deps.run ?? defaultRunner,
    stepLog: createStepLog(deps),
    leftovers: [],
  };

  if (request.shouldRemoveServer) await removeServerSide(context);
  if (request.shouldRemoveGithub) {
    await removeGithubConfig(context, deps.gh ?? runGh);
  }
  if (request.shouldRemoveLocalKeys) await removeLocalKeys(context);

  return { log: context.stepLog.lines, leftovers: context.leftovers };
};
