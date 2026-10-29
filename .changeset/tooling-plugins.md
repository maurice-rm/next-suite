---
"create-next-suite": minor
---

Add the tooling of the quick start as plugins: ESLint 9 with the Next.js rules or Biome as linter, Prettier as formatter (formatting the project after the install), Knip for unused code, and lint-staged with Husky for staged files. Plugins contribute lint-staged commands and dependencies whose install scripts are known to be unneeded; a default plugin that conflicts with the choices so far is left out.
