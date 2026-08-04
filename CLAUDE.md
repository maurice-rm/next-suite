# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo actually is

A Turborepo monorepo, but the real project is **`create-next-suite`** — an interactive CLI that scaffolds Next.js projects, living entirely in `packages/cli`.

The other two packages (`packages/eslint-config`, `packages/typescript-config`) are pared-down `create-turbo` leftovers, consumed only as the CLI's dev-dependency configuration — treat them as inert unless a task explicitly targets them.

Documentation is maintained, not incidental: the root `README.md` and `packages/cli/README.md` are the product landing pages, and **[`docs/`](docs/)** holds the published documentation (architecture, CLI reference, generated project, provisioning, server requirements, troubleshooting). A change to flags, wizard steps, generated output, or provisioning behaviour updates the matching file under `docs/`.

## The CLI — where the detail lives

The architecture, extension points (add a feature / prompt / package manager), and the **complete conventions catalog** live in **[`packages/cli/AGENTS.md`](packages/cli/AGENTS.md)** — the single source of truth for CLI work. Read it before changing CLI code, and keep _it_ (not this file) current.

In one breath: the CLI runs two sequential phases wired in `src/index.ts` — `gatherProjectConfig()` (`prompts/`) produces a fully-resolved `ProjectConfig` (`core/types.ts`, the contract between the halves), then `scaffold(config)` (`generator/`) composes the project in memory as a `FileMap` and writes it, followed by a best-effort `runPostSteps(config)` (git init → install → shadcn → format → commit). Layering is strictly downward — `core` / `ui` / `prompts` / `generator` / `post-steps` / `provision` over the leaf registries (`options.ts`, `package-managers.ts`, `generator/config/`). A feature's shape starts in `ProjectConfig`.

The package ships a **second binary**, `next-suite` (`src/suite.ts` → `provision/`), with the subcommands `provision` / `deprovision` / `config`. It sets up a server over SSH for a generated `proxied` project and is independent of the scaffolder — `src/index.ts` imports nothing from `provision/`.

## Commands

Run from the repo root:

| Task                           | Command                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| Build everything               | `pnpm build` (turbo)                                                                 |
| Type-check everything          | `pnpm check-types`                                                                   |
| Lint everything                | `pnpm lint`                                                                          |
| Test everything                | `pnpm test`                                                                          |
| Format                         | `pnpm format`                                                                        |
| Build + run the CLI end-to-end | `pnpm cli` (builds `create-next-suite`, then runs `node packages/cli/dist/index.js`) |

CLI package (`packages/cli`) — work here:

| Task                                        | Command                                                 |
| ------------------------------------------- | ------------------------------------------------------- |
| Build (tsup → `dist/`, copies `templates/`) | `pnpm --filter create-next-suite build`                 |
| Watch build                                 | `pnpm --filter create-next-suite dev`                   |
| Type-check                                  | `pnpm --filter create-next-suite check-types`           |
| Run all tests (vitest)                      | `pnpm --filter create-next-suite test`                  |
| Run one test file / pattern                 | `pnpm --filter create-next-suite exec vitest run merge` |

After any change to the CLI, the verification bar is **`check-types` + `build` + `test` + `lint` all green**.

## Process

- Commits use **Conventional Commits** (not enforced by a hook in this repo — only generated projects get a `commit-msg` hook).
- Never commit planning/design docs. They live under `docs/superpowers/**`, which is gitignored; the rest of `docs/**` is published documentation and _is_ tracked.
- Prefer feature branches; don't commit straight to `main`, and don't push, unless asked.
