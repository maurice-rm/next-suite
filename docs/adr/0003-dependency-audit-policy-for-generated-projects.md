# 0003 — Generated projects override fixable upstream pins and accept tooling-only advisories by ID

- **Status:** accepted

## Context

The CI of a generated project audits its dependencies. Upstream packages the scaffold depends on pin vulnerable releases (Prisma pins `mysql2` and its MariaDB adapter pins `mariadb`), and some advisories have no patched release at all (`braces`). Without intervention every fresh project's CI fails on its first run, and a failing audit nobody can act on teaches people to ignore it.

## Decision

- A feature declares `overrides` for packages an upstream pins to a vulnerable release when a compatible fixed release exists; the generator writes them where the package manager reads overrides (`overrides`, `resolutions`, or `pnpm-workspace.yaml`).
- An advisory without such a fix that reaches only build or lint tooling is listed in `ACCEPTED_ADVISORIES` (`packages/cli/src/generator/config/advisories.ts`) with its reason, and the audit ignores exactly those IDs.
- pnpm, Yarn and Bun projects audit on every CI run. npm cannot ignore a single advisory, so npm projects get no audit step and rely on Dependabot alerts.

## Consequences

- A fresh project's audit is green, and a new advisory fails it.
- `ACCEPTED_ADVISORIES` and the overrides need a review whenever `VERSIONS` changes; an entry whose upstream ships a fix is removed.
- Overrides force a version the upstream did not test with; they stay within the same major release.
