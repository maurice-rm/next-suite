# Changesets

This folder is managed by [`@changesets/cli`](https://github.com/changesets/changesets). A **changeset** is a small markdown file that records one change: which package, the semver bump, and one human-readable changelog line. You write it _with_ your change (in the same PR), not at release time; changesets accumulate and are consumed into one version bump + `CHANGELOG.md` entry when you release.

## Do I need a changeset?

The question to ask: **does the change reach `dist/` (the published package) or alter the CLI's behavior / generated output?**

| Change                                                                                   | Changeset                                          |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------- |
| New feature (a `templates/features/*` layer, a wizard option, a package manager)         | yes — **minor**                                    |
| Bug fix to the CLI or the generated output                                               | yes — **patch**                                    |
| Breaking change (a flag removed, output reshaped, Node minimum raised)                   | yes — **minor** while pre-1.0 (see below)          |
| Dependency bump that changes behavior or output                                          | yes — patch/minor                                  |
| Tests, CI/workflows, internal refactors with no behavior change, docs, dev scripts, deps | **no** …                                           |
| … but the change touches `src/**`, `templates/**`, or `package.json`                     | **empty changeset** (`pnpm changeset add --empty`) |

The empty case exists because the CI `changeset` gate counts any `src/**`, `templates/**`, or `package.json` change (per `changedFilePatterns` in `config.json`) as a package change — even a test or script edit that never ships. An empty changeset records "deliberately no release" and clears the gate.

**Rule of thumb:** nothing in `dist/` → no changeset, or an empty one.

## Bump levels (semver)

- **patch** `0.1.0 → 0.1.1` — a bug fix.
- **minor** `0.1.0 → 0.2.0` — a new, backwards-compatible feature.
- **major** `0.1.0 → 1.0.0` — a breaking change.

**The repo is in pre mode** (`.changeset/pre.json`, tag `beta`) and `create-next-suite` sits at `1.0.0-beta.x`. Bumps apply to the pre-release: a `patch` moves `beta.3 → beta.4`, and the level you pick is what lands in the final `1.0.0` changelog when pre mode is exited. Pick the level the change would deserve in a stable release — breaking → major, feature → minor, fix → patch.

## How to write one

```bash
pnpm changeset             # interactive: pick the package, the bump, write one line
pnpm changeset add --empty # the "no release" marker
```

It writes a self-contained file you commit with your PR:

```md
---
"create-next-suite": minor
---

Add a Tailwind CSS feature.
```

Always the package `create-next-suite` — the private `@next-suite/*` config packages are ignored.

## What happens next (you only do step 1)

1. **You:** make the change + `pnpm changeset`, and commit both in the PR.
2. Merge the PR to `main`.
3. The release workflow opens/updates a **"Version Packages" PR** that gathers all pending changesets, bumps the version, and writes `CHANGELOG.md`.
4. **You** merge that PR _when you want to release_ → `changeset publish` runs: a **git tag, a GitHub release** from the changelog, and an **npm publish** under the `beta` dist-tag; a follow-up step points `latest` at it. The consumed `.changeset/*.md` files are deleted.

Never hand-edit a version number or `CHANGELOG.md` — the "Version Packages" PR owns both.

## Tips

- **Several changes in one PR:** add several changesets (one nice changelog line each), or one with multiple points. Logically separate features read better as separate changesets.
- A PR that changes `src/`, `templates/`, or `package.json` **without** a changeset fails CI — run `pnpm changeset` or `pnpm changeset add --empty`.

See the [common questions](https://github.com/changesets/changesets/blob/main/docs/common-questions.md).
