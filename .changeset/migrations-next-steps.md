---
"create-next-suite": patch
---

Recommend `db:generate` + `db:migrate` instead of `db:push` for Drizzle
projects, in the closing next steps and in `scripts/setup.sh`, so the
committed migrations match what production applies.
