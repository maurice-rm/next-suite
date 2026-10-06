import { getDeployKeyPath } from "./deploy-keypair";
import { getDeployPath } from "./deploy-target";
import { toTrustedDomain } from "./dns";
import { isExistingFile } from "./local-file";
import { extractServerName } from "./nginx";
import { parsePortRegistry, PORT_REGISTRY_PATH } from "./port-registry";
import { getCertificateDirectory, getNginxConfPath } from "./server-paths";
import {
  defaultRunner,
  formatDestination,
  isRemoteSuccess,
  readRemoteFile,
  type Runner,
  type SshTarget,
} from "./ssh";

export interface DeprovisionState {
  hasNginxConf: boolean;
  domain?: string;
  hasCertificate: boolean;
  hasUser: boolean;
  hasAppDirectory: boolean;
  hasPortEntry: boolean;
  hasLocalKeys: boolean;
}

const assertReachable = async (
  target: SshTarget,
  run: Runner,
): Promise<void> => {
  const destination = formatDestination(target);
  const reach = await run("ssh", [destination, "true"]);
  if (reach.exitCode !== 0) {
    throw new Error(`Cannot reach ${destination}: ${reach.stderr}`);
  }
};

export const discoverState = async (
  name: string,
  target: SshTarget,
  run: Runner = defaultRunner,
): Promise<DeprovisionState> => {
  await assertReachable(target, run);

  const conf = await readRemoteFile(target, getNginxConfPath(name), run);
  const domain = toTrustedDomain(extractServerName(conf));
  const hasCertificate =
    domain !== undefined &&
    (await isRemoteSuccess(
      target,
      `test -d ${getCertificateDirectory(domain)}`,
      run,
    ));
  const hasUser = await isRemoteSuccess(target, `id -u ${name}`, run);
  const hasAppDirectory = await isRemoteSuccess(
    target,
    `test -d ${getDeployPath(name)}`,
    run,
  );
  const registry = parsePortRegistry(
    await readRemoteFile(target, PORT_REGISTRY_PATH, run),
  );

  return {
    hasNginxConf: conf.trim() !== "",
    domain,
    hasCertificate,
    hasUser,
    hasAppDirectory,
    hasPortEntry: name in registry,
    hasLocalKeys: await isExistingFile(
      getDeployKeyPath({ host: target.host, name }),
    ),
  };
};
