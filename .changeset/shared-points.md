---
"create-next-suite": minor
---

Add the shared points under `create-next-suite/points`: the value points `database`, `orm` and `validatedEnv`, and the collector points `databaseSchema`, `container` and `health`, with their collectors, so plugins for databases, ORMs, auth, containers and health checks work together without naming each other. `readFromValidatedEnv` lets a file read environment variables through t3-env when it is selected; pino and the SEO plugin use it instead of a second copy of their files. File edits can set the value of a top-level variable with `setVariable`, and a new import of a source path (`@/…`) joins a group of its own below the package imports. Knip skips `next-suite/` once a project has project plugins or overrides there.
