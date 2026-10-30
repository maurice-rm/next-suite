---
"create-next-suite": minor
---

Plugins add startup and server-error hooks for `instrumentation.ts`, browser hooks for `instrumentation-client.ts` (both written by the core), components at the end of the body, tsconfig paths and includes, generated directories, linter and Knip ignores, CSP directives, test setup files and log redaction paths. Module paths starting with `@/` resolve through the project alias.
