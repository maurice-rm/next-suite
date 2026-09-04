---
"create-next-suite": patch
---

Bump the pinned generated-project dependencies: `next` and
`eslint-config-next` to 16.3.4, and `eslint-plugin-simple-import-sort` to
14 (only breaking for string-literal module export names, which the
templates do not use).

`deps:check` no longer reports a `latest` tag that points at a prerelease as
a major update — Prisma ships release candidates there.
