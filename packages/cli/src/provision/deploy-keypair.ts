import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { execa } from "execa";

import { configPath } from "./config";
import { PRIVATE_DIRECTORY_MODE, PRIVATE_FILE_MODE } from "./file-modes";
import { readFileIfExists } from "./local-file";

export interface Keypair {
  publicKey: string;
  privateKey: string;
}

export type KeypairGenerator = (comment: string) => Promise<Keypair>;

const getDeployKeyDirectory = (): string =>
  path.join(path.dirname(configPath()), "keys");

/** One project on one server: a key is never shared across servers. */
export interface DeployKeyOwner {
  host: string;
  name: string;
}

export const getDeployKeyComment = (name: string): string =>
  `${name}@next-suite`;

const getDeployKeyFile = (
  keyDirectory: string,
  { host, name }: DeployKeyOwner,
): string => path.join(keyDirectory, host, name);

export const getDeployKeyPath = (owner: DeployKeyOwner): string =>
  getDeployKeyFile(getDeployKeyDirectory(), owner);

export const generateKeypair: KeypairGenerator = async (comment) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ns-ssh-"));
  const keyPath = path.join(directory, "key");
  try {
    await execa("ssh-keygen", [
      "-t",
      "ed25519",
      "-f",
      keyPath,
      "-N",
      "",
      "-C",
      comment,
    ]);
    const privateKey = await fs.readFile(keyPath, "utf8");
    const publicKey = (await fs.readFile(`${keyPath}.pub`, "utf8")).trim();
    return { publicKey, privateKey };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
};

const assertNoFileInTheWay = async (directory: string): Promise<void> => {
  const stat = await fs.lstat(directory).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  });
  if (stat && !stat.isDirectory()) {
    throw new Error(
      `${directory} is a file, probably a deploy key from a version before 1.4 — move it and ${directory}.pub aside, then run again.`,
    );
  }
};

const persistKeypair = async (
  keyFile: string,
  keys: Keypair,
): Promise<void> => {
  await fs.mkdir(path.dirname(keyFile), {
    recursive: true,
    mode: PRIVATE_DIRECTORY_MODE,
  });
  await fs.writeFile(keyFile, keys.privateKey, { mode: PRIVATE_FILE_MODE });
  await fs.writeFile(`${keyFile}.pub`, `${keys.publicKey}\n`);
};

/**
 * Reuses the keypair a prior run persisted for this project on this server,
 * so the GitHub secret stays valid across runs. Keyed by host as well as
 * name: two projects named alike on different servers never share a key.
 */
export const loadOrCreateKeypair = async (
  owner: DeployKeyOwner,
  options?: { keyDirectory?: string; generate?: KeypairGenerator },
): Promise<Keypair> => {
  const keyDirectory = options?.keyDirectory ?? getDeployKeyDirectory();
  const generate = options?.generate ?? generateKeypair;
  const keyFile = getDeployKeyFile(keyDirectory, owner);
  await assertNoFileInTheWay(path.dirname(keyFile));

  const [privateKey, publicKey] = await Promise.all([
    readFileIfExists(keyFile),
    readFileIfExists(`${keyFile}.pub`),
  ]);
  if (privateKey !== undefined && publicKey !== undefined) {
    return { publicKey: publicKey.trim(), privateKey };
  }
  if (privateKey !== undefined || publicKey !== undefined) {
    throw new Error(
      `Only half of the deploy keypair exists at ${keyFile} — restore or delete both ${keyFile} and ${keyFile}.pub, then run again.`,
    );
  }

  const keys = await generate(getDeployKeyComment(owner.name));
  await persistKeypair(keyFile, keys);
  return keys;
};
