import { expect, test } from "vitest";

import { buildDryRunPlan } from "../plan";
import { remoteChecks } from "../preflight";

const MINIMAL_EXAMPLE = `COMPOSE_PROJECT_NAME=acme-app

# Production image for docker-compose.prod.yml. Leave unset to build locally;
# set to ghcr.io/OWNER/REPO:TAG to pull a prebuilt image instead.
DOCKER_IMAGE=
`;

const DB_AUTH_EXAMPLE = `COMPOSE_PROJECT_NAME=acme

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

test("plan names the server target, port, and nginx destination", () => {
  const lines = buildDryRunPlan({
    manifest: {
      version: 1,
      name: "acme-app",
      packageManager: "pnpm",
      auth: "none",
      email: "none",
      githubActions: [],
      production: { mode: "proxied" },
    },
    config: {
      host: "vps.example.com",
      adminUser: "root",
      certbotEmail: "me@x.io",
    },
    domain: "app.example.com",
    port: 8100,
    envExample: MINIMAL_EXAMPLE,
  });
  const text = lines.join("\n");
  expect(text).toContain("acme-app");
  expect(text).toContain("/srv/www/acme-app");
  expect(text).toContain("app.example.com");
  expect(text).toContain("127.0.0.1:8100");
  expect(text).toContain("vps.example.com");
});

test("dry-run plan lists the concrete commands, shows the derived .env, and redacts secrets", () => {
  const text = buildDryRunPlan({
    manifest: {
      version: 1,
      name: "acme",
      packageManager: "pnpm",
      auth: "better-auth",
      email: "none",
      githubActions: [],
      database: { engine: "postgres", orm: "drizzle" },
      production: { mode: "proxied" },
    },
    config: {
      host: "vps.example.com",
      adminUser: "root",
      certbotEmail: "me@x.io",
    },
    domain: "acme.example.com",
    port: 8100,
    envExample: DB_AUTH_EXAMPLE,
  }).join("\n");
  expect(text).toContain("useradd");
  expect(text).toContain("/etc/nginx/conf.d/acme.conf");
  expect(text).toContain("certbot certonly --webroot");
  expect(text).toContain("-d acme.example.com");
  expect(text).toContain("listen      443 ssl");
  expect(text).toContain("client_max_body_size 25m");
  expect(text).toContain("DEPLOY_SSH_KEY");
  expect(text).not.toMatch(/DEPLOY_SSH_KEY[=:]\s*\S{20}/);

  expect(text).toContain("APP_PORT=8100");
  expect(text).toContain("POSTGRES_HOST=postgres");
  expect(text).toContain("POSTGRES_PASSWORD=<generated>");
  expect(text).toContain("BETTER_AUTH_SECRET=<generated>");
  expect(text).toContain(
    "# Production image for docker-compose.prod.yml. Leave unset to build locally;",
  );
  expect(text).not.toMatch(/POSTGRES_PASSWORD=[A-Za-z0-9_-]{20}/);
  expect(text).not.toMatch(/BETTER_AUTH_SECRET=[A-Za-z0-9_-]{20}/);
});

test("the plan names exactly the checks preflight runs", () => {
  const line = buildDryRunPlan({
    manifest: {
      version: 1,
      name: "acme-app",
      packageManager: "pnpm",
      auth: "none",
      email: "none",
      githubActions: [],
      production: { mode: "proxied" },
    },
    config: {
      host: "vps.example.com",
      adminUser: "root",
      certbotEmail: "me@x.io",
    },
    domain: "app.example.com",
    port: 8100,
    envExample: MINIMAL_EXAMPLE,
  }).find((l) => l.startsWith("Prerequisites"));

  expect(line).toBeDefined();
  for (const check of remoteChecks()) expect(line).toContain(check.name);
  expect(line).not.toContain("connection_upgrade");
});
