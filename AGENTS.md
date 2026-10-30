# AGENTS.md

How to work in this repository, for people and for agents. The documentation in `apps/docs`
says what next-suite does; this file says how code is written here.

## Scope

- A change does what it set out to do and nothing else. An improvement noticed on the way is
  reported to the maintainer — never folded in.
- The maintainer decides which options next-suite ships as built-in plugins and what the files
  of the base project and of every built-in plugin look like. Files under
  `packages/create-next-suite/base/` and `packages/create-next-suite/plugins/*/*/files/` change
  only on the maintainer's instruction or approval.
- The public surface — the CLI's commands and flags, the plugin contract and the vocabulary — is
  decided by the maintainer. A change or a review finding that would alter it is raised as a
  question, not made.
- This repository holds code, its documentation and contributor guidance only. Planning
  documents are kept elsewhere, and nothing here links to them.

## Before writing code

- Read the official documentation of the version installed here, not memory: the package's own
  docs (Next.js ships them in `node_modules/next/dist/docs`, Turborepo in
  `node_modules/turbo/docs`), the `.d.ts` in `node_modules`, or the official site. Name the
  source when a choice is not obvious.
- Where a choice has alternatives, check how well-regarded projects solve it.
- What Node.js provides is taken from Node.js (`node:fs`, `node:child_process`). The command line
  is defined with Commander, terminal colours go through ansis in `src/ui/theme.ts`.
- A new dependency needs the maintainer's approval. Install only versions older than one day
  (`minimumReleaseAge`); never add an exclusion to get around it.

## Code

- **Public exports carry complete TSDoc:** a summary; `@typeParam` for every type parameter;
  `@param name -` and `@returns` where they say more than the type; `@throws` for every error
  raised on purpose; at least one `@example` per entry point. No types inside `@param`. Public
  means the `create-next-suite/plugin` and `create-next-suite/testing` subpaths; the field
  descriptions of the JSON schemas under `create-next-suite/schemas/` are read by users too. The
  bins are no API.
- **Internal code** gets a doc comment only where name and signature do not say enough. An inline
  comment is reserved for a workaround (with a link), a non-obvious constraint, or a dense
  algorithm. Design history and rationale stay out of TSDoc — TSDoc ships in `dist`.
- **One word per concept,** as the [glossary](apps/docs/content/docs/glossary.mdx) defines it —
  in code, error messages and documentation alike. A new term enters the glossary in the change
  that introduces it.
- **A rule exists once.** Before writing something that resembles existing code, find the
  existing code. Similar code is named and compared the second time and merged the third time;
  a domain rule never gets a second copy.
- **Consistency across modules:** constants and types sit at the top of a file; one exported
  concept per file; file names are kebab-case and match what they export.
- At most three parameters, otherwise an options object; guard clauses over nesting; named
  constants over magic values; functions either do or answer. Biome enforces what it can
  (`useMaxParams`, `noExcessiveCognitiveComplexity`, `useNamingConvention`, `noImportCycles`).
- **Imports inside a package are relative and name the file with its extension** (`./x.ts`), the
  way Node.js loads TypeScript. No path aliases in packages. Module boundaries inside a package
  are enforced with `noRestrictedImports` overrides per directory, added in `biome.json` together
  with the directories they guard. In `packages/create-next-suite/src`:

  | Directory            | Imports from                                                                                                    |
  | -------------------- | --------------------------------------------------------------------------------------------------------------- |
  | `contract/`          | no other module                                                                                                 |
  | `file-system/`       | no other module                                                                                                 |
  | `ui/`                | `expected-error.ts`                                                                                             |
  | `code-edit/`         | `expected-error.ts`                                                                                             |
  | `project-model/`     | `code-edit/`, `expected-error.ts`                                                                               |
  | `plugin-definition/` | `code-edit/`, `project-model/`, `expected-error.ts`                                                             |
  | `assembly/`          | `plugin-definition/`, `project-model/`, `code-edit/`, `expected-error.ts`                                       |
  | `answers/`           | `contract/`                                                                                                     |
  | `package-manager/`   | `contract/`, the error files                                                                                    |
  | `post-steps/`        | `contract/`, `package-manager/`, the error files                                                                |
  | `user-config/`       | `contract/`, `file-system/`, the error files                                                                    |
  | `loader/`            | `contract/`, `file-system/`, the error files                                                                    |
  | `loader/remote/`     | as `loader/`, and of `loader/` only `plugin-address.ts` and `plugin-load-error.ts`                              |
  | `trust/`             | `contract/`, `file-system/`, `loader/`, the error files                                                         |
  | `compose/`           | `contract/`, `answers/`, `loader/`, `file-system/`, the error files                                             |
  | `compose/template/`  | as `compose/`, but not `compose/` itself                                                                        |
  | `questions/`         | `contract/`, `answers/`, `loader/`, `ui/`, `file-system/`, the error files                                      |
  | `write/`             | `contract/`, `answers/`, `loader/`, `compose/`, `file-system/`, the error files                                 |
  | `test-support/`      | `contract/`, `answers/`, `loader/`, `questions/`, `cli/`, `file-system/`, `plugin-definition/`, the error files |
  | `cli/`               | every module, never the package entries                                                                         |

  The error files are `expected-error.ts` and `input-error.ts` at the root of `src/`.
- **Plugins:** a built-in plugin is one directory under
  `packages/create-next-suite/plugins/<category>/`, or under `plugins/extras/` for an extra (a
  plugin without a category), and changes no other file; a plugin that needs another file
  changed is missing a composition point, which is a change to the core of its own. Built-in
  plugins import only the public plugin contract (`create-next-suite/plugin`), like any external
  plugin.
- **Templates:** a plugin file whose source ends in `.hbs` is a Handlebars template; its target
  path comes from the manifest. Every other file is copied as it is. TypeScript and JavaScript
  sources end in `.hbs` even without placeholders, so the repository's own tools never check them
  as code; JSX double braces in such a file are written `\{{`.
- **The core owns every side effect:** plugins compute, the core writes files, runs processes
  and fetches.

## Tests

- A new test fails before the code that makes it pass, and the report says how it was seen red.
- Tests sit next to the file they test: `x.test.ts` for runtime, `x.test-d.ts` for types. Tests
  of the built CLI live in `packages/integration` and run it the way a user does.
- Snapshot changes are deliberate and land in the same commit as the output change that causes
  them.

## Verify

Green before a change counts as done:

```bash
pnpm lint && pnpm knip && pnpm boundaries && pnpm turbo check-types test test:types build
```

After a change touching more than one file, run an independent review against this file.

## Keep text current

A change that makes a text wrong updates it in the same change.

| File                         | Goes stale when                                         |
| ---------------------------- | ------------------------------------------------------- |
| `README.md`                  | packages, prerequisites or commands change              |
| `AGENTS.md`                  | a convention or the verify command changes              |
| TSDoc of an export           | the behaviour it describes changes — it ships in `dist` |
| documentation in `apps/docs` | anything a user reads there changes                     |
| error messages               | the condition they report changes                       |

## Git

- Conventional Commits: `type(scope): description`, imperative, lower case, no trailing period,
  under ~72 characters. Subject only by default; a body only for a reason the diff cannot show.
- One concern per commit; refactoring apart from behaviour changes.
- `main` is the only long-lived branch; work happens in short-lived branches merged by squash.
  Releases go through the Changesets version pull request.
- Nothing in code, comments, commit messages or documentation refers to planning documents
  outside this repository.
