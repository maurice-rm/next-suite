---
"create-next-suite": minor
---

Enforce conventions in the generated ESLint config: no `any` or non-null
assertions, `max-params` 3, `max-depth` 2, arrow-function components,
kebab-case file and folder names (`eslint-plugin-check-file`), no import
cycles, and a one-way import direction between `lib`/`components`,
`features` and `app`. shadcn's vendored `components/ui` keeps its function
components.
