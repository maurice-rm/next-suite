---
"create-next-suite": patch
---

Make the first production deploy of a database project actually work, and make
the health check mean something.

A generated Drizzle project shipped with an empty `drizzle/` directory: nothing
ever ran `db:generate`, and it was named in no generated file. The production
entrypoint checks for `drizzle/meta/_journal.json` and, finding none, skipped
migrations with a friendly message — so the first deploy served an application
against a database with no tables, while the container reported healthy and
every query that touched a table returned 500. Scaffolding now generates the
initial migration after the install, so it lands in the initial commit, and the
entrypoint refuses to start instead of skipping.

`/api/health` was `() => Response.json({ status: "ok" })`. It imported nothing,
so it proved only that Node was answering a socket: measured with an invalid
`BETTER_AUTH_SECRET`, the container stayed healthy and `/` returned 200 while
every auth and API route returned 500. It now imports `@/env` — which validates
on import — and, when the project has a database, runs `select 1` against it,
returning 503 on failure. Measured on a running stack: stopping the database
turns the endpoint from 200 to 503 and the container from healthy to unhealthy.
