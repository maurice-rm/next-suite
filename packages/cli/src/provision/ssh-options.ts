import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { PRIVATE_DIRECTORY_MODE } from "./file-modes";

const SIGNAL_EXIT_CODES = { SIGINT: 130, SIGTERM: 143 };

const CONTROL_PERSIST = "60s";

/**
 * A run makes ~25 ssh calls; without multiplexing each one is a fresh TCP
 * connect, key exchange and authentication. Windows OpenSSH has none.
 */
export const isMultiplexingSupported = process.platform !== "win32";

const removeDirectory = (directory: string): void => {
  fs.rmSync(directory, { recursive: true, force: true });
};

// mkdtemp: a fresh, unguessable directory only this user can enter — a
// predictable path could be pre-created by another local user to hijack the
// control socket. Kept short for the socket path length limit.
export const createControlDirectory = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nsm-"));
  fs.chmodSync(directory, PRIVATE_DIRECTORY_MODE);
  process.on("exit", () => {
    removeDirectory(directory);
  });
  for (const [signal, exitCode] of Object.entries(SIGNAL_EXIT_CODES)) {
    process.on(signal, () => {
      removeDirectory(directory);
      process.exit(exitCode);
    });
  }
  return directory;
};

export const buildMultiplexingArgs = (controlDirectory: string): string[] => [
  "-o",
  "ControlMaster=auto",
  "-o",
  `ControlPath=${path.join(controlDirectory, "%C")}`,
  "-o",
  `ControlPersist=${CONTROL_PERSIST}`,
];

/**
 * `accept-new` rather than the default `ask`: execa gives ssh no TTY, so `ask`
 * routes the prompt to `ssh-askpass` and a first run in CI dies there.
 */
export const buildSshOptions = (controlDirectory?: string): string[] => [
  ...(controlDirectory === undefined
    ? []
    : buildMultiplexingArgs(controlDirectory)),
  "-o",
  "StrictHostKeyChecking=accept-new",
];
