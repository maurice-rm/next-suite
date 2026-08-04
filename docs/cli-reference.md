# CLI reference

## Synopsis

The `create-next-suite` package ships two executables, declared as `bin` entries in `packages/cli/package.json`:

| Binary              | Entry point       | Purpose                                           |
| ------------------- | ----------------- | ------------------------------------------------- |
| `create-next-suite` | `./dist/index.js` | Scaffold a new Next.js project.                   |
| `next-suite`        | `./dist/suite.js` | Server tooling for an already scaffolded project. |

Scaffold a project without installing anything:

```bash
npm create next-suite@latest my-app
```

You get the wizard, and afterwards a `my-app/` directory containing the generated project.

Run the same thing non-interactively:

```bash
npx create-next-suite@latest my-app --yes --pm pnpm --tailwind
```

You get no prompts, and the project is built from the flags plus the defaults below.

The second binary is available once the package is installed (globally, or as a dependency of the generated project):

```bash
next-suite provision --dry-run
```

You get the planned server changes printed to stdout and nothing is written.

## `create-next-suite` flags

The flag names, types, and aliases come from `src/index.ts`. The defaults are not declared in citty — they are produced in `src/prompts/from-flags.ts` when a flag is omitted, so they apply to `--yes` runs. In an interactive run the wizard asks instead, and its own defaults differ (see [The interactive wizard](#the-interactive-wizard)).

| Flag               | Alias | Type       | Default (in `--yes` mode)                                          | Description                                                        |
| ------------------ | ----- | ---------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `<name>`           | —     | positional | none — required with `--yes`                                       | Project name or path. `.` targets the current directory.           |
| `--yes`            | `-y`  | boolean    | `false`                                                            | Non-interactive: build from flags plus defaults, no prompts.       |
| `--pm`             | —     | string     | the manager detected from `npm_config_user_agent`, else `npm`      | Package manager: `npm`, `pnpm`, `yarn`, `bun`.                     |
| `--tailwind`       | —     | boolean    | `false`; forced to `true` when `--shadcn` is passed                | Add Tailwind CSS.                                                  |
| `--shadcn`         | —     | boolean    | `false`                                                            | Add shadcn/ui (implies Tailwind).                                  |
| `--shadcn-base`    | —     | string     | `base`                                                             | shadcn base library: `base` or `radix`.                            |
| `--shadcn-preset`  | —     | string     | none — the post-step falls back to shadcn's blank base preset `b0` | shadcn preset code.                                                |
| `--shadcn-pointer` | —     | boolean    | `false`                                                            | Pointer cursor on buttons.                                         |
| `--database`       | —     | string     | none — no database feature                                         | Database engine: `postgres` or `mysql` (with `--orm`).             |
| `--orm`            | —     | string     | none — no ORM feature                                              | ORM: `drizzle` or `prisma` (with `--database`).                    |
| `--api`            | —     | string     | none — no API layer                                                | API layer: `trpc` or `orpc`.                                       |
| `--openapi`        | —     | boolean    | `false`                                                            | Generate an OpenAPI/REST layer (oRPC only).                        |
| `--scalar`         | —     | boolean    | `false`                                                            | Add a Scalar API-docs UI (requires `--openapi`).                   |
| `--auth`           | —     | string     | none — auth is `none`                                              | Auth provider: `better-auth` (requires `--database`).              |
| `--email`          | —     | string     | none — email is `none`                                             | Email provider: `resend`.                                          |
| `--deployment`     | —     | string     | none — no production files                                         | Production deployment: `standalone` or `proxied`.                  |
| `--github-actions` | —     | string     | none — no workflows                                                | Comma-separated steps: `lint,typecheck,format,build,image,deploy`. |
| `--git`            | —     | boolean    | `true`                                                             | Initialize git. Pass `--no-git` to skip.                           |
| `--install`        | —     | boolean    | `true`                                                             | Install dependencies. Pass `--no-install` to skip.                 |
| `--overwrite`      | —     | boolean    | `false`                                                            | Proceed into a conflicting target, keeping the existing files.     |
| `--empty`          | —     | boolean    | `false`                                                            | Empty a conflicting target first (everything except `.git`).       |
| `--help`           | `-h`  | boolean    | —                                                                  | Print usage and exit. Provided by citty.                           |
| `--version`        | `-v`  | boolean    | —                                                                  | Print the version and exit. Provided by citty.                     |

Selecting `deploy` in `--github-actions` also enables `image`, and the steps are re-ordered into the canonical order `lint, typecheck, format, build, image, deploy` before generation.

## Non-interactive mode (`--yes`)

`--yes` skips the banner, the version lookup, and every prompt. It runs the same validation as the wizard, then hands the resolved configuration to the same generator. A rejected flag combination aborts before anything is written.

The rules below are listed in the order `configFromFlags` evaluates them. The messages are exact; `<value>` marks the offending input echoed back.

| Rule                                                   | Exact message                                                                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| A project name must be given.                          | `A project name is required in --yes mode — pass it as the argument.`                                                       |
| The name must not be empty after trimming.             | `Name or path is required.`                                                                                                 |
| The target must stay inside the current directory.     | `Target must be inside the current directory — no '..' or absolute paths.`                                                  |
| The name must be a valid npm package name.             | the first error or warning from `validate-npm-package-name`, or `Invalid project name.` when it reports neither             |
| The path must not resolve to an existing file.         | `A file already exists at that path — choose another name.`                                                                 |
| `--overwrite` and `--empty` are mutually exclusive.    | `--overwrite and --empty are mutually exclusive — pass only one.`                                                           |
| The shadcn sub-flags require `--shadcn`.               | `--shadcn-base, --shadcn-preset, and --shadcn-pointer require --shadcn.`                                                    |
| A preset code must be a bare token.                    | `Invalid --shadcn-preset: Use only letters, numbers, - or _.`                                                               |
| A non-empty target needs an override flag.             | `"<name>" already has conflicting files — pass --overwrite or --empty to proceed.`                                          |
| `--shadcn-base` must name a known base.                | `Unknown shadcn base "<value>" — expected one of base, radix.`                                                              |
| `--database` and `--orm` must be passed together.      | `--database and --orm must be passed together.`                                                                             |
| `--database` must name a known engine.                 | `Unknown database "<value>" — expected one of postgres, mysql.`                                                             |
| `--orm` must name a known ORM.                         | `Unknown ORM "<value>" — expected one of drizzle, prisma.`                                                                  |
| `--api` must name a known API layer.                   | `Unknown api "<value>" — expected one of trpc, orpc.`                                                                       |
| `--scalar` requires `--openapi`.                       | `--scalar requires --openapi.`                                                                                              |
| `--openapi` requires `--api orpc`.                     | `--openapi requires --api orpc.`                                                                                            |
| `--auth` requires `--database`.                        | `--auth requires --database — Better-Auth needs a database adapter.`                                                        |
| `--auth` must name a known provider.                   | `Unknown auth "<value>" — expected one of better-auth.`                                                                     |
| `--email` must name a known provider.                  | `Unknown email "<value>" — expected one of resend.`                                                                         |
| `--deployment` must name a known mode.                 | `Unknown deployment "<value>" — expected one of standalone, proxied.`                                                       |
| Every `--github-actions` entry must be a known step.   | `Unknown github-actions step "<value>" — expected a comma-separated list of lint, typecheck, format, build, image, deploy.` |
| The `image` and `deploy` steps require `--deployment`. | `--github-actions image/deploy requires --deployment.`                                                                      |
| `--pm` must name a known package manager.              | `Unknown package manager "<value>" — expected one of npm, pnpm, bun, yarn.`                                                 |

A failing rule prints the message and exits with code `1`.

## The interactive wizard

Without `--yes` the CLI prints the banner, then walks the steps below in order. Steps are grouped into sections; a section badge prints above the first prompt of each group.

A step with a `when` condition is skipped silently when the condition does not hold — no prompt, no badge. Every step from `componentLibrary` onwards carries the same outer condition `quickStart` is false, so answering yes to quick start ends the wizard immediately.

Selects and confirms show their default as the pre-selected entry. Every confirm built through `defineConfirm` defaults to `Yes`; the quick-start confirm is the one exception and defaults to `No`.

### Project

| Step             | Question (verbatim)                                                | Type    | Options                                                                                           | Default                                    | Shown when                                  |
| ---------------- | ------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------- |
| `input`          | `Enter your project name or path ("." = current directory)`        | text    | placeholder `my-app`                                                                              | the positional argument, if you passed one | always                                      |
| `action`         | `"<path>" exists and is not empty. How would you like to proceed?` | select  | `Empty the directory — delete everything except .git`, `Continue (keep existing files)`, `Cancel` | the first listed entry                     | the target directory holds non-benign files |
| `packageManager` | `Which package manager would you like to use?`                     | select  | `npm`, `pnpm`, `Bun`, `Yarn` — the detected one carries the hint `detected`                       | the detected manager, otherwise `npm`      | always                                      |
| `quickStart`     | `Quick start with recommended defaults (Tailwind, no extras)?`     | confirm | `Yes` / `No`                                                                                      | `No`                                       | always                                      |

The `Empty the directory` option is hidden when the target is the current working directory. Choosing `Cancel` prints `Operation cancelled.` and exits with code `0`.

### UI

| Step               | Question (verbatim)                                                            | Type    | Options                                                                  | Default     | Shown when               |
| ------------------ | ------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------ | ----------- | ------------------------ |
| `componentLibrary` | `Which component library would you like to use?`                               | select  | `shadcn/ui` (hint `recommended`), `None` (hint `bring your own styling`) | `shadcn/ui` | quick start was declined |
| `base`             | `Which base library should shadcn/ui use?`                                     | select  | `Base UI` (hint `default`), `Radix UI`                                   | `Base UI`   | the library is shadcn/ui |
| `pointer`          | `Use a pointer cursor on buttons?`                                             | confirm | `Yes` / `No`                                                             | `Yes`       | the library is shadcn/ui |
| `preset`           | `Preset code from shadcn/create (optional — empty uses the blank base preset)` | text    | placeholder `e.g. b27GcrRo`                                              | empty       | the library is shadcn/ui |
| `tailwind`         | `Use Tailwind CSS?`                                                            | confirm | `Yes` / `No`                                                             | `Yes`       | the library is `None`    |

A preset must contain only letters, digits, `-`, or `_`; anything else is rejected with `Use only letters, numbers, - or _.`. Leaving it empty makes the shadcn post-step use the preset code `b0`.

### Data & API

| Step       | Question (verbatim)                                    | Type    | Options                       | Default       | Shown when                   |
| ---------- | ------------------------------------------------------ | ------- | ----------------------------- | ------------- | ---------------------------- |
| `database` | `Which database would you like to use?`                | select  | `PostgreSQL`, `MySQL`, `None` | `PostgreSQL`  | quick start was declined     |
| `orm`      | `Which ORM would you like to use?`                     | select  | `Drizzle`, `Prisma`           | `Drizzle`     | a database other than `None` |
| `auth`     | `Which authentication solution would you like to use?` | select  | `Better-Auth`, `None`         | `Better-Auth` | a database other than `None` |
| `api`      | `Which API layer would you like to use?`               | select  | `tRPC`, `oRPC`, `None`        | `tRPC`        | quick start was declined     |
| `openapi`  | `Add an OpenAPI (REST) layer for oRPC?`                | confirm | `Yes` / `No`                  | `Yes`         | the API layer is oRPC        |
| `scalar`   | `Include a Scalar API-docs UI?`                        | confirm | `Yes` / `No`                  | `Yes`         | the OpenAPI layer is enabled |

### Integrations

| Step    | Question (verbatim)                           | Type   | Options          | Default  | Shown when               |
| ------- | --------------------------------------------- | ------ | ---------------- | -------- | ------------------------ |
| `email` | `Which email provider would you like to use?` | select | `Resend`, `None` | `Resend` | quick start was declined |

### Deployment

| Step         | Question (verbatim)                              | Type    | Options                                                                                                | Default | Shown when                  |
| ------------ | ------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------ | ------- | --------------------------- |
| `production` | `Set up production deployment (Docker + nginx)?` | confirm | `Yes` / `No`                                                                                           | `Yes`   | quick start was declined    |
| `nginxMode`  | `Who terminates TLS?`                            | select  | `nginx` (hint `this container terminates TLS`), `an upstream reverse proxy` (hint `nginx serves HTTP`) | `nginx` | production deployment is on |

The two TLS answers map to the config values `standalone` and `proxied`.

### CI/CD

| Step                   | Question (verbatim)      | Type                | Options                                                                                                                                                                                                               | Default                       | Shown when               |
| ---------------------- | ------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------ |
| `githubActionsEnabled` | `Set up GitHub Actions?` | confirm             | `Yes` / `No`                                                                                                                                                                                                          | `Yes`                         | quick start was declined |
| `githubActionsSteps`   | `Pipeline steps`         | grouped multiselect | group `CI`: `Lint` (hint `eslint`), `Type-check` (hint `tsc`), `Format check` (hint `prettier`), `Build` (hint `next build`); group `CD`: `Build & push image` (hint `ghcr`), `Deploy` (hint `includes build & push`) | `Lint`, `Type-check`, `Build` | GitHub Actions are on    |

The `CD` group is offered only when production deployment is enabled. Group headers are selectable and toggle their whole group, and an empty selection is allowed.

### Setup

| Step      | Question (verbatim)            | Type    | Options      | Default | Shown when               |
| --------- | ------------------------------ | ------- | ------------ | ------- | ------------------------ |
| `git`     | `Initialize a git repository?` | confirm | `Yes` / `No` | `Yes`   | quick start was declined |
| `install` | `Install dependencies?`        | confirm | `Yes` / `No` | `Yes`   | quick start was declined |

### What quick start produces

Answering `Yes` to the quick-start confirm skips every step listed after it. The configuration is then fixed, regardless of what the skipped steps would have asked:

| Setting           | Value                                    |
| ----------------- | ---------------------------------------- |
| Component library | `none`                                   |
| Tailwind CSS      | enabled                                  |
| shadcn/ui         | not configured                           |
| Database          | none                                     |
| API layer         | none                                     |
| Auth              | `none`                                   |
| Email             | `none`                                   |
| Production        | none                                     |
| GitHub Actions    | no steps                                 |
| git init          | enabled                                  |
| Install           | enabled                                  |
| Package manager   | whatever you answered in the third step  |
| Conflict action   | whatever you answered in the second step |

## Navigation

Back-navigation is wired onto every prompt through `src/ui/navigable.ts`, and the footer of each prompt lists the keys that apply.

| Prompt type                  | Back key | Other keys                                             |
| ---------------------------- | -------- | ------------------------------------------------------ |
| Text (`navigableText`)       | `Esc`    | `enter` confirms                                       |
| Select (`navigableSelect`)   | `b`      | arrow keys navigate, `enter` confirms                  |
| Confirm (`navigableConfirm`) | `b`      | arrow keys toggle, `y` / `n` select, `enter` confirms  |
| Multiselect (grouped)        | `b`      | arrow keys navigate, `space` toggles, `enter` confirms |

Going back returns to the previous step that actually rendered — skipped steps are jumped over — and the prompt reopens with your earlier answer pre-filled. The first rendered step offers no back key, and its footer omits the hint.

`Ctrl+C` cancels at any prompt. The CLI prints `Operation cancelled.` and exits with code `0`.

## Exit codes

| Code | Binary              | Condition                                                                                                                                                                           |
| ---- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | both                | The run finished successfully.                                                                                                                                                      |
| `0`  | both                | You cancelled at a prompt, or declined a confirmation gate. Nothing further runs.                                                                                                   |
| `0`  | both                | `--help` / `-h` or `--version` / `-v` was handled by citty.                                                                                                                         |
| `1`  | `create-next-suite` | The running Node version is below the `engines.node` floor.                                                                                                                         |
| `1`  | `create-next-suite` | Flag validation or wizard resolution failed. Nothing was written.                                                                                                                   |
| `1`  | `create-next-suite` | Generation raised a fatal error. Post-steps cannot reach this — each one is caught individually.                                                                                    |
| `1`  | `next-suite`        | Any of the three subcommands threw — no manifest, an unsupported deployment mode, a failed preflight, an unreachable server, a domain already served by another project, and so on. |
| `1`  | `next-suite`        | citty could not parse the command line — an unknown subcommand. `create-next-suite` declares no required argument and ignores unknown flags, so it cannot fail this way.            |

A failure during generation prints the error. When the run had chosen the `empty` action, the message also warns that the target directory may already have been cleared.

Post-generation steps are best-effort and never change the exit code — see [The generated project](generated-project.md#after-generation).

## `next-suite` subcommands

`next-suite` groups three subcommands. All three **read** the global config file the CLI keeps for you; only `config` and `provision` ever **write** it — `provision` only when it does not exist yet, and never under `--dry-run`. The first two additionally require a `next-suite.json` in the current directory.

| Subcommand    | Flags                                                                                              | What it does                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `provision`   | `--domain <host>`, `--yes` / `-y` (requires `--domain`), `--dry-run`, `--staging`, `--skip-github` | Prepares a server for the current project over SSH.                                   |
| `deprovision` | `--domain <host>`, `--yes` / `-y`, `--skip-github`                                                 | Tears a previously provisioned target back down, gate by gate.                        |
| `config`      | none                                                                                               | Shows and edits the global config (server host, admin SSH user, Let's Encrypt email). |

`provision` accepts only projects generated with the `proxied` production mode; anything else is rejected before it touches the network. Start with `--dry-run`, which prints the plan and changes nothing — not even the config file.

See [Provisioning](provisioning.md).

## Requirements

| Requirement                                         | Needed for                                                 | Enforcement                                                                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Node.js >= 24                                       | running the CLI at all                                     | Checked in `src/index.ts` against `engines.node` before any work; a lower version exits with `1`.                                 |
| A package manager (`npm`, `pnpm`, `yarn`, or `bun`) | installing dependencies and running the shadcn setup       | Probed on your `PATH`. If it is missing, both steps are skipped with a warning and generation still succeeds.                     |
| git                                                 | the `git init` and initial-commit post-steps               | Probed on your `PATH`. Missing git fails those two steps only.                                                                    |
| Docker                                              | the database feature and the production deployment feature | Not checked by the CLI. The generated `docker-compose.yml`, `docker-compose.prod.yml`, and `next.Dockerfile` need it at run time. |

Check the Node version before you start:

```bash
node --version
```

You need `v24.0.0` or higher. Anything lower makes the CLI print which version it needs and exit.

---

[Documentation index](README.md)
