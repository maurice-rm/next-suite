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

export const getDeployKeyPath = (name: string): string =>
  path.join(getDeployKeyDirectory(), name);

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
 * Reuses the deploy keypair persisted from a prior run instead of minting a
 * new one each time — a fresh key would append to authorized_keys forever
 * (the dedup grep never matches) and orphan the previous GitHub secret.
 */
export const loadOrCreateKeypair = async (
  name: string,
  options?: { keyDirectory?: string; generate?: KeypairGenerator },
): Promise<Keypair> => {
  const keyDirectory = options?.keyDirectory ?? getDeployKeyDirectory();
  const generate = options?.generate ?? generateKeypair;
  const keyFile = path.join(keyDirectory, name);

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

  const keys = await generate(`${name}@next-suite`);
  await persistKeypair(keyFile, keys);
  return keys;
};
