---
"create-next-suite": minor
---

Add the remaining composition points: plugins contribute startup and server-error hooks for `instrumentation.ts`, browser hooks for `instrumentation-client.ts` (both written by the core), components at the end of the body, tsconfig paths and includes, generated folders, linter and Knip ignores, container build arguments and services, CSP directives, health checks, test setup files and log redaction paths. Module paths starting with `#src/` resolve through the project alias. No built-in plugin reads `container` and `health` yet.
