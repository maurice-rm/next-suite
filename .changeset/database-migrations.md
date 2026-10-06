---
"create-next-suite": minor
---

Ship an initial Prisma migration with production projects (generated offline from the schema, so `prisma migrate deploy` no longer starts on an empty database), apply migrations instead of pushing the schema in the Prisma setup and next steps, map Prisma's auth columns to snake_case with `timestamptz` on PostgreSQL, name Drizzle's auth indexes in snake_case, export the Drizzle schema by name, and URL-encode the credentials in `prisma.config.ts`.
