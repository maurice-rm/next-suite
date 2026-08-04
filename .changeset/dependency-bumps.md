---
"create-next-suite": patch
---

Move the CLI onto `execa` 10 and refresh the rest of the toolchain.

`execa` is a runtime dependency and drives every post-step that shells out —
git init, install, shadcn, format, commit. Verified with a full scaffold that
ran all of them and ended on a clean tree with the initial commit in place.
`@clack/core`, `@clack/prompts` and `fs-extra` move up too; `eslint` 10,
`@types/node` 26, `simple-import-sort` 14, `vitest`, `tsx`, `turbo` and
`typescript-eslint` are development-only.

Generated projects are unaffected — they pin their own versions in
`generator/config/dependencies.ts`.
