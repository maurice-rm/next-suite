import { execa } from "execa";

import { quoteShellWord } from "./shell-quote";
import {
  buildSshOptions,
  createControlDirectory,
  isMultiplexingSupported,
} from "./ssh-options";

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
  options?: { input?: string },
) => Promise<RunResult>;

export interface RemoteFile {
  path: string;
  content: string;
}

/** The probe's own code for "not there", distinct from cat's. */
const ABSENT_EXIT_CODE = 3;

export const formatDestination = (target: SshTarget): string =>
  `${target.user}@${target.host}`;

let sshOptions: string[] | undefined;

export const defaultRunner: Runner = async (file, args, options) => {
  sshOptions ??= buildSshOptions(
    isMultiplexingSupported ? createControlDirectory() : undefined,
  );
  const fullArgs = file === "ssh" ? [...sshOptions, ...args] : args;
  const result = await execa(file, fullArgs, {
    input: options?.input,
    reject: false,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? 1,
  };
};

const assertSucceeded = (target: SshTarget, result: RunResult): void => {
  if (result.exitCode !== 0) {
    throw new Error(
      `ssh ${formatDestination(target)} failed (exit ${String(result.exitCode)}): ${result.stderr}`,
    );
  }
};

export const runRemote = async (
  target: SshTarget,
  script: string,
  run: Runner = defaultRunner,
): Promise<void> => {
  const result = await run("ssh", [formatDestination(target), "bash", "-s"], {
    input: script,
  });
  assertSucceeded(target, result);
};

export const uploadFile = async (
  target: SshTarget,
  file: RemoteFile,
  run: Runner = defaultRunner,
): Promise<void> => {
  const result = await run(
    "ssh",
    [formatDestination(target), `cat > ${file.path}`],
    { input: file.content },
  );
  assertSucceeded(target, result);
};

/** Staged write: `cat >` truncates first, so a dropped connection would leave
 * a half-written file behind. */
export const uploadFileAtomic = async (
  target: SshTarget,
  file: RemoteFile,
  run: Runner = defaultRunner,
): Promise<void> => {
  const stagedPath = `${file.path}.tmp`;
  await uploadFile(target, { path: stagedPath, content: file.content }, run);
  await runRemote(target, `mv ${stagedPath} ${file.path}`, run);
};

const readOrAbsent = async (
  target: SshTarget,
  command: string,
  run: Runner,
): Promise<string> => {
  const result = await run("ssh", [formatDestination(target), command]);
  if (result.exitCode === ABSENT_EXIT_CODE) return "";
  assertSucceeded(target, result);
  return result.stdout;
};

/**
 * The file's content, or `""` when it does not exist. Unreadable throws rather
 * than reading as empty: callers create an absent `.env` with fresh secrets.
 */
export const readRemoteFile = (
  target: SshTarget,
  remotePath: string,
  run: Runner = defaultRunner,
): Promise<string> =>
  readOrAbsent(
    target,
    `if [ -e ${remotePath} ]; then cat ${remotePath}; else exit ${String(ABSENT_EXIT_CODE)}; fi`,
    run,
  );

/** A file inside a user's own directory, touched only as that user — root would follow a symlink the user planted there. */
export interface UserFile {
  user: string;
  path: string;
}

const READ_IF_PRESENT = `if [ -e "$1" ]; then cat "$1"; else exit ${String(ABSENT_EXIT_CODE)}; fi`;

// umask 077 + mktemp + mv: the file appears complete and private, or not at all.
const WRITE_PRIVATE_ATOMICALLY =
  'set -eu; umask 077; next=$(mktemp "$1.XXXXXX"); cat > "$next"; mv "$next" "$1"';

const asUser = (user: string, script: string, path: string): string =>
  `runuser -u ${user} -- sh -c ${quoteShellWord(script)} sh ${quoteShellWord(path)}`;

export const readUserFile = (
  target: SshTarget,
  file: UserFile,
  run: Runner = defaultRunner,
): Promise<string> =>
  readOrAbsent(target, asUser(file.user, READ_IF_PRESENT, file.path), run);

export const writeUserFile = async (
  target: SshTarget,
  file: UserFile & { content: string },
  run: Runner = defaultRunner,
): Promise<void> => {
  const result = await run(
    "ssh",
    [
      formatDestination(target),
      asUser(file.user, WRITE_PRIVATE_ATOMICALLY, file.path),
    ],
    { input: file.content },
  );
  assertSucceeded(target, result);
};

export const listRemoteIps = async (
  target: SshTarget,
  run: Runner = defaultRunner,
): Promise<string[]> => {
  const result = await run("ssh", [formatDestination(target), "hostname -I"]);
  assertSucceeded(target, result);
  return result.stdout.split(/\s+/).filter((ip) => ip.length > 0);
};

export const isRemoteSuccess = async (
  target: SshTarget,
  command: string,
  run: Runner = defaultRunner,
): Promise<boolean> =>
  (await run("ssh", [formatDestination(target), command])).exitCode === 0;
