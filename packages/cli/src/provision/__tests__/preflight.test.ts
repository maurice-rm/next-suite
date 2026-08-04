import fs from "node:fs";
import path from "node:path";

import { expect, test } from "vitest";

import { remoteChecks, runPreflight } from "../preflight";
import type { Runner, RunResult } from "../ssh";

const target = { host: "host", user: "root" };
const ok: RunResult = { stdout: "", stderr: "", exitCode: 0 };
const failed: RunResult = { stdout: "", stderr: "no", exitCode: 1 };

const scriptedRunner = (failWhen: (script: string) => boolean): Runner => {
  return async (_file, args) => {
    const script = args[1] ?? "";
    return failWhen(script) ? failed : ok;
  };
};

test("remoteChecks lists the 9 baseline checks in order", () => {
  expect(remoteChecks().map((c) => c.name)).toEqual([
    "root",
    "nginx",
    "certbot",
    "docker",
    "webroot",
    "dhparams",
    "options-ssl",
    "renewal-hook",
    "tls-catch-all",
  ]);
});

test("remoteChecks fail messages instruct how to fix each baseline gap", () => {
  const messages = remoteChecks()
    .map((c) => c.fail)
    .join("\n");
  expect(messages).toContain("/var/www/certbot");
  expect(messages).toContain("ssl-dhparams.pem");
  expect(messages).toContain("options-ssl-nginx.conf");
  expect(messages).toContain("renewal-hooks/deploy");
  expect(messages).toContain("docker compose");
  expect(messages).toContain("without sudo");
});

test("every doc section a fail message points at actually exists", () => {
  const guide = fs.readFileSync(
    path.join(
      import.meta.dirname,
      "../../../../../docs/server-requirements.md",
    ),
    "utf8",
  );
  const captured = (source: string, re: RegExp): string[] =>
    [...source.matchAll(re)]
      .map((m) => m[1])
      .filter((value): value is string => value !== undefined);

  const headings = captured(guide, /^#{2,3} (.+)$/gm).map((h) =>
    h.replaceAll("`", "").trim(),
  );

  const messages = remoteChecks()
    .map((c) => c.fail)
    .join("\n");
  const referenced = captured(
    messages,
    /See "([^"]+)" in docs\/server-requirements\.md/g,
  );

  expect(referenced.length).toBeGreaterThan(0);
  for (const section of referenced) expect(headings).toContain(section);

  expect(messages).not.toMatch(/step \d+/i);
  expect(messages).not.toMatch(/README/i);
});

test("runPreflight resolves when every remote check passes", async () => {
  const run = scriptedRunner(() => false);
  await expect(runPreflight(target, run)).resolves.toBeUndefined();
});

test("runPreflight throws listing every failed check", async () => {
  const run = scriptedRunner(
    (script) =>
      script.includes("/var/www/certbot") || script.includes("renewal-hooks"),
  );
  await expect(runPreflight(target, run)).rejects.toThrow("/var/www/certbot");
  await expect(runPreflight(target, run)).rejects.toThrow(
    "renewal-hooks/deploy",
  );
});

test("runPreflight throws a reachability error and skips checks when ssh itself fails", async () => {
  const state = { calls: 0 };
  const run: Runner = async () => {
    state.calls += 1;
    return failed;
  };
  await expect(runPreflight(target, run)).rejects.toThrow(/Cannot reach/);
  expect(state.calls).toBe(1);
});
