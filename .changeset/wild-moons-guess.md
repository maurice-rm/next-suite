---
"create-next-suite": patch
---

Only import `zod` in the generated `src/env.ts` when a schema actually uses
it. A project scaffolded without a database, API, auth or email had no
`z.*` call left, so every `lint` run reported an unused import.
