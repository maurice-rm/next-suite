---
"create-next-suite": patch
---

Move to `validate-npm-package-name` 8 and refresh the toolchain.

The name validator is a runtime dependency and its major release keeps the
shape the CLI relies on — verified against the installed v8: same callable
default export, same `validForNewPackages`, `errors` and `warnings` on the
result. `prettier`, `@types/node`, `@eslint/js`, `globals` and the pinned
GitHub Actions move up as development-only changes.

ESLint 10's new `preserve-caught-error` rule caught a `throw` in
`generator/merge.ts` that dropped the underlying `JSON.parse` failure; the
rethrown error now carries it as `cause`.
