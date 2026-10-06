---
"create-next-suite": minor
---

Harden the supply chain of every package manager: npm projects get a `.npmrc` with a one-day `min-release-age` and an enforced `allowScripts` list, Bun projects a `bunfig.toml` with a one-day `minimumReleaseAge`, `trustedDependencies` and a pinned `packageManager` (used by CI and the Dockerfile), and Yarn projects an explicit `npmMinimalAgeGate`. CI now audits dependencies for pnpm, Yarn and Bun on every run, forces patched `mysql2` and `mariadb` releases where Prisma pins vulnerable ones, ignores only a documented list of tooling-only advisories, and validates the environment against `.env.example` instead of skipping validation.
