# 0002 — Generated projects are composed in memory from template layers

- **Status:** accepted

## Context

A generated project combines up to a dozen independent choices (package manager, styling, database and ORM, API layer, auth, email, deployment, CI/CD). Copying a fixed template per combination does not scale, and writing files step by step leaves a half-written directory behind when a step fails.

## Decision

Every choice is a feature layer under `packages/cli/templates/`, selected by a `when(config)` predicate in `FEATURES`. The generator renders all active layers with Handlebars into an in-memory `FileMap`, merges the files several layers contribute (`package.json`, `.env.example`, `.prettierrc.json`), and writes the result to disk only once the composition succeeded. Dependency versions live in one registry, `VERSIONS`.

## Consequences

- A failed composition writes nothing; a failed write removes only what the run created.
- The golden snapshot pins the complete output of representative configurations, and the generated-build workflow builds them through the real CLI, so a template change is reviewed as a diff of real output.
- Templates are Handlebars, not TypeScript: a template error surfaces in the snapshot or the build matrix, not in the CLI's type-check.
