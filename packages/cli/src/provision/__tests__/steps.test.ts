import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "vitest";

import type { ProjectManifest } from "@/generator/manifest";

import { type GhEntry, shQuote } from "../commands";
import type { GlobalConfig } from "../config";
import { loadOrCreateKeypair, type Runner, type RunResult } from "../ssh";
import { formatManualChecklist, parseSsPorts, runProvision } from "../steps";

const dest = "root@vps.example.com";
const domain = "acme.example.com";

const manifest: ProjectManifest = {
  version: 1,
  name: "acme",
  packageManager: "pnpm",
  auth: "none",
  email: "none",
  githubActions: [],
  production: { mode: "proxied" },
};

const dbAuthManifest: ProjectManifest = {
  ...manifest,
  database: { engine: "postgres", orm: "drizzle" },
  auth: "better-auth",
};

const config: GlobalConfig = {
  host: "vps.example.com",
  adminUser: "root",
  certbotEmail: "me@x.io",
};

const ENV_EXAMPLE = `COMPOSE_PROJECT_NAME=acme

# Production image for docker-compose.prod.yml. Leave unset to build locally;
# set to ghcr.io/OWNER/REPO:TAG to pull a prebuilt image instead.
DOCKER_IMAGE=
`;

// Matches dbAuthManifest: postgres + better-auth. 9 keys + the inserted APP_PORT = 10.
const DB_AUTH_ENV_EXAMPLE = `COMPOSE_PROJECT_NAME=acme

POSTGRES_PORT=5432
POSTGRES_HOST=localhost
POSTGRES_USER=next
POSTGRES_PASSWORD=next
POSTGRES_DATABASE=acme

NEXT_PUBLIC_APP_URL=http://localhost:3000

BETTER_AUTH_SECRET=insecure-dev-secret-change-me-32chars!

# Production image for docker-compose.prod.yml. Leave unset to build locally;
# set to ghcr.io/OWNER/REPO:TAG to pull a prebuilt image instead.
DOCKER_IMAGE=
`;

const FAKE_PRIVATE_KEY =
  "-----BEGIN OPENSSH PRIVATE KEY-----\nFAKE\n-----END OPENSSH PRIVATE KEY-----\n";

const genKeypair = async () => ({
  publicKey: "ssh-ed25519 AAAAKEY acme@vps.example.com",
  privateKey: FAKE_PRIVATE_KEY,
});

const ok = (stdout = ""): RunResult => ({ stdout, stderr: "", exitCode: 0 });

const buildRun = (opts: {
  certExitCode: number;
  certbotExitCode?: number;
  ssOutput?: string;
  hostnameIps?: string;
}) => {
  const calls: { args: string[]; input?: string }[] = [];
  const run: Runner = async (_file, args, runOpts) => {
    calls.push({ args, input: runOpts?.input });
    const cmd = args[1];
    if (cmd === "ss -ltn") return ok(opts.ssOutput ?? "");
    if (cmd === "hostname -I") return ok(opts.hostnameIps ?? "203.0.113.7");
    if (cmd === `test -f /etc/letsencrypt/live/${domain}/fullchain.pem`) {
      return { stdout: "", stderr: "", exitCode: opts.certExitCode };
    }
    if (runOpts?.input?.includes("certonly")) {
      return { stdout: "", stderr: "", exitCode: opts.certbotExitCode ?? 0 };
    }
    return ok("");
  };
  return { run, calls };
};

const fakeGh = () => {
  const calls: { args: string[]; input?: string }[] = [];
  const gh = async (args: string[], input?: string) => {
    calls.push({ args, input });
  };
  return { gh, calls };
};

test("parseSsPorts reads the trailing port off the Local Address:Port column", () => {
  const output = `State   Recv-Q Send-Q Local Address:Port  Peer Address:Port
LISTEN  0      128    0.0.0.0:8100        0.0.0.0:*
LISTEN  0      128    [::]:8100           [::]:*
LISTEN  0      128    127.0.0.1:5432      0.0.0.0:*
`;
  expect(parseSsPorts(output)).toEqual([8100, 5432]);
});

test("a resolved repo pins every gh call, so the key cannot land in another repository", async () => {
  const { run } = buildRun({ certExitCode: 0 });
  const { gh, calls: ghCalls } = fakeGh();
  const lookup = async () => ["203.0.113.7"];

  await runProvision(
    manifest,
    config,
    domain,
    ENV_EXAMPLE,
    { staging: false, skipGithub: false, repo: "acme-org/acme" },
    { run, gh, lookup, genKeypair },
  );

  expect(ghCalls.length).toBeGreaterThan(0);
  for (const c of ghCalls) {
    expect(c.args.slice(-2)).toEqual(["--repo", "acme-org/acme"]);
  }
});

test("fresh domain with DNS already pointing: bootstrap, then cert, then the full block", async () => {
  const { run, calls } = buildRun({ certExitCode: 1 });
  const { gh, calls: ghCalls } = fakeGh();
  const lookup = async () => ["203.0.113.7"];

  const { log, certReady } = await runProvision(
    manifest,
    config,
    domain,
    ENV_EXAMPLE,
    { staging: false, skipGithub: false },
    { run, gh, lookup, genKeypair },
  );

  const sshCalls = calls.filter((c) => c.args[0] === dest);
  const serverIdx = sshCalls.findIndex((c) => c.input?.includes("useradd"));
  const envInstallIdx = sshCalls.findIndex((c) =>
    c.input?.includes(
      "install -m 600 -o acme -g acme /dev/null /srv/www/acme/.env",
    ),
  );
  const envIdx = sshCalls.findIndex(
    (c) => c.args[1] === "cat > /srv/www/acme/.env.tmp",
  );
  const envRenameIdx = sshCalls.findIndex((c) =>
    c.input?.includes("mv /srv/www/acme/.env.tmp /srv/www/acme/.env"),
  );
  const bootstrapIdx = sshCalls.findIndex((c) =>
    c.input?.includes("return 404;"),
  );
  const certbotIdx = sshCalls.findIndex((c) => c.input?.includes("certonly"));
  const fullBlockIdx = sshCalls.findIndex((c) =>
    c.input?.includes("listen      443 ssl"),
  );

  expect(serverIdx).toBeGreaterThanOrEqual(0);
  expect(envInstallIdx).toBeGreaterThan(serverIdx);
  expect(envIdx).toBeGreaterThan(envInstallIdx);
  expect(envRenameIdx).toBeGreaterThan(envIdx);
  expect(bootstrapIdx).toBeGreaterThan(envRenameIdx);
  expect(certbotIdx).toBeGreaterThan(bootstrapIdx);
  expect(fullBlockIdx).toBeGreaterThan(certbotIdx);

  expect(ghCalls.map((c) => c.args[2])).toEqual([
    "DEPLOY_SSH_KEY",
    "DEPLOY_SSH_HOST",
    "DEPLOY_SSH_USER",
    "DEPLOY_PATH",
  ]);
  expect(ghCalls[0]).toEqual({
    args: ["secret", "set", "DEPLOY_SSH_KEY"],
    input: FAKE_PRIVATE_KEY,
  });
  expect(ghCalls.every((c) => !c.args.includes("--repo"))).toBe(true);

  expect(log.join("\n")).toContain("TLS: certificate obtained");
  expect(certReady).toBe(true);
});

test("onStepStart fires before each slow phase, paired ahead of its onStep completion", async () => {
  const { run } = buildRun({ certExitCode: 1 });
  const { gh } = fakeGh();
  const lookup = async () => ["203.0.113.7"];
  const events: string[] = [];

  await runProvision(
    manifest,
    config,
    domain,
    ENV_EXAMPLE,
    { staging: false, skipGithub: false },
    {
      run,
      gh,
      lookup,
      genKeypair,
      onStepStart: (label) => events.push(`start:${label}`),
      onStep: (line) => events.push(`step:${line}`),
    },
  );

  const idx = (needle: string) => events.findIndex((e) => e.includes(needle));

  expect(idx("start:Setting up server user…")).toBeGreaterThanOrEqual(0);
  expect(idx("start:Setting up server user…")).toBeLessThan(
    idx("step:Server: user"),
  );
  expect(idx("start:Scanning ports…")).toBeLessThan(
    idx("step:Port 8100 assigned"),
  );
  expect(idx("start:Uploading .env…")).toBeLessThan(idx("step:.env:"));
  expect(
    idx("start:Requesting TLS certificate (can take a minute)…"),
  ).toBeLessThan(idx("step:TLS: certificate obtained"));
  expect(idx("start:Setting GitHub secrets…")).toBeLessThan(
    idx("step:GitHub:"),
  );
  expect(
    events.filter((e) => e === "start:Writing nginx config…"),
  ).toHaveLength(2);
});

test("onStep receives every step line, in the same order as the returned log", async () => {
  const { run } = buildRun({ certExitCode: 1 });
  const { gh } = fakeGh();
  const lookup = async () => ["203.0.113.7"];
  const stepped: string[] = [];

  const { log } = await runProvision(
    manifest,
    config,
    domain,
    ENV_EXAMPLE,
    { staging: false, skipGithub: false },
    { run, gh, lookup, genKeypair, onStep: (line) => stepped.push(line) },
  );

  expect(stepped).toEqual(log);
});

test("the log is compact — no raw script bodies (useradd / NGINX_EOF)", async () => {
  const { run } = buildRun({ certExitCode: 1 });
  const { gh } = fakeGh();
  const lookup = async () => ["203.0.113.7"];

  const { log } = await runProvision(
    manifest,
    config,
    domain,
    ENV_EXAMPLE,
    { staging: false, skipGithub: false },
    { run, gh, lookup, genKeypair },
  );

  const text = log.join("\n");
  expect(text).not.toContain("useradd");
  expect(text).not.toContain("NGINX_EOF");
});

test("uploaded .env reflects the derived values (postgres host, generated secrets, inserted APP_PORT) and the pre-create still runs", async () => {
  const { run, calls } = buildRun({ certExitCode: 0 });
  const { gh } = fakeGh();
  const lookup = async () => ["203.0.113.7"];

  await runProvision(
    dbAuthManifest,
    config,
    domain,
    DB_AUTH_ENV_EXAMPLE,
    { staging: false, skipGithub: false },
    { run, gh, lookup, genKeypair },
  );

  const sshCalls = calls.filter((c) => c.args[0] === dest);
  const envUpload = sshCalls.find(
    (c) => c.args[1] === "cat > /srv/www/acme/.env.tmp",
  );

  expect(envUpload?.input).toContain("POSTGRES_HOST=postgres");
  expect(envUpload?.input).not.toContain("POSTGRES_HOST=localhost");
  expect(envUpload?.input).toMatch(/POSTGRES_PASSWORD=[A-Za-z0-9_-]{40,}/);
  expect(envUpload?.input).toContain("APP_PORT=8100");

  const installCall = sshCalls.find((c) =>
    c.input?.includes(
      "install -m 600 -o acme -g acme /dev/null /srv/www/acme/.env",
    ),
  );
  expect(installCall).toBeDefined();
});

test(".env line reports upload/kept counts for a postgres+better-auth manifest with an empty existing .env", async () => {
  const { run } = buildRun({ certExitCode: 0 });
  const { gh } = fakeGh();
  const lookup = async () => ["203.0.113.7"];

  const { log } = await runProvision(
    dbAuthManifest,
    config,
    domain,
    DB_AUTH_ENV_EXAMPLE,
    { staging: false, skipGithub: false },
    { run, gh, lookup, genKeypair },
  );

  expect(log.join("\n")).toContain(".env: 10 keys uploaded (0 kept)");
});

test(".env line reports the full upload count (not just the delta) when some desired keys already exist", async () => {
  const { run: base } = buildRun({ certExitCode: 0 });
  const existingEnvContent =
    "COMPOSE_PROJECT_NAME=acme\nAPP_PORT=8100\nPOSTGRES_PASSWORD=alreadyset\n";
  const run: Runner = async (file, args, runOpts) => {
    if (
      args[1] ===
      "if [ -e /srv/www/acme/.env ]; then cat /srv/www/acme/.env; else exit 3; fi"
    ) {
      return ok(existingEnvContent);
    }
    return base(file, args, runOpts);
  };
  const { gh } = fakeGh();
  const lookup = async () => ["203.0.113.7"];

  const { log } = await runProvision(
    dbAuthManifest,
    config,
    domain,
    DB_AUTH_ENV_EXAMPLE,
    { staging: false, skipGithub: false },
    { run, gh, lookup, genKeypair },
  );

  expect(log.join("\n")).toContain(".env: 10 keys uploaded (3 kept)");
});

test(".env warns when the existing NEXT_PUBLIC_APP_URL doesn't match the new domain", async () => {
  const { run: base } = buildRun({ certExitCode: 0 });
  const existingEnvContent =
    "COMPOSE_PROJECT_NAME=acme\nAPP_PORT=8100\nNEXT_PUBLIC_APP_URL=https://old.example.com\n";
  const run: Runner = async (file, args, runOpts) => {
    if (
      args[1] ===
      "if [ -e /srv/www/acme/.env ]; then cat /srv/www/acme/.env; else exit 3; fi"
    ) {
      return ok(existingEnvContent);
    }
    return base(file, args, runOpts);
  };
  const { gh } = fakeGh();
  const lookup = async () => ["203.0.113.7"];

  const { log } = await runProvision(
    manifest,
    config,
    domain,
    ENV_EXAMPLE,
    { staging: false, skipGithub: false },
    { run, gh, lookup, genKeypair },
  );

  expect(log.join("\n")).toContain(
    "⚠ .env keeps NEXT_PUBLIC_APP_URL=https://old.example.com (not https://acme.example.com) — edit it on the server if the domain changed",
  );
});

test(".env does not warn when the existing NEXT_PUBLIC_APP_URL already matches the new domain", async () => {
  const { run: base } = buildRun({ certExitCode: 0 });
  const existingEnvContent = `COMPOSE_PROJECT_NAME=acme\nAPP_PORT=8100\nNEXT_PUBLIC_APP_URL=https://${domain}\n`;
  const run: Runner = async (file, args, runOpts) => {
    if (
      args[1] ===
      "if [ -e /srv/www/acme/.env ]; then cat /srv/www/acme/.env; else exit 3; fi"
    ) {
      return ok(existingEnvContent);
    }
    return base(file, args, runOpts);
  };
  const { gh } = fakeGh();
  const lookup = async () => ["203.0.113.7"];

  const { log } = await runProvision(
    manifest,
    config,
    domain,
    ENV_EXAMPLE,
    { staging: false, skipGithub: false },
    { run, gh, lookup, genKeypair },
  );

  expect(log.join("\n")).not.toContain("keeps NEXT_PUBLIC_APP_URL");
});

test("cert already on disk: no bootstrap, no certbot, full block written directly", async () => {
  const { run, calls } = buildRun({ certExitCode: 0 });
  const { gh } = fakeGh();
  let lookupCalls = 0;
  const lookup = async () => {
    lookupCalls += 1;
    return [];
  };

  const { certReady } = await runProvision(
    manifest,
    config,
    domain,
    ENV_EXAMPLE,
    { staging: false, skipGithub: false },
    { run, gh, lookup, genKeypair },
  );

  const inputs = calls.map((c) => c.input ?? "").join("\n");
  expect(inputs).not.toContain("return 404;");
  expect(inputs).not.toContain("certonly");
  expect(inputs).toContain("listen      443 ssl");
  expect(lookupCalls).toBe(0);
  expect(certReady).toBe(true);
});

test("an existing staging certificate is reissued for real, forced past certbot's not-due-for-renewal", async () => {
  const { run: base, calls } = buildRun({ certExitCode: 0 });
  const run: Runner = async (file, args, opts) => {
    if (args[1]?.startsWith("openssl x509 -noout -issuer")) {
      calls.push({ args, input: opts?.input });
      return {
        stdout:
          "issuer=C = US, O = (STAGING) Let's Encrypt, CN = (STAGING) Pretend Pear X1",
        stderr: "",
        exitCode: 0,
      };
    }
    return base(file, args, opts);
  };
  const { gh } = fakeGh();

  const { certReady, log } = await runProvision(
    manifest,
    config,
    domain,
    ENV_EXAMPLE,
    { staging: false, skipGithub: false },
    { run, gh, lookup: async () => ["203.0.113.7"], genKeypair },
  );

  const certbotCall = calls.find((c) => c.input?.includes("certonly"));
  expect(certbotCall?.input).toContain("--force-renewal");
  expect(certbotCall?.input).not.toContain("--staging");
  expect(log.join("\n")).toContain("staging certificate found");
  expect(certReady).toBe(true);
});

test("a production certificate is left alone — no issuer-driven reissue", async () => {
  const { run: base, calls } = buildRun({ certExitCode: 0 });
  const run: Runner = async (file, args, opts) =>
    args[1]?.startsWith("openssl x509 -noout -issuer")
      ? {
          stdout: "issuer=C = US, O = Let's Encrypt, CN = R11",
          stderr: "",
          exitCode: 0,
        }
      : base(file, args, opts);
  const { gh } = fakeGh();

  await runProvision(
    manifest,
    config,
    domain,
    ENV_EXAMPLE,
    { staging: false, skipGithub: false },
    { run, gh, lookup: async () => [], genKeypair },
  );

  expect(calls.map((c) => c.input ?? "").join("\n")).not.toContain("certonly");
});

test("a cert already on disk skips the bootstrap/certbot spinners and starts the nginx write once", async () => {
  const { run } = buildRun({ certExitCode: 0 });
  const { gh } = fakeGh();
  let lookupCalls = 0;
  const lookup = async () => {
    lookupCalls += 1;
    return [];
  };
  const starts: string[] = [];

  await runProvision(
    manifest,
    config,
    domain,
    ENV_EXAMPLE,
    { staging: false, skipGithub: false },
    { run, gh, lookup, genKeypair, onStepStart: (label) => starts.push(label) },
  );

  expect(lookupCalls).toBe(0);
  expect(starts).not.toContain(
    "Requesting TLS certificate (can take a minute)…",
  );
  expect(starts.filter((l) => l === "Writing nginx config…")).toHaveLength(1);
});

test("certbot failure defers TLS: bootstrap kept, full block not written, provision continues", async () => {
  const { run, calls } = buildRun({ certExitCode: 1, certbotExitCode: 1 });
  const { gh, calls: ghCalls } = fakeGh();
  const lookup = async () => ["203.0.113.7"];

  const { log, certReady } = await runProvision(
    manifest,
    config,
    domain,
    ENV_EXAMPLE,
    { staging: false, skipGithub: false },
    { run, gh, lookup, genKeypair },
  );

  const inputs = calls.map((c) => c.input ?? "").join("\n");
  expect(inputs).toContain("return 404;");
  expect(inputs).toContain("certonly");
  expect(inputs).not.toContain("listen      443 ssl http2");
  expect(log.join("\n")).toMatch(/TLS: deferred/);
  expect(log.join("\n")).toMatch(/re-run after DNS/);
  expect(ghCalls.length).toBeGreaterThan(0);
  expect(certReady).toBe(false);
});

const runWithExistingConf = (confDomain: string, certbotExitCode: number) => {
  const { run: base, calls } = buildRun({ certExitCode: 1, certbotExitCode });
  const existing = `server {\n    listen      80;\n    server_name ${confDomain};\n\n    location / {\n        proxy_pass http://127.0.0.1:8100;\n    }\n}`;
  const run: Runner = async (file, args, runOpts) => {
    if (
      args[1] ===
      `if [ -e /etc/nginx/conf.d/acme.conf ]; then cat /etc/nginx/conf.d/acme.conf; else exit 3; fi`
    ) {
      return ok(existing);
    }
    return base(file, args, runOpts);
  };
  return { run, calls, existing };
};

test("a config already serving the domain is left in place — no bootstrap overwrites the live vhost", async () => {
  const { run, calls } = runWithExistingConf(domain, 0);
  const { gh } = fakeGh();
  const lookup = async () => ["203.0.113.7"];

  const { log } = await runProvision(
    manifest,
    config,
    domain,
    ENV_EXAMPLE,
    { staging: false, skipGithub: false },
    { run, gh, lookup, genKeypair },
  );

  const inputs = calls.map((c) => c.input ?? "").join("\n");
  expect(inputs).not.toContain("return 404;");
  expect(inputs).toContain("certonly");
  expect(inputs).toContain("listen      443 ssl http2");
  expect(log.join("\n")).toMatch(/left in place/);
});

test("certbot failure after a domain change restores the previous vhost instead of leaving a 404 block", async () => {
  const { run, calls, existing } = runWithExistingConf("old.example.com", 1);
  const { gh } = fakeGh();
  const lookup = async () => ["203.0.113.7"];

  const { log, certReady } = await runProvision(
    manifest,
    config,
    domain,
    ENV_EXAMPLE,
    { staging: false, skipGithub: false },
    { run, gh, lookup, genKeypair },
  );

  const written = calls
    .map((c) => c.input ?? "")
    .filter((i) => i.includes("conf=/etc/nginx/conf.d/acme.conf"));
  expect(written[0]).toContain("return 404;");
  expect(written.at(-1)).toContain("server_name old.example.com;");
  expect(written.at(-1)).toContain(`${existing}\nNGINX_EOF`);
  expect(log.join("\n")).toMatch(/previous nginx config restored/);
  expect(certReady).toBe(false);
});

test("DNS mismatch is only advisory: certbot still runs and a success writes the full block", async () => {
  const { run, calls } = buildRun({ certExitCode: 1, certbotExitCode: 0 });
  const { gh } = fakeGh();
  const lookup = async () => ["198.51.100.9"]; // does not match the server's IP
  const events: string[] = [];

  const { log } = await runProvision(
    manifest,
    config,
    domain,
    ENV_EXAMPLE,
    { staging: false, skipGithub: false },
    {
      run,
      gh,
      lookup,
      genKeypair,
      onStepStart: (label) => events.push(`start:${label}`),
      onStep: (line) => events.push(`step:${line}`),
    },
  );

  const inputs = calls.map((c) => c.input ?? "").join("\n");
  expect(inputs).toContain("certonly");
  expect(inputs).toContain("listen      443 ssl http2");
  expect(log.join("\n")).toMatch(/does not resolve/);

  const bootstrapStart = events.indexOf("start:Writing nginx config…");
  expect(events[bootstrapStart + 1]).toBe(
    "step:nginx: bootstrap config written",
  );
  const warningIdx = events.findIndex((e) => e.includes("does not resolve"));
  expect(warningIdx).toBeGreaterThan(bootstrapStart + 1);
});

test("--staging appends the certbot staging flag", async () => {
  const { run, calls } = buildRun({ certExitCode: 1 });
  const { gh } = fakeGh();
  const lookup = async () => ["203.0.113.7"];

  await runProvision(
    manifest,
    config,
    domain,
    ENV_EXAMPLE,
    { staging: true, skipGithub: false },
    { run, gh, lookup, genKeypair },
  );

  const certbotCall = calls.find((c) => c.input?.includes("certonly"));
  expect(certbotCall?.input).toContain("--staging");
});

test("--skip-github never calls gh and renders the manual checklist as one block, not step lines", async () => {
  const { run } = buildRun({ certExitCode: 0 });
  let ghCalls = 0;
  const gh = async () => {
    ghCalls += 1;
  };
  const lookup = async () => ["203.0.113.7"];
  const stepped: string[] = [];
  const blocks: { title: string; body: string }[] = [];

  const { log } = await runProvision(
    manifest,
    config,
    domain,
    ENV_EXAMPLE,
    { staging: false, skipGithub: true },
    {
      run,
      gh,
      lookup,
      genKeypair,
      onStep: (line) => stepped.push(line),
      onBlock: (title, body) => blocks.push({ title, body }),
    },
  );

  expect(ghCalls).toBe(0);
  const text = log.join("\n");
  expect(text).toContain("DEPLOY_SSH_KEY");
  expect(text).toContain(FAKE_PRIVATE_KEY);

  expect(
    stepped.some((line) => line.includes("BEGIN OPENSSH PRIVATE KEY")),
  ).toBe(false);

  expect(blocks).toHaveLength(1);
  const [block] = blocks;
  if (!block) throw new Error("expected one block");
  expect(block.title).toContain("Skipped GitHub config (--skip-github)");
  expect(block.body).toContain("DEPLOY_SSH_KEY");
  expect(block.body).toContain("BEGIN OPENSSH PRIVATE KEY");
});

test("formatManualChecklist: a multi-line value gets its own label line; single-line values render inline", () => {
  const entries: GhEntry[] = [
    { kind: "secret", name: "DEPLOY_SSH_KEY", value: FAKE_PRIVATE_KEY },
    { kind: "secret", name: "DEPLOY_SSH_HOST", value: "vps.example.com" },
    { kind: "variable", name: "DEPLOY_PATH", value: "/srv/www/acme" },
  ];

  expect(formatManualChecklist(entries)).toBe(
    [
      "secret DEPLOY_SSH_KEY:",
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "FAKE",
      "-----END OPENSSH PRIVATE KEY-----",
      "",
      "secret DEPLOY_SSH_HOST: vps.example.com",
      "variable DEPLOY_PATH: /srv/www/acme",
    ].join("\n"),
  );
});

test("shQuote wraps in single quotes and escapes an embedded quote", () => {
  expect(shQuote("plain")).toBe("'plain'");
  expect(shQuote("a'b")).toBe("'a'\\''b'");
});

test("certbot invocation shell-quotes every argument, so an embedded quote in the email can't break out", async () => {
  const { run, calls } = buildRun({ certExitCode: 1 });
  const { gh } = fakeGh();
  const lookup = async () => ["203.0.113.7"];
  const evilConfig: GlobalConfig = {
    ...config,
    certbotEmail: "a'; touch pwned #@x.io",
  };

  await runProvision(
    manifest,
    evilConfig,
    domain,
    ENV_EXAMPLE,
    { staging: false, skipGithub: false },
    { run, gh, lookup, genKeypair },
  );

  const certbotCall = calls.find((c) => c.input?.includes("certonly"));
  const expected = [
    "certbot",
    "certonly",
    "--webroot",
    "-w",
    "/var/www/certbot",
    "-d",
    domain,
    "--non-interactive",
    "--agree-tos",
    "-m",
    evilConfig.certbotEmail,
  ]
    .map(shQuote)
    .join(" ");
  expect(certbotCall?.input).toBe(expected);
});

test("ss -ltn failure aborts port allocation instead of silently proceeding", async () => {
  const { run: base } = buildRun({ certExitCode: 0 });
  const run: Runner = async (file, args, runOpts) => {
    if (args[1] === "ss -ltn") {
      return { stdout: "", stderr: "ss: not found", exitCode: 127 };
    }
    return base(file, args, runOpts);
  };
  const { gh } = fakeGh();
  const lookup = async () => ["203.0.113.7"];

  await expect(
    runProvision(
      manifest,
      config,
      domain,
      ENV_EXAMPLE,
      { staging: false, skipGithub: false },
      { run, gh, lookup, genKeypair },
    ),
  ).rejects.toThrow(/ss -ltn/);
});

test("a failed .env pre-create rejects the whole provision run and never uploads the secrets", async () => {
  const { run: base } = buildRun({ certExitCode: 0 });
  const calls: { args: string[]; input?: string }[] = [];
  const run: Runner = async (file, args, runOpts) => {
    calls.push({ args, input: runOpts?.input });
    if (
      runOpts?.input?.includes(
        "install -m 600 -o acme -g acme /dev/null /srv/www/acme/.env",
      )
    ) {
      return { stdout: "", stderr: "install: no such user", exitCode: 1 };
    }
    return base(file, args, runOpts);
  };
  const { gh } = fakeGh();
  const lookup = async () => ["203.0.113.7"];

  await expect(
    runProvision(
      manifest,
      config,
      domain,
      ENV_EXAMPLE,
      { staging: false, skipGithub: false },
      { run, gh, lookup, genKeypair },
    ),
  ).rejects.toThrow(/install: no such user/);

  expect(calls.some((c) => c.args[1] === "cat > /srv/www/acme/.env.tmp")).toBe(
    false,
  );
});

test("runProvision reuses the persisted deploy key and the allocated port on a second run", async () => {
  const keyDir = await fs.mkdtemp(path.join(os.tmpdir(), "ns-keys-"));
  try {
    let genCalls = 0;
    const gen = async (comment: string) => {
      genCalls += 1;
      return {
        publicKey: `ssh-ed25519 AAAAKEY ${comment}`,
        privateKey: FAKE_PRIVATE_KEY,
      };
    };
    const keypair = (name: string) =>
      loadOrCreateKeypair(name, { keyDir, gen });

    let portsJson = "";
    let portsStaged = "";
    const run: Runner = async (_file, args, runOpts) => {
      const cmd = args[1];
      if (
        cmd ===
        "if [ -e /srv/ports.json ]; then cat /srv/ports.json; else exit 3; fi"
      )
        return ok(portsJson);
      if (cmd === "cat > /srv/ports.json.tmp") {
        portsStaged = runOpts?.input ?? "";
        return ok("");
      }
      if (runOpts?.input?.trim() === "mv /srv/ports.json.tmp /srv/ports.json") {
        portsJson = portsStaged;
        return ok("");
      }
      if (cmd === `test -f /etc/letsencrypt/live/${domain}/fullchain.pem`) {
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      return ok("");
    };
    const { gh } = fakeGh();
    const lookup = async () => ["203.0.113.7"];
    const call = () =>
      runProvision(
        manifest,
        config,
        domain,
        ENV_EXAMPLE,
        { staging: false, skipGithub: false },
        { run, gh, lookup, genKeypair: keypair },
      );

    const { log: log1 } = await call();
    const { log: log2 } = await call();

    expect(genCalls).toBe(1);
    expect(log1.join("\n")).toMatch(/Port 8100 assigned/);
    expect(log2.join("\n")).toMatch(/Port 8100 reused/);
  } finally {
    await fs.rm(keyDir, { recursive: true, force: true });
  }
});

test("a domain already served by another project aborts before anything is written", async () => {
  const calls: { args: string[]; input?: string }[] = [];
  const run: Runner = async (_file, args, opts) => {
    calls.push({ args, input: opts?.input });
    if (args[1]?.startsWith("grep -lE 'server_name"))
      return {
        stdout: "/etc/nginx/conf.d/other.conf\n",
        stderr: "",
        exitCode: 0,
      };
    return { stdout: "", stderr: "", exitCode: 0 };
  };

  await expect(
    runProvision(
      manifest,
      config,
      domain,
      ENV_EXAMPLE,
      { staging: false, skipGithub: false },
      {
        run,
        gh: async () => {},
        genKeypair: async () => ({
          publicKey: "ssh-ed25519 AAA",
          privateKey: "KEY",
        }),
      },
    ),
  ).rejects.toThrow(/already served by \/etc\/nginx\/conf\.d\/other\.conf/);

  const wrote = calls.some(
    (c) =>
      c.input?.includes("useradd") ||
      c.args[1]?.startsWith("cat > ") ||
      c.input?.includes("/etc/nginx/conf.d"),
  );
  expect(wrote).toBe(false);
});

test("this project's own conf serving the domain is not a conflict (re-run)", async () => {
  const run: Runner = async (_file, args) => {
    if (args[1]?.startsWith("grep -lE 'server_name"))
      return {
        stdout: "/etc/nginx/conf.d/acme.conf\n",
        stderr: "",
        exitCode: 0,
      };
    return { stdout: "", stderr: "", exitCode: 0 };
  };
  const result = await runProvision(
    manifest,
    config,
    domain,
    ENV_EXAMPLE,
    { staging: false, skipGithub: false },
    {
      run,
      gh: async () => {},
      genKeypair: async () => ({
        publicKey: "ssh-ed25519 AAA",
        privateKey: "KEY",
      }),
    },
  );
  expect(result.log.join("\n")).toMatch(/Deploy key ready/);
});
