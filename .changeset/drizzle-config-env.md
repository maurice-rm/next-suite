---
"create-next-suite": patch
---

Read the database credentials in `drizzle.config.ts` through the typed `env`
instead of `process.env` with non-null assertions, and route Prisma's
`NODE_ENV` check through `env` as a shared variable.
