# AGENTS.md — create-next-suite

## What this is / how to read this doc

This is the authoritative engineering reference for **`create-next-suite`**, the interactive Next.js scaffolder that lives entirely in `packages/cli`. It serves two readers at once:

- **A human** orienting in the codebase — read the [Architecture](#architecture) section top-to-bottom.
- **An LLM/agent** about to change the code — read [Conventions](#conventions) first (it is the rulebook you must match from the first line), then [Extending the CLI](#extending-the-cli) for the exact files to touch, then [Verification](#verification) for the bar your change must clear, and [CI & releases](#ci--releases) for how a change ships.

**Orientation in one paragraph:** The CLI is a `citty` command (`src/index.ts`) that runs in two sequential phases bridged by a single immutable contract object, plus a best-effort post-generation phase. Phase 1 (`prompts/`) gathers answers through an interactive wizard and produces a fully-resolved `ProjectConfig` (`core/types.ts`). Phase 2 (`generator/`) turns that `ProjectConfig` into files — composing the whole project in memory as a `FileMap` first, then writing it to disk atomically with cleanup-on-failure. A final best-effort phase (`post-steps/`) runs external tooling (git init, install, shadcn init, fix, initial commit). Everything is built on a small set of leaf registries (`options.ts`, `package-managers.ts`, `generator/config/`) that are the single sources of truth for selectable dimensions, package managers, features, and dependency versions.

> `packages/eslint-config` and `packages/typescript-config` are pared-down `create-turbo` leftovers, consumed only as the CLI's dev-dependency config (`eslint.config.js`, `tsconfig.json`). Treat them as inert unless a task explicitly targets them. The root `README.md` is **not** boilerplate — it is the product landing page, and `docs/` holds the published documentation; both are kept current.

---

## Architecture

### The two-phase flow

```
gatherProjectConfig() → ProjectConfig → scaffold(config) → runPostSteps(config)
   (prompts)              (core/types)     (generator)        (post-steps)
```

`src/index.ts` is the orchestrator. Its `run` handler executes, in order:

1. **Node guard** — `satisfiesNodeRange(process.versions.node, pkg.engines.node)` (`core/node-version`); on mismatch it logs and `process.exit(1)`.
2. **Banner** — `fetchLatestVersion(pkg.name)` (bounded ~700 ms npm-registry lookup, swallows all failures → `null`), `classifyVersion()` (`core/version-check`) into `unknown | latest | outdated`, then `renderTitle(version, status)`. Purely cosmetic — **skipped in `--yes` mode**.
3. **Phase 1 — config:** `--yes` → `configFromFlags(args)` (`prompts/from-flags.ts`: flags + defaults → `ProjectConfig`, non-interactive); otherwise `gatherProjectConfig(args.name)` (the wizard). Both yield a fully-resolved `ProjectConfig`.
4. **Phase 2 — generate + post**, in one `try/catch`:
   ```ts
   await scaffold(config);
   await runPostSteps(config);
   ```
   On throw it prints `p.cancel(...)`, and **if `config.action === "empty"`** it appends a data-loss warning that the target's previous contents may already be gone, then `process.exit(1)`.
5. **Outro** — `renderOutro(config)` (`ui/outro`) prints the closing summary panel: project name, the selected stack (read from the config, each label resolved via `options.ts`), the next-step commands (`nextSteps` — `cd`, then conditionally `docker compose up -d`, `<pm> install`, `<pm> run db:push`, and always `<pm> run dev`), and a docs link.

### The `ProjectConfig` contract (`core/types.ts`)

`ProjectConfig` is the **single contract** between the two halves: the wizard _produces_ it; the generator and post-steps _consume_ it. It is fully resolved and narrowed — no `Partial`, no symbols.

```ts
interface ProjectConfig {
  projectName: string;
  targetDir: string; // absolute
  action: ConflictAction; // "create" | "overwrite" | "empty"
  componentLibrary: ComponentLibrary;
  tailwind: boolean;
  shadcn?: ShadcnOptions; // present iff componentLibrary === "shadcn"
  database?: DatabaseOptions; // present iff a non-"none" engine was chosen
  api?: ApiConfig; // present iff an API layer was chosen; oRPC can carry OpenAPI
  auth: Auth;
  email: EmailProvider;
  production?: ProductionOptions; // present iff production deployment was chosen
  githubActions: GithubActionsStep[]; // empty array = no CI/CD
  git: boolean;
  packageManager: PackageManager;
  install: boolean;
}
```

- Almost every union member is **derived from a registry**, not hand-written: `ComponentLibrary`, `ShadcnBase`, `DatabaseChoice`, `Orm`, `ApiType`, `Auth`, `EmailProvider` are all `(typeof <ARRAY>)[number]["value"]` over the `options.ts` arrays; `PackageManager` is the hand-listed union in `package-managers.ts`.
- Sub-unions use `Exclude`: `DatabaseEngine = Exclude<DatabaseChoice, "none">`, `ConflictChoice = Exclude<ConflictAction, "create">`.
- **Optional sub-objects encode conditional branches structurally** — their _presence is the feature flag_ (`shadcn?`, `database?`); absent when not selected, never `null`.
- **A new feature's shape starts here.** Edit this file (and the registries it derives from) before anything else.

### Layering and import boundaries

Six layers over four leaf modules. The dependency direction is **strictly downward**; leaves import nothing from the layers, which keeps the graph acyclic.

| Module                       | Role                                                                                         | May import                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `options.ts` (leaf)          | Selectable dimensions (`COMPONENT_LIBRARIES`, `DATABASES`, …) + `defineOptions`              | nothing from any layer (node/npm only)                                       |
| `package-managers.ts` (leaf) | `PACKAGE_MANAGERS` registry + `getPackageManagerEntry`                                       | nothing from any layer                                                       |
| `latest-version.ts` (leaf)   | `fetchLatestVersion` npm lookup                                                              | nothing from any layer                                                       |
| `branding.ts` (leaf)         | `BRAND` hex + the `SYMBOLS` glyph table (ASCII fallback on win32)                            | nothing from any layer                                                       |
| `wizard.ts` (leaf)           | step engine, `GO_BACK`, `required`, `cancelAndExit`, `sectionBadge`                          | `@/branding` only — never `@/ui`                                             |
| `core/`                      | pure logic: contract, target/path safety, validation, fs-checks, pm-detector, version checks | leaves only                                                                  |
| `ui/`                        | Clack renderers (`navigable.ts`), banner, outro summary, next-steps                          | `@/wizard`, `@/core` (types only), leaves; **public surface is `@/ui` only** |
| `prompts/`                   | one file per wizard question + assembly                                                      | `core`, `ui`, `wizard`, leaves                                               |
| `generator/`                 | `ProjectConfig` → files on disk                                                              | `@/core/types`, its own `config/`, leaves                                    |
| `post-steps/`                | external tooling after generation                                                            | `@/core/types`, leaves                                                       |
| `provision/`                 | the `next-suite` bin: SSH server setup, nginx, certbot, GitHub secrets                       | `@/core`, `@/ui`, `@/wizard`, `@/generator/manifest`, leaves                 |

Hard rules:

- **`core/` never imports** from `prompts`/`ui`/`generator`/`post-steps`. It is imported _by_ them; any reverse import is a cycle.
- **`ui/style.ts` is internal** — not re-exported by `ui/index.ts`. Consumers import from `@/ui`; `navigable.ts` imports `style.ts` via the relative `./style`, never `@/ui`.
- **`ui/` may import `@/wizard`, never the reverse.** `ui/navigable.ts` needs `GO_BACK`; `wizard.ts` must stay free of `@/ui` or the two form a cycle. Presentation constants both sides need live in `branding.ts` — that is what it is for. `sectionBadge` sits in `wizard.ts` for this reason, even though it is a rendering helper: the wizard is its only consumer.
- `options.ts → core/types` (types derive from arrays), never the reverse.

### The wizard engine (`wizard.ts`)

`runWizard<A>(steps: WizardStep<A>[]): Promise<Partial<A>>` runs an ordered list and accumulates answers keyed by `step.key`.

`WizardStep.run(answers, canGoBack)` returns one of four outcomes:

| Return                               | Effect                                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **a value**                          | stored under `key`, `shown[index] = true`, advance                                                                            |
| **`GO_BACK`** (`unique symbol`)      | jump to the last _shown_ step before `index`; reset that step's `shown` to `false` so its `canGoBack` recomputes on re-render |
| **Clack cancel symbol** (`isCancel`) | `cancelAndExit()` → `p.cancel("Operation cancelled.")` + `exit(0)`                                                            |
| **`undefined`**                      | _skip_: delete any stored answer, `shown[index] = false`, advance — drives conditional branches                               |

- `canGoBack` is `lastShownBefore(shown, index) !== -1` — false only on the first _shown_ step. Back-navigation walks the `shown[]` array, so it steps over skipped steps.
- `required(value, field)` unwraps an answer an unconditional step must have produced, throwing `"Wizard invariant violated: <field> is missing."` if absent.
- `GO_BACK = Symbol("go-back")` (unique) — compare with `=== GO_BACK` or `isGoBack()`; it cannot be reconstructed from its description.
- The navigable prompts (`ui/navigable.ts`) implement back-nav generically via `withGoBack`: on a back-key press they flip the Clack prompt's internal `state` to `"cancel"` (unsafe cast — no public Clack API) but resolve to `GO_BACK`. Back key is **Esc for text, `"b"` for select/confirm**.

**Wizard order & branching** (`prompts/project-setup.ts`, `WizardAnswers` in `build-config.ts`):

name → conflict-action _(skips when no conflicting files → `action` defaults to `"create"`)_ → package manager _(pre-selected from `detectPackageManager()`)_ → quick-start _(if accepted, the whole feature section below is skipped and a minimal Tailwind-only config is built)_ → component library → shadcn base/pointer/preset _(skip unless `componentLibrary === "shadcn"`)_ → tailwind _(asked only when `componentLibrary === "none"`, since shadcn bundles Tailwind)_ → database → orm → auth _(both skip unless a non-"none" db)_ → api → email → production → nginx mode _(skip unless production)_ → GitHub Actions → its steps _(skip unless enabled)_ → git → install. It runs as **one** `runWizard` pass — the feature steps carry a `when: !quickStart` guard, so back-navigation stays continuous back into the intro steps.

`buildProjectConfig(answers)` then narrows: `tailwind` forced `true` for shadcn else `required`; `shadcn` via `toShadcnOptions` (empty/whitespace preset → omitted); `database` via `toDatabaseOptions` ("none" → `undefined`); `action` via `answers.action ?? "create"`.

### The generation pipeline (`generator/`)

`scaffold(config, { templatesDir? })`:

1. Resolve `templatesDir` (default `TEMPLATES_DIR` = `dist/templates`, copied next to the bundle by tsup; resolved at runtime relative to `import.meta.url`).
2. **Compose entirely in memory** via `composeProject(config, templates)` → a `FileMap` (`Map<string, string | Buffer>`).
3. Capture `createdFresh = !(await fs.pathExists(targetDir))` **before** touching disk.
4. `prepareTarget` → `writeFileMap`. On any throw, **if `createdFresh`** then `fs.remove(targetDir)` (removes only what this run created), then rethrow.

`composeProject` (pure, in-memory):

1. **`activeFeatures(config)`** = `FEATURES.filter(f => f.when?.(config) ?? true)`, preserving registry order (base first; an omitted `when` ⇒ always-on).
2. For each feature, **`renderLayer(templatesDir/feature.dir, config, fileMap, fragments)`** recursively walks the template dir:
   - **Text vs binary by content, not extension:** read bytes, decode UTF-8, treat as text iff `Buffer.from(text,"utf8").equals(bytes)`. Lossless text → string; genuine binary → `Buffer`. No per-type allowlist; assets can never be corrupted.
   - **`.hbs` files** → rendered with Handlebars (`renderString`), then `outputName` strips `.hbs`. Non-`.hbs` copied verbatim. `naming.ts` also maps dotfile stand-ins (`gitignore` → `.gitignore`) via the `RENAMES` map.
   - **Routing:** a **root-level** (`prefix === ""`) string file whose output name is mergeable (`package.json`, `.env.example`, `.prettierrc.json`) is pushed onto the `fragments` bucket; everything else is `fileMap.set(path, content)`. Nested manifests (e.g. a monorepo workspace `package.json`) are written at their own path, **not** merged. Later layers overwrite earlier ones at the same `fileMap` path.
3. **Dependencies fragment** — `dependenciesFragment(features.flatMap(dependencies), features.flatMap(devDependencies))` resolves each catalog name against `VERSIONS` into a `{dependencies, devDependencies}` JSON string, appended as another `package.json` fragment. Returns `undefined` when both arrays are empty (compose guards before pushing).
4. **Merge** — for each `MERGEABLES` entry (`merge.ts`):
   - **`mergePackageJson`** — parses each fragment (throws `"Invalid package.json fragment at index N: <message>."` on bad JSON); scalar top-level keys last-wins; `dependencies`/`devDependencies`/`scripts` unioned across layers (last wins on key conflict) and emitted **sorted**; output is 2-space JSON + trailing newline.
   - **`mergeEnv`** — block-preserving. A block is a run of comment + `KEY=value` lines between blank lines, so fragments can ship `# Section` headers and **the comments survive**. A key stays in the block that mentions it first, the last fragment's value wins, and a block whose every key was already emitted disappears together with its comments. Split on the first `=`, whitespace trimmed around key and value. The merged root `.env.example` is then additionally mirrored into a real `.env` by `composeProject` — nothing loads `.env.example` at runtime, so without the mirror the scaffold would be dead on arrival.
   - **`mergePrettierConfig`** — for `.prettierrc.json`: scalar options last-wins; the `plugins` array is **concatenated in layer order and deduped**, so a feature's plugin lands after the base's (the Tailwind feature adds `prettier-plugin-tailwindcss` last this way).
5. **`if (fileMap.size === 0) throw "Composition produced no files."`** — fail-loud invariant.
6. **Manifest** — `fileMap.set("next-suite.json", serializeManifest(buildManifest(config)))` (`generator/manifest.ts`). Written **after** the invariant, so it can never be the file that satisfies it. This is what `next-suite provision` later reads back.

`prepareTarget(targetDir, action)`:

- `"empty"` first guards with `isUnsafeToEmpty` (refuses filesystem root, home dir, cwd, or an ancestor of cwd) — defense-in-depth beyond input validation.
- `fs.ensureDir`; for `"empty"` it removes every entry **except `.git`** (a full clear — deletes even benign `LICENSE`/`.vscode` by design). `"create"`/`"overwrite"` leave existing files in place.

`writeFileMap` translates each relative POSIX path to host segments and `fs.outputFile`s content (string or Buffer), creating parents.

> **Sorting/formatting is _not_ done in the generator** — it is the `fix` post-step. The generator emits templates as-authored; the project's own `eslint --fix` + Prettier sort imports and normalize the committed initial state.

### Post-steps (`post-steps/run-post-steps.ts`)

All steps are **best-effort**: each runs under a Clack spinner via the private `step()` helper; a failure shows a red message (surfaced via `failureReason()` — `stderr → stdout → shortMessage → message`) and continues so the generated project is never invalidated. External commands run through `run.ts`/`execa` with **captured** (piped, never streamed) output and a 600 s timeout.

Order and gating:

1. **`pmAvailable` precheck** — `true` unless install or shadcn is needed _and_ `isCommandAvailable(packageManager)` fails. If unavailable, warns once; install + shadcn skipped.
2. **git init** (`if config.git`) — `initGit` runs `git -c init.defaultBranch=main init` with a **cleaned env** (`replaceEnv:true`, strips `GIT_DIR`/`GIT_WORK_TREE`/etc. via `GIT_CONTEXT_VARS`, so a parent repo can't capture the new repo). Sets `gitReady`.
3. **install** (`if config.install && pmAvailable`) — plain `<pm> install`, applying per-manager `installEnv` (notably Yarn's hardened/immutable disables for a lockfile-less first install).
4. **shadcn** (`if usesShadcn && pmAvailable`) — `<pm-dlx> shadcn@latest init --template next --base <base> --pointer/--no-pointer --preset <preset|b0> --yes` via the manager's `dlx` tuple. **Ordered before fix** (adds files that need sorting/formatting) but after install. `DEFAULT_PRESET = "b0"` when preset is absent/whitespace.
5. **fix** (`if installed`, i.e. the install step above returned success) — `<pm> run fix` (= `eslint --fix && prettier --write .`), via `fixProject` (`post-steps/fix.ts`). **Gated on install success** because it needs the project's own toolchain (a failed install skips it, so one root cause never yields two errors); this leaves the committed tree both import-sorted (simple-import-sort) and `prettier --check`-clean — what the bypassed (`--no-verify`) pre-commit hook would otherwise have produced.
6. **initial commit** (`if config.git && gitReady`) — `git add -A` then `git commit --no-verify -m "chore: initial commit"` (`--no-verify` bypasses any generated pre-commit hooks — intentional), injecting a fallback committer identity via per-invocation `-c` flags only when the machine has none (`hasGitIdentity`). **Gated on `gitReady`** so a failed init doesn't surface a second redundant error.

The ordering is causal: git must exist before committing; install runs before shadcn and must succeed before fix; fix runs last so the sorted, formatted tree is what gets committed.

### Registries / single sources of truth

| Registry                              | File                               | Holds                                                                              | Derived                                  |
| ------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------- |
| `options.ts` arrays                   | `src/options.ts`                   | per-dimension `{value,label,hint?}` + display order, wrapped by `defineOptions`    | `core/types` union types                 |
| `PACKAGE_MANAGERS`                    | `src/package-managers.ts`          | `{id,label,exec,dlx,installEnv?}` per PM + `getPackageManagerEntry`                | `PackageManager` union                   |
| `FEATURES`                            | `generator/config/features.ts`     | `Feature {dir, when?, dependencies?, devDependencies?}`; base is always-on         | the composed layer order                 |
| `VERSIONS`                            | `generator/config/dependencies.ts` | the **only** place literal version strings live; `satisfies Record<string,string>` | `DependencyName = keyof typeof VERSIONS` |
| `MERGEABLES` / `MERGED_OBJECT_FIELDS` | `generator/merge.ts`               | `{file, merge}` entries + which package.json fields union                          | `isMergeable`                            |

Handlebars helpers registered globally in `engine.ts`: `eq`, `ne`, `not`, `and`, `or`, `includes`, `hasCiStep` / `hasCdStep` (whether the selected `githubActions` contain a CI or a CD step — derived from the registries in `options.ts`, so a new step never leaves a template stale), `raw` (emits its block body verbatim — for literal `{{ }}` such as GitHub Actions `${{ }}` expressions), `execPrefix`. **HTML escaping is off** (`noEscape: true`) — output is source code. `execPrefix packageManager` renders `getPackageManagerEntry(pm).exec`; an unknown `packageManager` throws (fail-loud, via `getPackageManagerEntry`).

### The `next-suite` bin (server provisioning)

A second, separate bin (`src/suite.ts`) alongside `create-next-suite` — a `citty` command with three subcommands (`provision`, `deprovision`, `config`, all under `src/provision/`), which manage a scaffolded project's server over SSH. `provision`/`deprovision` read the committed `next-suite.json`; nothing runs on the server except the SSH commands they send. **Beta** — the feature is new; treat findings against it as real bugs, not documentation gaps.

`provision/` splits the same way the rest of the CLI does — pure builders vs. an execution layer:

- **Pure builders** (unit-tested with fixtures, no I/O): `env.ts` (`.env` diffing/generation), `commands.ts` (server-setup/nginx/certbot/gh shell + argv builders — `deployTargets` is the single source of the `/srv/www/<name>` layout), `nginx.ts` (server-block rendering), `dns.ts` (hostname validation, resolves-to-host check), `port.ts` (port allocation over a reserved+live set), `plan.ts` (`buildDryRunPlan`, redacts secrets/keys), `config.ts` (`GlobalConfig` parse/serialize).
- **SSH execution layer**: `ssh.ts` (the `Runner` abstraction — `execa` under `ssh`/`scp`-style commands), `preflight.ts` (remote capability checks before touching anything), `steps.ts` (`runProvision`), `deprovision.ts` (`discoverState` + `runDeprovision` — teardown mirrors provision's remote calls, plus the `deprovisionCommand`), `config-command.ts` (`promptConfig` + the standalone `configCommand`; `provision`'s first-run config setup reuses the same `promptConfig`), `index.ts` (the `provisionCommand`, wiring flags → global config → preflight → steps).

Both `runProvision` and `runDeprovision` take an `onStep?: (line: string) => void` in their `Deps`; the commands wire it to `p.log.step` so each remote action prints as it completes instead of buffering the whole run behind one spinner. Each still returns the full `string[]` log for callers (tests) that don't need live output.

**Server layout** (`deployTargets` in `commands.ts`): the deploy/project user is the **plain project name**, no prefix — `serverSetupScript` refuses to reuse an existing account whose home isn't already `/srv/www/<name>` (a foreign-home guard; `useradd` would otherwise silently repurpose an unrelated account). `/srv/www` itself is `www-data:www-data`, mode `3775`; each project dir under it is `<user>:<user>`, mode `3755`; the uploaded `.env` is owned by the project user, mode `600`.

`--dry-run` never touches the network for planning — `index.ts` calls `buildDryRunPlan` directly instead of `runProvision`, so the preview and the real run share the same builders but diverge at the execution layer.

The deploy SSH keypair is generated once per project and persisted under `~/.config/next-suite/keys/` (`loadOrCreateKeypair` in `ssh.ts`) — reused on re-run rather than minted fresh, so `authorized_keys` and the GitHub secret stay stable. `deprovision` deletes it locally on request.

---

## Extending the CLI

### Add a generation feature (spans 3 files by design)

The **Tailwind feature** (`templates/features/tailwind/` + its `FEATURES` entry + its `VERSIONS` lines) is the canonical worked example — the first real `features/*` layer. Copy its shape:

1. **Templates:** create `templates/features/<name>/` with `.hbs` (rendered, extension stripped) or plain (copied verbatim) files. **Code files (`.ts`/`.tsx`/`.mjs`) always get the `.hbs` suffix, even without placeholders** — a plain code file under `templates/` shows bogus IDE import errors (its deps live in the generated project, not the CLI); rendering placeholder-free text is an identity operation. Binary files (e.g. `favicon.ico`) must NEVER be `.hbs` — the render would corrupt them. Store dotfiles without the leading dot and add the stand-in to the `RENAMES` map in `naming.ts` (`gitignore` → `.gitignore`); npm mangles published dotfiles. Text vs binary is auto-detected.
2. **Registry:** add one `Feature` entry to `FEATURES` (`generator/config/features.ts`) with a `when(config)` predicate (omit for always-on) and any `dependencies`/`devDependencies` by **catalog name** — follow the `@example` in that file. Either can instead be a function `(config) => DependencyName[]`, resolved via `featureDependencies` (`resolve.ts`), for packages that vary with the config — the database ORM features (`features/database/orm/*`) use this to pick their engine-specific driver (`pg`/`mysql2`, `@prisma/adapter-pg`/`@prisma/adapter-mariadb`) off `database.engine`. Output order = registry order; later layers overwrite earlier at the same path; root `package.json`/`.env.example`/`.prettierrc.json` are merged (so a feature can contribute deps, env keys, or a Prettier plugin).
3. **Versions:** declare any new version in `VERSIONS` (`generator/config/dependencies.ts`). Features reference names; `DependencyName` enforces at compile time that they exist. Run `pnpm --filter create-next-suite deps:check` (`scripts/check-deps.ts`) to see which pinned versions trail the npm `latest` tag — major bumps the `^` range won't pick up, plus stale exact pins.
4. **Env vars (if the feature has any):** two places, always together — a root `.env.example` fragment in the feature's template dir (merged, and mirrored into a real `.env` by `composeProject`) for the values, **and** a matching conditional block in `templates/base/src/env.ts.hbs` for the types/validation (t3-env schema; app code reads `env.*` from `@/env`, CLI-executed configs like `drizzle.config.ts` stay on `process.env`).
5. **Base hooks (only if the feature needs them):** a feature that must wrap the app tree ships an `src/app/providers.tsx` and toggles the `<Providers>` conditional in `templates/base/src/app/layout.tsx.hbs` (the api features are the worked example — keyed on `{{#if api}}`). One owner per file: if a second feature ever needs `providers.tsx`, that's the moment to build a merge mechanism, not a second copy.

Missing any one of the first three will silently omit the feature or cause a `DependencyName` compile error; a missing `env.ts.hbs` block fails the generated project's build (t3-env validates at startup). **Update the golden snapshot (`generator/__tests__/golden.test.ts`) in the same commit** as any deliberate output change — never refresh it casually.

**Generated-build coverage — two layers, different reach:** the **golden snapshot** composes the full `ProjectConfig`, so it pins a feature's output the moment a `SCENARIOS` entry exercises its `when` flag (db/api/auth/email are pre-wired) — you only update the snapshot. The **build matrix**, though, scaffolds through the real CLI's `--yes` flags, so it only activates dimensions that `scenarioToFlags` emits (today: package manager, Tailwind, shadcn, database/orm, api, auth, email, deployment, github-actions). For the matrix to actually _build_ a new dimension's output, give that dimension a `--yes` flag and a `scenarioToFlags` case (see **Add a wizard prompt / dimension**). A feature gated on a value **no scenario sets** also needs a new/extended scenario in `scenarios.ts`. See **CI & releases** below.

### Add a wizard prompt / dimension

1. **Options:** add the option array to `options.ts` via `defineOptions` — this auto-derives the union in `core/types.ts`. Extend `ProjectConfig` (and add a conditional sub-object like `ShadcnOptions`/`DatabaseOptions` if the feature is conditional).
2. **Prompt:** add a file in `prompts/` — a thin wrapper over `defineSelect` / `defineConfirm` / `navigableText` from `@/ui`, fed by the new `options.ts` array (spread as `[...REGISTRY]` at the call site). Prompt signature is `(canGoBack: boolean, initialValue?: T) => Promise<T | symbol>` — the optional `initialValue` restores the prior answer on back-navigation (threaded in `project-setup.ts` as `a.<key>`).
3. **Wizard:** add a `WizardStep` to the array in `project-setup.ts` (return `undefined` from `run` to skip for conditional branches), add the key to `WizardAnswers` (optional `?` if conditional), and wire it in `buildProjectConfig` (use `required()` for unconditional steps). For conditional `"none"`-style guards, mirror the existing `database !== undefined && database !== "none"` pattern.
4. **Consume:** read the new field in the relevant feature template / `when` predicate and/or post-step.
5. **Non-interactive (`--yes`):** to make the dimension settable without the wizard, add the flag to `index.ts` (citty `args`), to `CLIFlags`, and map it in `configFromFlags` (`prompts/from-flags.ts` — the wizard's counterpart: it builds `WizardAnswers` from flags + defaults, then reuses `buildProjectConfig`). If the flag **affects generated output**, also add a `scenarioToFlags` case (`generator/__tests__/scenarios.ts`) so the generated-build matrix reproduces it.
6. **Summary panel:** if the dimension should show in the closing summary's "Stack", add one `labelOf(<OPTIONS>, config.<field>)` line to `buildSummary` (`ui/outro.ts`). New _options_ within an existing dimension need nothing — their labels resolve from `options.ts` automatically; only a brand-new dimension costs a line.

### Add a package manager

1. Extend the `PackageManager` union in `package-managers.ts` and add one `PACKAGE_MANAGERS` entry: `id`, `label`, `exec` (local-binary runner), `dlx` (non-empty `readonly [string, ...string[]]` tuple), optional `installEnv`.

That single edit flows everywhere: detection (`pm-detector`), the prompt (options/labels), install (`installEnv`), shadcn (`dlx`), and the `execPrefix` Handlebars helper. `getPackageManagerEntry` throws `"Unknown package manager: <id>."` on an unknown id (fail-loud).

### Keeping the READMEs in sync

Two READMEs document the product: the root `README.md` (fuller — product, monorepo, dev) and `packages/cli/README.md` (compact, npm-facing). When changing what the CLI ships:

- **Document only what ships** — capabilities that `FEATURES` + the post-steps actually generate. A wizard question whose answer produces no files belongs under a **Roadmap** heading, _not_ "What you get". Neither README has such a heading today, and none is needed — every wizard dimension generates output. Tailwind, the database layer (engine + ORM), the API layer (tRPC/oRPC), email, shadcn's post-step, the production deployment stack, and the GitHub Actions CI/CD all ship real output.
- **When you add a generation feature** (a `templates/features/*` dir + a `FEATURES` entry), add it to **What you get** in both READMEs (moving it out of a **Roadmap** section, if one exists by then), and fold its stack into the relevant list.
- **Version at the major level** ("Next.js 16", "React 19") — let `VERSIONS` own exact numbers so the prose can't drift on a bump.
- Keep `packages/cli/README.md` short (it is the npm page); put product depth in the root README and architecture/conventions here.

---

## Conventions

This is the rulebook. Match it from the first line of new code.

### Style

- **Arrow functions only — never the `function` keyword.** Every export and helper is `const name = (...) => ...`. `function` appears nowhere in `src/**/*.ts` (only in JSDoc prose / generated template snapshots). E.g. `export const runWizard = async <A>(steps: WizardStep<A>[]): Promise<Partial<A>> => {...}`.
- **Prettier defaults, enforced by `.prettierrc.json`:** `printWidth: 80`, `tabWidth: 2`, `semi: true`, `singleQuote: false` (double quotes), `trailingComma: "all"`. `prettier-plugin-packagejson` reorders `package.json`. Write expecting 80-col wrapping; never hand-format wider — run `prettier --write` on touched files.
- **TS strictness assumed, incl. `noUncheckedIndexedAccess`:** guard indexed access — `const step = steps[index]; if (!step) break;` with a comment noting the guard is unreachable but satisfies the flag.

### Imports

- **`@/` alias for cross-layer imports; relative only within the same subtree.** `import type { ProjectConfig } from "@/core/types"`; but `import { MERGEABLES } from "./merge"` within a directory. `ui/navigable.ts` imports `./style` relatively (style is not in the `@/ui` barrel).
- **`simple-import-sort` groups (eslint error), blank-line-separated, in this exact order:** (1) side-effect `^\u0000`; (2) `node:` builtins; (3) npm packages `^@?\w`; (4) `@/` alias; (5) anything else `^` (e.g. `../package.json`); (6) relative `^\.`. Example (`compose.ts`): `node:path` → blank → `@/core/types` → blank → `./merge`, `./render`, `./resolve`.
- **`simple-import-sort/exports` is also error** — keep barrel exports sorted (see `ui/index.ts`).

### Naming

- **Verb-first functions:** `render*`, `build*`, `select*`, `resolve*`, `detect*`, `compose*`, `merge*`, `validate*`, `get*`, `confirm*`/`input*`, `define*`, `run*`.
- **Boolean helpers read as predicates:** `is*` / `has*` / `uses*` — `isMergeable`, `isTemplate`, `isGoBack`, `isCommandAvailable`, `isWithinCwd`, `isExistingFile`, `hasConflictingFiles`.
- **`SCREAMING_SNAKE_CASE` for module-level constants & registries:** `VERSIONS`, `FEATURES`, `PACKAGE_MANAGERS`, `MERGEABLES`, `MERGED_OBJECT_FIELDS`, `GO_BACK`, `HBS_EXTENSION`, `DEFAULT_RUN_TIMEOUT_MS`, `COMPONENT_LIBRARIES`, etc.
- **`PascalCase` for types/interfaces:** `ProjectConfig`, `WizardStep`, `Feature`, `PackageManagerEntry`, `Mergeable`, `RunOptions`, `ConflictAction`.
- **`kebab-case` file names, one concept per file:** `pm-detector.ts`, `build-config.ts`, `run-post-steps.ts`, `next-steps.ts`. Tests live in a sibling `__tests__/` as `<subject>.test.ts`.
- **Analogous things named analogously:** every prompt exports `select*`/`confirm*`/`input*`; every mergeable is `{ file, merge }`; every PM is `{ id, label, exec, dlx, installEnv? }`.

### JSDoc

- **Document exports where they carry intent**, with `@param`/`@returns`/`@throws` matching existing density (e.g. `getPackageManagerEntry`, `composeProject`).
- **Do not restate the type system** — an already-`?` param is not re-described as "optional"; add meaning instead (`@param initialName - Optional name to pre-fill the first prompt with.`).
- **Private helpers get a one-line doc only when non-obvious** (`lastShownBefore` — "Find the last step before `index` that produced UI."). Trivial helpers (`sortKeys`, `hint`, `parseVersion`) get nothing.
- **Use `{@link ...}`** to cross-reference registries/types.
- **`@example` blocks on extension seams** — `Feature` carries a worked example, because adding a feature is the main future task.

### Comments

- **Explain a non-obvious WHY — a gotcha or tradeoff — never narrate what the code says.** Real examples: `// shadcn/ui already bundles Tailwind, so it is only asked here.`; `// reset so canGoBack is accurate when this step re-renders`; `// unreachable (loop guard) — satisfies noUncheckedIndexedAccess`.
- **No narration comments** (`// loop over features`) anywhere.

### Fail-loud invariants

- **Invariants throw rather than emit broken output.** Throw sites: `required()` → `"Wizard invariant violated: <field> is missing."`; `composeProject` → `"Composition produced no files."`; `mergePackageJson` → `"Invalid package.json fragment at index N: <message>."`; `getPackageManagerEntry` → `"Unknown package manager: <id>."`; `prepareTarget` → `"Refusing to empty …: it is a filesystem root…"`.
- **Error messages are full sentences ending with a period.**
- **Validation returns `string | undefined`** (error message or "all good") — it does **not** throw. Throwing is reserved for programmer-error invariants, not user input (`validateProjectInput`, `isExistingFile`). Validation messages: `"Name or path is required."`, `"A file already exists at that path — choose another name."`, `"Target must be inside the current directory — no '..' or absolute paths."`.

### Registries / single source of truth

- **Values live in exactly one declared registry; nothing is inlined.** `VERSIONS` is the only place a literal version string appears; feature files reference catalog _names_, never versions. One intentional exception: the `packageManager` pins in `templates/base/package.json.hbs` (`pnpm@…`, `yarn@…`) are literal — Corepack needs an exact version to activate deterministically in the Docker build, and they are not npm dependencies `VERSIONS` can track.
- **Union types are derived, never hand-maintained:** `type ComponentLibrary = (typeof COMPONENT_LIBRARIES)[number]["value"]`; sub-unions via `Exclude` (`DatabaseEngine = Exclude<DatabaseChoice, "none">`).
- **`defineOptions<const T>`** preserves literal values for union derivation and type-checks each entry against `Option` — no `as const satisfies` at each call site.
- **Leaf-module discipline:** `options.ts` and `package-managers.ts` import nothing from the layers (documented in their header JSDoc) so every layer can read them without a cycle. Adding an option/PM is an edit in one file.

### Layering (do not cross the boundaries)

- Pipeline is `prompts → ProjectConfig → generator`, plus `post-steps`. `ProjectConfig` (`core/types.ts`) is the contract; **change a feature's shape there first.**
- **`core/`** = pure logic, imports only `core/`/leaves and node/npm.
- **`ui/`** consumers import only from `@/ui`; `style.ts` is UI-internal and re-exports nothing publicly.
- **`prompts/`** may import `core`, `ui`, `wizard`, `options`, `package-managers` — never `generator`/`post-steps`.
- **`generator/`** imports `@/core/types`, its own `config/`, node/npm — not `prompts`/`ui`.
- **`post-steps/`** uses the `run`/`isCommandAvailable` wrappers in `run.ts` and `package-managers` for `exec`/`dlx`/`installEnv`.

### Async / sync discipline

- **Async only where required** (e.g. `hasConflictingFiles` for fs-extra). `isExistingFile` is **intentionally synchronous** because Clack's `validate` callback does not accept a Promise — making it async silently breaks validation.

### Testing

- **Unit-test internal generator LOGIC with synthetic fixtures, not real templates.** `merge.test.ts` feeds hand-written `JSON.stringify({...})` fragments (`next: "^15"`, a fake `drizzle: "^0.3"`) and asserts union/sort/last-wins behavior — never real versions or real template content.
- **Do not couple tests to real template content or pinned versions** — use invented packages so tests survive bumps.
- **The real template is verified by the golden snapshot** (`generator/__tests__/golden.test.ts` + `__snapshots__/golden.test.ts.snap`), the one place real rendered output is pinned — the mandated step-0 safety net for refactors.
  - **Deliberate output change** (you edited a template, bumped `VERSIONS`, or added a feature whose files appear): regenerate with `pnpm --filter create-next-suite test:update` (the `test:update` script — `vitest run -u`), **review the `.snap` diff** to confirm it is exactly the change you intended, and commit it in the **same commit** with the reason in the message. Never refresh casually.
  - **New config dimension** (a new package manager, database engine, feature toggle, …): add or extend a scenario in `SCENARIOS` (`generator/__tests__/scenarios.ts`, **shared** by the golden test _and_ the generated-build CI matrix) so the dimension is exercised — otherwise its output is never **pinned**. To get it **built** by the matrix too, it also needs a `--yes` flag + a `scenarioToFlags` case (a new package manager is already covered by the existing `--pm` case). No workflow edit either way — the matrix auto-derives from `SCENARIOS`. Then update the snapshot as above.
  - **Snapshot red after a refactor you expected to be output-neutral:** the refactor changed output by accident — **fix the refactor; do not `-u`.**
- **Per-symbol tests for pure helpers**, each `test()` named as a behavioral sentence (`"mergePackageJson unions + sorts deps; last scalar wins, absent scalars kept"`). Edge cases get their own test; **error paths are asserted** (`toThrow(/Invalid package\.json fragment/)`).
- Tests use vitest, import the subject relatively from `../`, and live in `__tests__/`. In tests, pass an explicit `templatesDir` via `ScaffoldOptions` — never rely on `TEMPLATES_DIR` (couples to build output).

### Commits & process

- **Conventional Commits**, English imperative subject with a scope — e.g. `refactor(cli): wrap the dimension options in a typed const helper`.
- **Code-only commits — never commit planning/design/scratch docs** (`docs/**`); they get reset out of the tree.
- **Branch, don't commit straight to `main`** unless asked; commit/push only on request.

---

## Verification

After **any** change to the CLI, all four must be green (run from the repo root):

```bash
pnpm --filter create-next-suite check-types
pnpm --filter create-next-suite build
pnpm --filter create-next-suite test
pnpm lint
```

Single test file/pattern: `pnpm --filter create-next-suite exec vitest run merge`. End-to-end smoke: `pnpm cli` (builds, then runs `node packages/cli/dist/index.js`).

**Generated output stays Prettier-clean.** The committed initial tree of a scaffolded project must be `prettier --check`-clean and import-sorted — that is what the `fix` post-step (`eslint --fix` + Prettier) guarantees, and what the golden snapshot pins. If you change template output deliberately, regenerate and update the golden snapshot in the same commit; if a refactor changes the snapshot unexpectedly, the refactor is wrong, not the snapshot.

---

## CI & releases

GitHub Actions live in `.github/`; a reusable `.github/actions/setup` composite (pnpm + Node + `--frozen-lockfile` install) backs every job.

### Workflows

- **`ci.yml`** (PRs + pushes to `main`): `verify` (check-types, lint, format:check, build, `publint`) · `test` across **Node 24 and 26** · a PR-only `changeset` job that fails when a `src/`/`templates/` change ships without a changeset (skipped on the `changeset-release/main` version PR, which has consumed its own).
- **`generated-build.yml`** (PRs touching `packages/cli/src`, `templates`, or `scripts`, + `main`): a dynamic matrix that scaffolds each `SCENARIOS` project through the **real CLI** (`create-next-suite app --yes <flags>`) — installing with the scenario's package manager and running **shadcn init + the fix step** — then runs `build → typecheck` on the _output_. This is the proof the golden snapshot cannot give: that a scaffolded project actually **builds end-to-end**, post-steps included, not merely that its `FileMap` matches. A `matrix` job emits the entries from `packages/cli/scripts/matrix.ts` (`pnpm --filter create-next-suite run matrix` → `{ name, pm, flags }` per scenario).
- **`zizmor.yml`** (PRs that touch `.github/workflows/**` or `.github/actions/**`, plus every push to `main`): runs [zizmor](https://github.com/zizmorcore/zizmor) over the workflow definitions with `permissions: {}`. Editing a workflow therefore triggers a job the other three do not cover.
- **`release.yml`** (pushes to `main`): `changesets/action` opens/updates a `chore(release): version packages` PR; merging it runs `changeset version` and **`changeset publish`** — tagging the release, creating a GitHub Release from the changelog, and publishing to npm under `latest`. Requires the `NPM_TOKEN` secret, and npm provenance is on, which needs the repository to stay public.

### `SCENARIOS` is shared; the matrix is derived

`SCENARIOS` (`generator/__tests__/scenarios.ts`) is the single source for **both** the golden snapshot and the generated-build matrix, so they never drift. `scenarioToFlags(config)` (same file) maps each scenario to its `--yes` flags; `scripts/matrix.ts` emits the matrix from `SCENARIOS` + `scenarioToFlags`, so **adding or changing a scenario needs no workflow edit** — the matrix auto-derives. Note the asymmetry: the golden snapshot composes the **full** `ProjectConfig` (db/api/auth/email pre-wired), so it pins any feature once a scenario exercises it; the matrix only activates the `--yes` flags `scenarioToFlags` emits (pm/Tailwind/shadcn/database/orm/api/auth/email/deployment/github-actions), so a new dimension needs a `--yes` flag + a `scenarioToFlags` case to be **built** there too.

### Releasing (Changesets)

Record a changelog entry per change: `pnpm changeset` → pick the bump, write one line → a `.changeset/*.md` committed with the PR. Merges to `main` accumulate into the "Version Packages" PR; **merging that PR is the deliberate release trigger** — version bump, `CHANGELOG.md`, npm publish, and GitHub release all follow. Never hand-edit a version or the changelog. The private `@next-suite/*` config packages are ignored; only `create-next-suite` is versioned and published. **[`.changeset/README.md`](../../.changeset/README.md) is the full guide** — when a changeset is (and isn't) needed, the empty-changeset rule, and bump levels.
