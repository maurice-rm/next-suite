import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test } from "vitest";

import {
  buildMultiplexingArgs,
  buildSshOptions,
  createControlDirectory,
} from "../ssh-options";

test("buildMultiplexingArgs pools the connections through one private control socket", () => {
  const args = buildMultiplexingArgs(createControlDirectory());
  expect(args).toContain("ControlMaster=auto");
  expect(args).toContain("ControlPersist=60s");

  const control = args.find((arg) => arg.startsWith("ControlPath=")) ?? "";
  const socket = control.slice("ControlPath=".length);
  expect(path.basename(socket)).toBe("%C");
  expect(socket.startsWith(os.tmpdir())).toBe(true);
  expect(fs.statSync(path.dirname(socket)).mode & 0o777).toBe(0o700);
});

test("the ssh options pin host-key checking to accept-new", () => {
  const flat = buildSshOptions(createControlDirectory()).join(" ");
  expect(flat).toContain("StrictHostKeyChecking=accept-new");
  expect(flat).not.toContain("StrictHostKeyChecking=no");
});

test("the control socket path stays inside the unix socket length limit", () => {
  const socketPath = /ControlPath=(\S+)/.exec(
    buildSshOptions(createControlDirectory()).join(" "),
  )?.[1];
  expect(socketPath).toBeDefined();
  const worstCase = (socketPath ?? "").replace("%C", "x".repeat(40));
  expect(worstCase.length).toBeLessThan(80);
});

test("without a control directory the ssh options skip multiplexing", () => {
  expect(buildSshOptions()).toEqual(["-o", "StrictHostKeyChecking=accept-new"]);
});
