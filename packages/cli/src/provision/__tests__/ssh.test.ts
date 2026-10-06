import { expect, test } from "vitest";

import {
  listRemoteIps,
  readRemoteFile,
  type Runner,
  runRemote,
  type RunResult,
  uploadFile,
} from "../ssh";

const target = { host: "host", user: "root" };

const fakeRunner = (result: RunResult) => {
  const calls: { file: string; args: string[]; input?: string }[] = [];
  const run = (file: string, args: string[], options?: { input?: string }) => {
    calls.push({ file, args, input: options?.input });
    return Promise.resolve(result);
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
  await uploadFile(target, { path: "/srv/app/.env", content: "FOO=bar" }, run);
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
  await expect(
    uploadFile(target, { path: "/srv/app/.env", content: "x" }, run),
  ).rejects.toThrow(/no space/);
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

test("listRemoteIps splits hostname -I output on whitespace", async () => {
  const { run, calls } = fakeRunner({
    stdout: "203.0.113.7 10.0.0.2 \n",
    stderr: "",
    exitCode: 0,
  });
  expect(await listRemoteIps(target, run)).toEqual(["203.0.113.7", "10.0.0.2"]);
  expect(calls).toEqual([
    { file: "ssh", args: ["root@host", "hostname -I"], input: undefined },
  ]);
});

test("listRemoteIps throws with stderr on non-zero exit", async () => {
  const { run } = fakeRunner({
    stdout: "",
    stderr: "no route to host",
    exitCode: 1,
  });
  await expect(listRemoteIps(target, run)).rejects.toThrow(/no route to host/);
});

test("readRemoteFile tells an absent file apart from an unreadable one", async () => {
  const probeTarget = { host: "h", user: "root" };

  const absent: Runner = () =>
    Promise.resolve({ stdout: "", stderr: "", exitCode: 3 });
  await expect(
    readRemoteFile(probeTarget, "/srv/ports.json", absent),
  ).resolves.toBe("");

  const unreadable: Runner = () =>
    Promise.resolve({
      stdout: "",
      stderr: "cat: /srv/www/a/.env: Permission denied",
      exitCode: 1,
    });
  await expect(
    readRemoteFile(probeTarget, "/srv/www/a/.env", unreadable),
  ).rejects.toThrow(/Permission denied/);
});
