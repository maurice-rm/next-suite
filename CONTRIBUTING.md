# Contributing

Thanks for taking the time. This repository is a Turborepo monorepo; the product is the CLI in `packages/cli`, everything else is tooling around it. This page covers the mechanics: what you need installed, which commands to run, which gates your change has to clear, and how a change gets released.

## Prerequisites

| Requirement | Where it is declared                                                | Value              |
| ----------- | ------------------------------------------------------------------- | ------------------ |
| Node.js     | `.nvmrc`                                                            | `24`               |
| Node.js     | `package.json` → `engines.node`                                     | `>=24`             |
| pnpm        | `package.json` → `engines.pnpm`                                     | `>=10`             |
| pnpm        | `package.json` → `packageManager`                                   | `pnpm@10.34.4`     |
| git         | needed for the hooks and for the CLI's own initial-commit post step | any recent version |

If you use nvm, run `nvm use` in the repository root and it picks up `.nvmrc`. For pnpm, the `packageManager` field is authoritative — `corepack enable` makes your shell honour it automatically.

`.npmrc` deliberately does **not** set `engine-strict`. The comment in that file spells out why: pnpm's `engine-strict` enforces the `engines` range of _every transitive dependency_ and fails the whole install on patch-level Node mismatches, for example a dependency that asks for `24.15.0` on a `24.14` host. The root `package.json` `engines` field documents the actual requirement instead, and pnpm still warns on a mismatch without blocking the install. Do not turn it on to "tighten things up" — it breaks installs for reasons that have nothing to do with this repository.

## Setup

Run these from the repository root.

```bash
git clone git@github.com:maurice-rm/next-suite.git
cd next-suite
pnpm install
```

| Step                                                        | Expected result                                                                                                                                                             |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git clone …`                                               | A working copy on the default branch `main`.                                                                                                                                |
| `pnpm install`                                              | All workspace packages resolve from `pnpm-lock.yaml`; `esbuild` is the only dependency allowed to run a build script (`onlyBuiltDependencies` in `pnpm-workspace.yaml`).    |
| `prepare` (runs automatically at the end of `pnpm install`) | Husky sets git's `core.hooksPath` to `.husky/_`, which activates `.husky/pre-commit` and `.husky/pre-push`. Verify with `git config core.hooksPath` — it prints `.husky/_`. |
| `pnpm build`                                                | Turbo builds every package; `packages/cli/dist` exists afterwards.                                                                                                          |

If `git config core.hooksPath` prints nothing, the hooks are not active. Re-run `pnpm install` (or `pnpm exec husky`) before you commit.

## Repository layout

| Path                         | What lives there                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli`               | `create-next-suite` — the published package and the actual product. Both bins (`create-next-suite`, `next-suite`) ship from here. |
| `packages/cli/templates`     | Handlebars template layers that make up a generated project.                                                                      |
| `packages/eslint-config`     | `@next-suite/eslint-config` — private, shared flat ESLint config.                                                                 |
| `packages/typescript-config` | `@next-suite/typescript-config` — private, shared `tsconfig` bases.                                                               |
| `.changeset`                 | Pending changesets plus the release configuration.                                                                                |
| `.github`                    | Workflows and the reusable `setup` composite action.                                                                              |
| `docs`                       | Published documentation.                                                                                                          |
| `assets`                     | Banner and the recorded demo (`assets/demo.tape` re-records it via `vhs`).                                                        |

Architecture, extension points, and conventions for the CLI are documented in `docs/architecture.md` and in `packages/cli/AGENTS.md` — read one of them before you change generator or wizard code.

Note on `docs/`: `docs/superpowers/` is deliberately gitignored. It holds local planning material (specs, plans, research notes) that never ships. Everything else under `docs/` is tracked and is the published documentation, so treat a change there as part of the deliverable, not as an afterthought.

## Daily commands

Root scripts, all runnable from the repository root:

| Command             | What it does                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| `pnpm build`        | `turbo run build` across the workspace.                                                            |
| `pnpm check-types`  | `turbo run check-types` (`tsc --noEmit` per package).                                              |
| `pnpm test`         | `turbo run test`; the task depends on `^build`, so dependencies are built first.                   |
| `pnpm lint`         | `turbo run lint` (ESLint per package).                                                             |
| `pnpm lint:fix`     | The same, with `--fix`.                                                                            |
| `pnpm format`       | `prettier --write .`                                                                               |
| `pnpm format:check` | `prettier --check .` — this is what CI runs.                                                       |
| `pnpm cli`          | Builds `create-next-suite` and runs `node packages/cli/dist/index.js` — the end-to-end smoke test. |
| `pnpm dev`          | `turbo run dev` (persistent, uncached).                                                            |
| `pnpm changeset`    | Opens the interactive changeset prompt.                                                            |
| `pnpm clean`        | `turbo run clean`, then removes the root `node_modules`.                                           |

Package-scoped commands, for when you only want the CLI:

| Command                                                     | What it does                                                                                                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter create-next-suite build`                     | `tsup` bundle into `packages/cli/dist`.                                                                                                             |
| `pnpm --filter create-next-suite check-types`               | `tsc --noEmit` for the CLI only.                                                                                                                    |
| `pnpm --filter create-next-suite test`                      | `vitest run` — the full CLI suite.                                                                                                                  |
| `pnpm --filter create-next-suite exec vitest run <pattern>` | A single test file or pattern, for example `… vitest run merge`.                                                                                    |
| `pnpm --filter create-next-suite test:watch`                | `vitest` in watch mode.                                                                                                                             |
| `pnpm --filter create-next-suite test:update`               | `vitest run -u` — updates snapshots, including the golden snapshot.                                                                                 |
| `pnpm --filter create-next-suite lint` / `lint:fix`         | `eslint .` for the CLI only.                                                                                                                        |
| `pnpm --filter create-next-suite run matrix`                | Prints the generated-build matrix JSON derived from `SCENARIOS`.                                                                                    |
| `pnpm --filter create-next-suite run deps:check`            | Compares the versions pinned in `generator/config/dependencies.ts` against the npm `latest` tag and reports what generated projects fall behind on. |
| `pnpm --filter create-next-suite exec publint`              | Validates the publishable package, the same check CI runs.                                                                                          |

## The verification bar

Before you push, all four have to be green:

```bash
pnpm check-types
pnpm build
pnpm test
pnpm lint
```

Add `pnpm format:check` if you edited anything outside the pre-commit hook's reach — CI runs it and fails on a formatting diff.

One honest caveat about the lint step: `packages/eslint-config/base.js` registers `eslint-plugin-only-warn`, which downgrades every rule violation to a warning. No `--max-warnings` flag is set anywhere in this repository, so `pnpm lint` exits `0` even when it prints warnings. **The lint job cannot fail on a rule violation.** It still fails on things ESLint cannot even evaluate — a broken flat config, an unparsable file, a missing plugin — but that is all. Read the lint output; do not treat a green exit code as "no findings".

`pnpm check-types`, `pnpm build` and `pnpm test` are the steps that actually fail, and `pnpm build` catches errors `tsc` alone does not.

## Git hooks

Both hooks live in `.husky/` and are activated by the `prepare` script during `pnpm install`.

| Hook                | Command it runs                                          |
| ------------------- | -------------------------------------------------------- |
| `.husky/pre-commit` | `pnpm exec lint-staged --config .lintstagedrc.json`      |
| `.husky/pre-push`   | `pnpm run lint && pnpm run check-types && pnpm run test` |

`.lintstagedrc.json` covers exactly one pattern:

```json
{
  "*.{ts,tsx,js,jsx,mjs,cjs,json,jsonc,md,yml,yaml,css}": "prettier --write"
}
```

So the pre-commit hook formats staged files and nothing else — it does not lint, type-check or test. Committing is cheap by design.

The **pre-push hook is the real local gate**. It runs lint, type-check and the test suite before anything leaves your machine. Note what it does _not_ include: `pnpm build` and `pnpm format:check`. Run those yourself, or CI will be the one to tell you.

## Commit convention

Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, for example `feat(provision): add a --staging flag` or `fix(generator): keep blank lines in the derived env`.

Be aware that this is a convention here, not an enforced rule. Check for yourself:

```bash
ls .husky/
# _  pre-commit  pre-push
```

There is **no `commit-msg` hook in this repository**, and no commitlint configuration at the root, so a non-conforming commit message is accepted without complaint. Only _generated_ projects get one — the scaffold ships `.husky/commit-msg.hbs` plus `@commitlint/cli` and `@commitlint/config-conventional`, so projects created with the CLI do enforce the convention. This repository relies on you.

## Changesets

A changeset is a small markdown file that records one change: the package, the semver bump, and one changelog line. You write it together with your change, in the same pull request.

### When you need one

The CI gate counts a change as a package change when it touches the `changedFilePatterns` from `.changeset/config.json`:

```json
["src/**", "!src/**/__tests__/**", "templates/**", "package.json"]
```

That means: changes under `src/` (tests excluded), under `templates/`, or to a `package.json` need a changeset. Test-only, workflow, documentation and root-tooling changes do not. When a change matches the patterns but should not ship a release — a script edit, a refactor with no behaviour change — record an **empty changeset** with `pnpm changeset add --empty`. It clears the gate and states "deliberately no release".

`.changeset/README.md` is the long-form guide.

### How to write one

```bash
pnpm changeset             # interactive: pick the package, the bump, write one line
pnpm changeset add --empty # the "no release" marker
```

Always the package `create-next-suite`. The private `@next-suite/eslint-config` and `@next-suite/typescript-config` are listed under `ignore` in `.changeset/config.json` and are never versioned or published.

Bump levels:

| Bump    | Use it for                                                                                    |
| ------- | --------------------------------------------------------------------------------------------- |
| `patch` | A bug fix in the CLI or in the generated output.                                              |
| `minor` | A new backwards-compatible feature — and, while the package is pre-1.0, breaking changes too. |
| `major` | Reserved. Changesets bumps literally, so a `major` jumps straight to `1.0.0`.                 |

### Pre-release mode is active

`.changeset/pre.json` exists, which means the repository is in changesets **pre-release mode**:

| Field                                  | Value                           |
| -------------------------------------- | ------------------------------- |
| `mode`                                 | `pre`                           |
| `tag`                                  | `beta`                          |
| current version of `create-next-suite` | see `packages/cli/package.json` |

While pre mode is on, `changeset version` produces `1.0.0-beta.N` versions instead of stable ones, and every consumed changeset id is appended to the `changesets` array in `pre.json` so it is not counted twice across pre-releases. Note that `changeset publish` does **not** move the `beta` dist-tag despite pre mode — nine releases went out with it still pointing at `1.0.0-beta.0`. `release.yml` sets both `latest` and `beta` explicitly after publishing. Do not hand-edit `pre.json`, a version number, or `CHANGELOG.md` — the "Version Packages" pull request owns all three. Leaving pre mode (`changeset pre exit`) is a deliberate act tied to the stable `1.0.0`, not something a feature branch does.

### The CI gate

The `changeset` job in `.github/workflows/ci.yml` runs `pnpm changeset status --since="origin/$BASE_REF"` and fails when a package change arrives without a changeset. It has three exceptions, visible in its `if:` condition:

- it only runs on `pull_request` events, never on a push to `main`;
- it is skipped when the head branch is `changeset-release/main` (the generated version pull request, which has already consumed its changesets);
- it is skipped when the actor is `dependabot[bot]`.

## CI

Four workflows live in `.github/workflows/`. Every job that needs Node uses the reusable composite action `.github/actions/setup` (pnpm, Node, `pnpm install --frozen-lockfile`).

| Workflow              | Trigger                                                                                                                                                | Purpose                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`              | pull requests, pushes to `main`                                                                                                                        | `verify`: `check-types`, `lint`, `format:check`, `build`, `publint`. `test`: the suite on Node 24 and Node 26 in parallel. `changeset`: the gate described above.                                                                                                                                                                                       |
| `generated-build.yml` | pull requests touching `packages/cli/src`, `packages/cli/templates`, `packages/cli/scripts`, the setup action or the workflow itself; pushes to `main` | Scaffolds real projects through the real CLI and builds them.                                                                                                                                                                                                                                                                                           |
| `release.yml`         | pushes to `main`                                                                                                                                       | Runs `changesets/action`: opens or updates the "Version Packages" pull request, and on merge runs `changeset version` + `changeset publish`. A follow-up step then points both the `latest` and the `beta` dist-tag at the published version, since changesets moves neither on its own. Guarded by `if: github.repository == 'maurice-rm/next-suite'`. |
| `zizmor.yml`          | pull requests touching `.github/workflows/**` or `.github/actions/**`; pushes to `main`                                                                | Runs `zizmor`, a static analyser for GitHub Actions workflows, to catch injection and permission problems in the CI configuration itself.                                                                                                                                                                                                               |

`generated-build.yml` deserves the extra sentence. A `scenarios` job runs `pnpm --filter create-next-suite run matrix`, which derives one matrix entry per entry in `SCENARIOS` (package manager plus the `--yes` flags that reproduce it). Each matrix job then builds the CLI, runs `node packages/cli/dist/index.js app --yes <flags>` in a temporary directory — the actual published entry point, with install and post-steps included — and finally runs `build` and `typecheck` inside the _generated_ project. This is the only end-to-end proof in the repository: the golden snapshot pins what the generator emits, but only this workflow shows that what it emits actually installs, compiles and builds.

## Pull requests

1. Branch off `main`. `baseBranch` in `.changeset/config.json` is `main`, and the changeset gate diffs against it.
2. Keep the change focused, and follow the Conventional Commits convention for the commits and the pull request title.
3. Include a changeset when the change touches `src/**`, `templates/**` or a `package.json`, or an empty one when it deliberately ships no release.
4. Get the verification bar green locally: `pnpm check-types`, `pnpm build`, `pnpm test`, `pnpm lint`, plus `pnpm format:check`. The pre-push hook covers three of them; the other two are on you.
5. If your change alters flags, wizard steps, generated output, or provisioning behaviour, update the matching file under `docs/`.
6. Expect `generated-build.yml` to run when you touched `packages/cli/src`, `templates` or `scripts`. It is slower than the rest — check it before you assume the pull request is green.
