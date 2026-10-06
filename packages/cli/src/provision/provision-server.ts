import {
  buildAppUrl,
  deriveServerEnv,
  forceAppPort,
  mergeEnv,
  parseEnvKeys,
  readEnvValue,
} from "./env";
import { allocatePort, parseListeningPorts } from "./port";
import {
  parsePortRegistry,
  PORT_REGISTRY_PATH,
  serializePortRegistry,
} from "./port-registry";
import type { ProvisionContext } from "./provision-context";
import { getNginxConfPath } from "./server-paths";
import {
  buildDomainConflictScript,
  buildServerSetupScript,
} from "./server-scripts";
import {
  formatDestination,
  readRemoteFile,
  readUserFile,
  runRemote,
  uploadFileAtomic,
  writeUserFile,
} from "./ssh";

export const assertDomainUnclaimed = async ({
  request,
  target,
  deploy,
  run,
}: ProvisionContext): Promise<void> => {
  const conflicts = await run("ssh", [
    formatDestination(target),
    buildDomainConflictScript(request.domain),
  ]);
  const ownConf = getNginxConfPath(deploy.name);
  const foreign = conflicts.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && line !== ownConf);
  if (foreign.length > 0) {
    throw new Error(
      `${request.domain} is already served by ${foreign.join(", ")} on ${target.host}. nginx would keep the alphabetically first config and silently ignore the other. Pick a different domain, or deprovision that project first.`,
    );
  }
};

export const setupServerUser = async (
  { target, deploy, run, stepLog }: ProvisionContext,
  publicKey: string,
): Promise<void> => {
  stepLog.start("Setting up server user…");
  await runRemote(target, buildServerSetupScript(deploy, publicKey), run);
  stepLog.step(`Server: user ${deploy.user} + ${deploy.path} ready`);
};

const listListeningPorts = async ({
  target,
  run,
}: ProvisionContext): Promise<number[]> => {
  const result = await run("ssh", [formatDestination(target), "ss -ltn"]);
  if (result.exitCode !== 0) {
    throw new Error(
      `Could not list listening ports on ${target.host} (ss -ltn exit ${String(result.exitCode)}): ${result.stderr}`,
    );
  }
  return parseListeningPorts(result.stdout);
};

export const resolveAppPort = async (
  context: ProvisionContext,
): Promise<number> => {
  const { request, target, run, stepLog } = context;
  const { name } = request.manifest;
  const registry = parsePortRegistry(
    await readRemoteFile(target, PORT_REGISTRY_PATH, run),
  );
  const reservedPort = registry[name];
  if (reservedPort !== undefined) {
    stepLog.step(`Port ${String(reservedPort)} reused`);
    return reservedPort;
  }

  stepLog.start("Scanning ports…");
  const port = allocatePort(
    Object.values(registry),
    await listListeningPorts(context),
  );
  await uploadFileAtomic(
    target,
    {
      path: PORT_REGISTRY_PATH,
      content: serializePortRegistry({ ...registry, [name]: port }),
    },
    run,
  );
  stepLog.step(`Port ${String(port)} assigned (APP_PORT)`);
  return port;
};

const reportStaleEnvValues = (
  { request, stepLog }: ProvisionContext,
  existingEnv: string,
  port: number,
): void => {
  const stalePort = readEnvValue(existingEnv, "APP_PORT");
  if (stalePort !== undefined && stalePort !== String(port)) {
    stepLog.step(
      `.env: APP_PORT ${stalePort} → ${String(port)} corrected (nginx and the stack have to agree)`,
    );
  }
  const appUrl = buildAppUrl(request.domain);
  const existingAppUrl = readEnvValue(existingEnv, "NEXT_PUBLIC_APP_URL");
  if (existingAppUrl !== undefined && existingAppUrl !== appUrl) {
    stepLog.step(
      `⚠ .env keeps NEXT_PUBLIC_APP_URL=${existingAppUrl} (not ${appUrl}) — edit it on the server if the domain changed. The GitHub variable is set to ${appUrl}, so the next build bakes that in while the container still reads the old one.`,
    );
  }
};

const getEnvFile = ({ deploy }: ProvisionContext) => ({
  user: deploy.user,
  path: `${deploy.path}/.env`,
});

const writePrivateEnv = async (
  context: ProvisionContext,
  content: string,
): Promise<void> => {
  await writeUserFile(
    context.target,
    { ...getEnvFile(context), content },
    context.run,
  );
};

export const uploadServerEnv = async (
  context: ProvisionContext,
  port: number,
): Promise<void> => {
  const { request, target, run, stepLog } = context;
  const existingEnv = await readUserFile(target, getEnvFile(context), run);
  const derivedEnv = deriveServerEnv(request.envExample, {
    name: request.manifest.name,
    port,
    domain: request.domain,
  });
  const mergedEnv = forceAppPort(mergeEnv(existingEnv, derivedEnv), port);
  reportStaleEnvValues(context, existingEnv, port);

  stepLog.start("Uploading .env…");
  await writePrivateEnv(context, mergedEnv);
  const keptCount = parseEnvKeys(existingEnv).size;
  const uploadedCount = parseEnvKeys(mergedEnv).size;
  stepLog.step(
    `.env: ${String(uploadedCount)} keys uploaded (${String(keptCount)} kept)`,
  );
};
