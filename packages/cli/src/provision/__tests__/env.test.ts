import { expect, test } from "vitest";

import {
  deriveServerEnv,
  forceAppPort,
  generateSecret,
  mergeEnv,
  parseEnvKeys,
} from "../env";

// Shape of a real scaffold-generated .env.example (postgres + better-auth + resend),
// with a user-added custom key appended.
const EXAMPLE = `COMPOSE_PROJECT_NAME=acme-app

POSTGRES_PORT=5432
POSTGRES_HOST=localhost
POSTGRES_USER=next
POSTGRES_PASSWORD=next
POSTGRES_DATABASE=acme-app

NEXT_PUBLIC_APP_URL=http://localhost:3000

BETTER_AUTH_SECRET=insecure-dev-secret-change-me-32chars!

RESEND_API_KEY=re_dev_placeholder_replace_me
EMAIL_FROM=App <onboarding@resend.dev>

# Production image for docker-compose.prod.yml. Leave unset to build locally;
# set to ghcr.io/OWNER/REPO:TAG to pull a prebuilt image instead.
DOCKER_IMAGE=

MY_CUSTOM=x
`;

const MYSQL_EXAMPLE = `COMPOSE_PROJECT_NAME=acme-app

MYSQL_PORT=3306
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=next
MYSQL_DATABASE=acme-app
`;

const ctx = { name: "acme-prod", port: 8100, domain: "acme.example.com" };

test("overrides COMPOSE_PROJECT_NAME, POSTGRES_HOST, NEXT_PUBLIC_APP_URL, and RESEND_API_KEY", () => {
  const out = deriveServerEnv(EXAMPLE, ctx);
  expect(out).toContain("COMPOSE_PROJECT_NAME=acme-prod");
  expect(out).toContain("POSTGRES_HOST=postgres");
  expect(out).toContain("NEXT_PUBLIC_APP_URL=https://acme.example.com");
  expect(out).toMatch(/^RESEND_API_KEY=$/m);
});

test("generates real, distinct secrets for POSTGRES_PASSWORD and BETTER_AUTH_SECRET", () => {
  const out = deriveServerEnv(EXAMPLE, ctx);
  const pgPassword = out.match(/^POSTGRES_PASSWORD=(.*)$/m)?.[1];
  const authSecret = out.match(/^BETTER_AUTH_SECRET=(.*)$/m)?.[1];
  expect(pgPassword).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  expect(authSecret).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  expect(pgPassword).not.toBe("next");
  expect(authSecret).not.toBe("insecure-dev-secret-change-me-32chars!");
  expect(pgPassword).not.toBe(authSecret);
});

test("overrides MYSQL_HOST and generates MYSQL_PASSWORD, keeping other MYSQL_* keys verbatim", () => {
  const out = deriveServerEnv(MYSQL_EXAMPLE, ctx);
  expect(out).toContain("MYSQL_HOST=mysql");
  expect(out).toContain("MYSQL_PORT=3306");
  expect(out).toContain("MYSQL_USER=root");
  expect(out).toContain("MYSQL_DATABASE=acme-app");
  const mysqlPassword = out.match(/^MYSQL_PASSWORD=(.*)$/m)?.[1];
  expect(mysqlPassword).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  expect(mysqlPassword).not.toBe("next");
});

test("a key name inside a comment is not mistaken for a KEY= line", () => {
  const example =
    "COMPOSE_PROJECT_NAME=acme\n\n# see POSTGRES_HOST above\nPOSTGRES_HOST=localhost\n";
  const out = deriveServerEnv(example, ctx);
  expect(out).toContain("# see POSTGRES_HOST above");
});

test("a custom key that is a superset of a known key's name is kept verbatim", () => {
  const example = "COMPOSE_PROJECT_NAME=acme\n\nPOSTGRES_HOSTNAME=keepme\n";
  const out = deriveServerEnv(example, ctx);
  expect(out).toContain("POSTGRES_HOSTNAME=keepme");
});

test("a value containing '=' is preserved exactly", () => {
  const example =
    "COMPOSE_PROJECT_NAME=acme\n\nMY_URL=https://x.example.com/?a=1&b=2\n";
  const out = deriveServerEnv(example, ctx);
  expect(out).toContain("MY_URL=https://x.example.com/?a=1&b=2");
});

test("ensures a trailing newline even when the source lacks one", () => {
  const out = deriveServerEnv("COMPOSE_PROJECT_NAME=acme", {
    name: "acme",
    port: 1,
    domain: "d",
  });
  expect(out.endsWith("\n")).toBe(true);
});

test("keeps every other key verbatim, including a user-added custom key", () => {
  const out = deriveServerEnv(EXAMPLE, ctx);
  expect(out).toContain("POSTGRES_PORT=5432");
  expect(out).toContain("POSTGRES_USER=next");
  expect(out).toContain("POSTGRES_DATABASE=acme-app");
  expect(out).toContain("EMAIL_FROM=App <onboarding@resend.dev>");
  expect(out).toContain("DOCKER_IMAGE=");
  expect(out).toContain("MY_CUSTOM=x");
});

test("inserts APP_PORT directly after COMPOSE_PROJECT_NAME", () => {
  const lines = deriveServerEnv(EXAMPLE, ctx).split("\n");
  const idx = lines.indexOf("COMPOSE_PROJECT_NAME=acme-prod");
  expect(idx).toBeGreaterThanOrEqual(0);
  expect(lines[idx + 1]).toBe("APP_PORT=8100");
});

test("an APP_PORT already in the example is rewritten, not duplicated", () => {
  const example = "COMPOSE_PROJECT_NAME=acme\nAPP_PORT=8100\n\nDOCKER_IMAGE=\n";
  const out = deriveServerEnv(example, { ...ctx, port: 8137 });
  const lines = out.split("\n").filter((l) => l.startsWith("APP_PORT="));

  expect(lines).toEqual(["APP_PORT=8137"]);
});

test("preserves comments and blank-line structure byte-for-byte elsewhere", () => {
  const out = deriveServerEnv(EXAMPLE, ctx);
  expect(out).toContain(
    "\n\n# Production image for docker-compose.prod.yml. Leave unset to build locally;\n" +
      "# set to ghcr.io/OWNER/REPO:TAG to pull a prebuilt image instead.\n" +
      "DOCKER_IMAGE=\n",
  );
});

test("prepends a COMPOSE_PROJECT_NAME/APP_PORT block when the example has none", () => {
  const out = deriveServerEnv("FOO=bar\n", { name: "x", port: 1, domain: "d" });
  expect(out).toBe("COMPOSE_PROJECT_NAME=x\nAPP_PORT=1\n\nFOO=bar\n");
});

test("an indented known key line still gets its override applied", () => {
  const example = "COMPOSE_PROJECT_NAME=acme\n\n  POSTGRES_HOST=localhost\n";
  const out = deriveServerEnv(example, ctx);
  expect(out).toContain("POSTGRES_HOST=postgres");
  expect(out).not.toContain("  POSTGRES_HOST=localhost");
});

test("a stub genSecret replaces real secret generation (used by the dry-run plan)", () => {
  const out = deriveServerEnv(EXAMPLE, ctx, () => "<generated>");
  expect(out).toContain("POSTGRES_PASSWORD=<generated>");
  expect(out).toContain("BETTER_AUTH_SECRET=<generated>");
});

test("generateSecret returns a long, url-safe, unique-ish token", () => {
  const a = generateSecret();
  const b = generateSecret();
  expect(a).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  expect(a).not.toBe(b);
});

test("parseEnvKeys extracts keys, ignoring comments and blanks", () => {
  expect([...parseEnvKeys("# c\nA=1\n\nB=2\n")].sort()).toEqual(["A", "B"]);
});

test("mergeEnv appends only missing keys, carrying their block's comments", () => {
  const existing = "COMPOSE_PROJECT_NAME=acme\nAPP_PORT=8100\n";
  const desired =
    "COMPOSE_PROJECT_NAME=acme\nAPP_PORT=8100\n\n" +
    "# Production image comment\nDOCKER_IMAGE=\n\n" +
    "MY_CUSTOM=x\n";
  const merged = mergeEnv(existing, desired);
  expect(merged.startsWith(existing)).toBe(true);
  expect(merged).toContain("# Production image comment\nDOCKER_IMAGE=");
  expect(merged).toContain("MY_CUSTOM=x");
  expect(merged.match(/COMPOSE_PROJECT_NAME=/g)?.length).toBe(1);
});

test("mergeEnv drops a block whose keys are all already present, comments included", () => {
  const existing = "DOCKER_IMAGE=ghcr.io/x:tag\n";
  const desired = "# Production image comment\nDOCKER_IMAGE=\n\nMY_CUSTOM=x\n";
  const merged = mergeEnv(existing, desired);
  expect(merged).not.toContain("Production image comment");
  expect(merged).toContain("MY_CUSTOM=x");
});

test("mergeEnv returns existing verbatim when nothing is missing", () => {
  const existing = "A=1\nB=2\n";
  const desired = "A=99\nB=2\n";
  expect(mergeEnv(existing, desired)).toBe(existing);
});

test("mergeEnv ensures a trailing newline on existing before appending", () => {
  const existing = "A=1";
  const desired = "A=1\n\nB=2\n";
  expect(mergeEnv(existing, desired)).toBe("A=1\nB=2\n");
});

test("mergeEnv keeps a comment-only header block verbatim on a fresh upload (no existing keys)", () => {
  const desired =
    "# Header comment\n# Another line\n\nCOMPOSE_PROJECT_NAME=acme\nAPP_PORT=8100\n";
  expect(mergeEnv("", desired)).toBe(desired);
});

test("mergeEnv does not duplicate an indented custom key across two merges", () => {
  const desired = "COMPOSE_PROJECT_NAME=acme\nAPP_PORT=8100\n\n  MY_CUSTOM=x\n";
  const firstMerge = mergeEnv("", desired);
  const secondMerge = mergeEnv(firstMerge, desired);
  expect(secondMerge).toBe(firstMerge);
  expect(secondMerge.match(/MY_CUSTOM=/g)?.length).toBe(1);
});

test("forceAppPort wins over the stale APP_PORT the additive merge keeps", () => {
  const existing =
    "COMPOSE_PROJECT_NAME=acme\nAPP_PORT=8100\nPOSTGRES_PASSWORD=keep\n";
  const merged = mergeEnv(
    existing,
    deriveServerEnv(EXAMPLE, { ...ctx, port: 8101 }),
  );
  expect(merged).toMatch(/^APP_PORT=8100$/m);

  const forced = forceAppPort(merged, 8101);
  expect(forced).toMatch(/^APP_PORT=8101$/m);
  expect(forced.match(/^APP_PORT=/gm)?.length).toBe(1);
  expect(forced).toContain("POSTGRES_PASSWORD=keep");
});

test("forceAppPort appends when the env has no APP_PORT at all", () => {
  expect(forceAppPort("FOO=1\n", 8102)).toBe("FOO=1\nAPP_PORT=8102\n");
});

test("forceAppPort closes the file, even when mergeEnv passed it through as-is", () => {
  const noNewline = "COMPOSE_PROJECT_NAME=acme\nAPP_PORT=8100";
  expect(mergeEnv(noNewline, "APP_PORT=8100\n")).toBe(noNewline);
  expect(forceAppPort(noNewline, 8100)).toBe(
    "COMPOSE_PROJECT_NAME=acme\nAPP_PORT=8100\n",
  );
});
