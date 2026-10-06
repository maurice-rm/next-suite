# 0001 — Provisioning ships as a second binary in the CLI package

- **Status:** accepted

## Context

A generated project with the `proxied` deployment needs a server set up once: a deploy user, a project directory, a host nginx block, a TLS certificate and the GitHub secrets the CD workflow reads. The steps depend on what the scaffolder wrote — the deployment mode, the port registry and the `next-suite.json` manifest — and change together with it.

## Decision

`create-next-suite` ships a second binary, `next-suite` (`src/suite.ts` → `src/provision/`), with `provision`, `deprovision` and `config`. It runs locally, reads the committed `next-suite.json`, and drives the server over SSH; nothing is installed on the server. The scaffolder (`src/index.ts`) imports nothing from `provision/`, and `provision/` may read only `generator/manifest` from the generator.

## Consequences

- One package and one release carry both the generated files and the code that deploys them, so their contract (`next-suite.json`, the host nginx block, the header and port layout) cannot drift between versions.
- The CLI's install size includes the provisioning code even for users who never deploy.
- The layering is enforced by `import-x/no-restricted-paths` in `packages/cli/eslint.config.js`; splitting `provision/` into its own package later means moving one directory and its zone.
