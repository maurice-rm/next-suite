import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "vitest";

import {
  genKeypair,
  loadOrCreateKeypair,
  muxArgs,
  readRemoteFile,
  remoteIps,
  type Runner,
  runRemote,
  type RunResult,
  sshOpts,
  uploadFile,
} from "../ssh";

const target = { host: "host", user: "root" };

const fakeRunner = (result: RunResult) => {
  const calls: { file: string; args: string[]; input?: string }[] = [];
  const run = async (
    file: string,
    args: string[],
    opts?: { input?: string },
  ) => {
    calls.push({ file, args, input: opts?.input });
    return result;
  };
  return { run, calls };
};

test("runRemote pipes the script into ssh bash -s", async () => {
  const { run, calls } = fakeRunner({ stdout: "", stderr: "", exitCode: 0 });
  await runRemote(target, "echo hi", run);
  expect(calls).toEqual([
    { file: "ssh", args: ["root@host", "bash", "-s"], input: "echo hi" },
  ]);
});

test("runRemote throws with stderr on non-zero exit", async () => {
  const { run } = fakeRunner({ stdout: "", stderr: "boom", exitCode: 1 });
  await expect(runRemote(target, "false", run)).rejects.toThrow(/boom/);
});

test("uploadFile writes content via a remote cat redirect", async () => {
  const { run, calls } = fakeRunner({ stdout: "", stderr: "", exitCode: 0 });
  await uploadFile(target, "FOO=bar", "/srv/app/.env", run);
  expect(calls).toEqual([
    {
      file: "ssh",
      args: ["root@host", "cat > /srv/app/.env"],
      input: "FOO=bar",
    },
  ]);
});

test("uploadFile throws with stderr on non-zero exit", async () => {
  const { run } = fakeRunner({ stdout: "", stderr: "no space", exitCode: 1 });
  await expect(uploadFile(target, "x", "/srv/app/.env", run)).rejects.toThrow(
    /no space/,
  );
});

test("readRemoteFile cats the remote path, tolerating a missing file", async () => {
  const { run, calls } = fakeRunner({
    stdout: "FOO=bar\n",
    stderr: "",
    exitCode: 0,
  });
  expect(await readRemoteFile(target, "/srv/app/.env", run)).toBe("FOO=bar\n");
  expect(calls).toEqual([
    {
      file: "ssh",
      args: [
        "root@host",
        "if [ -e /srv/app/.env ]; then cat /srv/app/.env; else exit 3; fi",
      ],
      input: undefined,
    },
  ]);
});

test("readRemoteFile returns an empty string for a missing file", async () => {
  const { run } = fakeRunner({ stdout: "", stderr: "", exitCode: 0 });
  expect(await readRemoteFile(target, "/srv/app/.env", run)).toBe("");
});

test("readRemoteFile rejects when ssh itself fails, instead of reading as empty", async () => {
  const { run } = fakeRunner({
    stdout: "",
    stderr: "ssh: connect to host host port 22: Connection refused",
    exitCode: 255,
  });
  await expect(readRemoteFile(target, "/srv/app/.env", run)).rejects.toThrow(
    /Connection refused/,
  );
});

test("remoteIps splits hostname -I output on whitespace", async () => {
  const { run, calls } = fakeRunner({
    stdout: "203.0.113.7 10.0.0.2 \n",
    stderr: "",
    exitCode: 0,
  });
  expect(await remoteIps(target, run)).toEqual(["203.0.113.7", "10.0.0.2"]);
  expect(calls).toEqual([
    { file: "ssh", args: ["root@host", "hostname -I"], input: undefined },
  ]);
});

test("remoteIps throws with stderr on non-zero exit", async () => {
  const { run } = fakeRunner({
    stdout: "",
    stderr: "no route to host",
    exitCode: 1,
  });
  await expect(remoteIps(target, run)).rejects.toThrow(/no route to host/);
});

test("genKeypair generates a real ed25519 pair and cleans up its temp dir", async () => {
  const { publicKey, privateKey } = await genKeypair("deploy@next-suite");

  expect(publicKey).toMatch(/^ssh-ed25519 /);
  expect(publicKey.endsWith("deploy@next-suite")).toBe(true);
  expect(privateKey).toContain("PRIVATE KEY");

  const leftover = (await fs.readdir(os.tmpdir())).filter((name) =>
    name.startsWith("ns-ssh-"),
  );
  expect(leftover).toEqual([]);
});

test("loadOrCreateKeypair reuses persisted key files without calling gen", async () => {
  const keyDir = await fs.mkdtemp(path.join(os.tmpdir(), "ns-keys-"));
  try {
    await fs.writeFile(path.join(keyDir, "acme"), "PRIVATE\n", { mode: 0o600 });
    await fs.writeFile(path.join(keyDir, "acme.pub"), "ssh-ed25519 AAA acme\n");
    const gen = async () => {
      throw new Error("gen must not be called when a key is already persisted");
    };

    const result = await loadOrCreateKeypair("acme", { keyDir, gen });

    expect(result).toEqual({
      publicKey: "ssh-ed25519 AAA acme",
      privateKey: "PRIVATE\n",
    });
  } finally {
    await fs.rm(keyDir, { recursive: true, force: true });
  }
});

test("loadOrCreateKeypair generates and persists a new key (mode 600) when none exists", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "ns-keys-"));
  const keyDir = path.join(parent, "nested"); // doesn't exist yet — exercises mkdir
  try {
    const gen = async (comment: string) => ({
      publicKey: `ssh-ed25519 AAA ${comment}`,
      privateKey: "GENERATED\n",
    });

    const result = await loadOrCreateKeypair("acme", { keyDir, gen });

    expect(result.privateKey).toBe("GENERATED\n");
    expect(result.publicKey).toBe("ssh-ed25519 AAA acme@next-suite");

    const stat = await fs.stat(path.join(keyDir, "acme"));
    expect(stat.mode & 0o777).toBe(0o600);
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});

test("muxArgs pools the connections through one private control socket", () => {
  const args = muxArgs();
  expect(args).toContain("ControlMaster=auto");
  expect(args).toContain("ControlPersist=60s");

  const control = args.find((a) => a.startsWith("ControlPath="))!;
  const socket = control.slice("ControlPath=".length);
  expect(path.basename(socket)).toBe("%C");
  expect(socket.startsWith(os.tmpdir())).toBe(true);
  expect(fsSync.statSync(path.dirname(socket)).mode & 0o777).toBe(0o700);
});

test("readRemoteFile tells an absent file apart from an unreadable one", async () => {
  const t = { host: "h", user: "root" };

  const absent: Runner = async () => ({ stdout: "", stderr: "", exitCode: 3 });
  await expect(readRemoteFile(t, "/srv/ports.json", absent)).resolves.toBe("");

  const unreadable: Runner = async () => ({
    stdout: "",
    stderr: "cat: /srv/www/a/.env: Permission denied",
    exitCode: 1,
  });
  await expect(
    readRemoteFile(t, "/srv/www/a/.env", unreadable),
  ).rejects.toThrow(/Permission denied/);
});

test("the ssh options pin host-key checking to accept-new", () => {
  const flat = sshOpts().join(" ");
  expect(flat).toContain("StrictHostKeyChecking=accept-new");
  expect(flat).not.toContain("StrictHostKeyChecking=no");
});

test("the control socket path stays inside the unix socket length limit", () => {
  const path = sshOpts()
    .join(" ")
    .match(/ControlPath=(\S+)/)?.[1];
  expect(path).toBeDefined();
  const worstCase = (path ?? "").replace("%C", "x".repeat(40));
  expect(worstCase.length).toBeLessThan(80);
});
