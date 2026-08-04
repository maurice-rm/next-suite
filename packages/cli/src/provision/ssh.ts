import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { execa } from "execa";

import { configPath } from "./config";

export interface SshTarget {
  host: string;
  user: string;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type Runner = (
  file: string,
  args: string[],
  opts?: { input?: string },
) => Promise<RunResult>;

/**
 * A run makes ~25 ssh calls; without this each one is a fresh TCP connect, key
 * exchange and authentication. Windows OpenSSH has no multiplexing, so it stays
 * on the plain path.
 */
export const muxArgs = (): string[] => {
  if (process.platform === "win32") return [];
  const dir = path.join(os.tmpdir(), `nsm${process.pid}`);
  fsSync.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const cleanup = (): void => {
    fsSync.rmSync(dir, { recursive: true, force: true });
  };
  process.on("exit", cleanup);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      cleanup();
      process.exit(130);
    });
  }
  return [
    "-o",
    "ControlMaster=auto",
    "-o",
    `ControlPath=${path.join(dir, "%C")}`,
    "-o",
    "ControlPersist=60s",
  ];
};

/**
 * `accept-new` rather than the default `ask`: execa gives ssh no TTY, so `ask`
 * routes the prompt to `ssh-askpass` and a first run in CI dies there.
 */
export const sshOpts = (): string[] => [
  ...muxArgs(),
  "-o",
  "StrictHostKeyChecking=accept-new",
];

let cachedSshOpts: string[] | undefined;

export const defaultRunner: Runner = async (file, args, opts) => {
  cachedSshOpts ??= sshOpts();
  const full = file === "ssh" ? [...cachedSshOpts, ...args] : args;
  const r = await execa(file, full, { input: opts?.input, reject: false });
  return { stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode ?? 1 };
};

const assertOk = (t: SshTarget, result: RunResult): void => {
  if (result.exitCode !== 0) {
    throw new Error(
      `ssh ${t.user}@${t.host} failed (exit ${result.exitCode}): ${result.stderr}`,
    );
  }
};

export const runRemote = async (
  t: SshTarget,
  script: string,
  run: Runner = defaultRunner,
): Promise<void> => {
  const result = await run("ssh", [`${t.user}@${t.host}`, "bash", "-s"], {
    input: script,
  });
  assertOk(t, result);
};

export const uploadFile = async (
  t: SshTarget,
  content: string,
  remotePath: string,
  run: Runner = defaultRunner,
): Promise<void> => {
  const result = await run(
    "ssh",
    [`${t.user}@${t.host}`, `cat > ${remotePath}`],
    { input: content },
  );
  assertOk(t, result);
};

/** Staged write: `cat >` truncates first, so a dropped connection would leave
 * a half-written file behind. */
export const uploadFileAtomic = async (
  t: SshTarget,
  content: string,
  remotePath: string,
  run: Runner = defaultRunner,
): Promise<void> => {
  await uploadFile(t, content, `${remotePath}.tmp`, run);
  await runRemote(t, `mv ${remotePath}.tmp ${remotePath}`, run);
};

/** The probe's own code for "not there", distinct from cat's. */
const ABSENT = 3;

/**
 * The file's content, or `""` when it does not exist. Unreadable throws rather
 * than reading as empty: callers create an absent `.env` with fresh secrets.
 */
export const readRemoteFile = async (
  t: SshTarget,
  remotePath: string,
  run: Runner = defaultRunner,
): Promise<string> => {
  const result = await run("ssh", [
    `${t.user}@${t.host}`,
    `if [ -e ${remotePath} ]; then cat ${remotePath}; else exit ${ABSENT}; fi`,
  ]);
  if (result.exitCode === ABSENT) return "";
  assertOk(t, result);
  return result.stdout;
};

export const remoteIps = async (
  t: SshTarget,
  run: Runner = defaultRunner,
): Promise<string[]> => {
  const result = await run("ssh", [`${t.user}@${t.host}`, "hostname -I"]);
  assertOk(t, result);
  return result.stdout.split(/\s+/).filter((ip) => ip.length > 0);
};

export const genKeypair = async (
  comment: string,
): Promise<{ publicKey: string; privateKey: string }> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ns-ssh-"));
  const keyPath = path.join(dir, "key");
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
    await fs.rm(dir, { recursive: true, force: true });
  }
};

/**
 * Reuses the deploy keypair persisted from a prior run instead of minting a
 * new one each time — a fresh key would append to authorized_keys forever
 * (the dedup grep never matches) and orphan the previous GitHub secret.
 */
export const loadOrCreateKeypair = async (
  name: string,
  opts?: {
    keyDir?: string;
    gen?: (
      comment: string,
    ) => Promise<{ publicKey: string; privateKey: string }>;
  },
): Promise<{ publicKey: string; privateKey: string }> => {
  const keyDir = opts?.keyDir ?? path.join(path.dirname(configPath()), "keys");
  const gen = opts?.gen ?? genKeypair;
  const keyFile = path.join(keyDir, name);

  try {
    const [privateKey, publicKey] = await Promise.all([
      fs.readFile(keyFile, "utf8"),
      fs.readFile(`${keyFile}.pub`, "utf8"),
    ]);
    return { publicKey: publicKey.trim(), privateKey };
  } catch {
    const keys = await gen(`${name}@next-suite`);
    await fs.mkdir(keyDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(keyFile, keys.privateKey, { mode: 0o600 });
    await fs.writeFile(`${keyFile}.pub`, `${keys.publicKey}\n`);
    return keys;
  }
};
