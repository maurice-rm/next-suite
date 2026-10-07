# The generated project

## Overview

Every generated project is a single Next.js application — not a monorepo. The core stack is present regardless of what you selected in the wizard, at these exact versions:

| Package              | Version    | Role                                             |
| -------------------- | ---------- | ------------------------------------------------ |
| `next`               | `16.3.6`   | Framework (App Router).                          |
| `react`              | `19.3.0`   | UI runtime.                                      |
| `react-dom`          | `19.3.0`   | DOM renderer.                                    |
| `typescript`         | `~6.0.3`   | Language, in strict mode.                        |
| `zod`                | `^4.4.3`   | Schema validation, used by the typed env module. |
| `@t3-oss/env-nextjs` | `^0.13.11` | Typed, validated environment variables.          |

The always-installed dev toolchain:

| Package                            | Version    | Role                                |
| ---------------------------------- | ---------- | ----------------------------------- |
| `@types/node`                      | `^24.13.3` | Node type definitions.              |
| `@types/react`                     | `^19`      | React type definitions.             |
| `@types/react-dom`                 | `^19`      | React DOM type definitions.         |
| `eslint`                           | `^9.39.4`  | Linter (flat config).               |
| `eslint-config-next`               | `16.3.6`   | Next.js lint presets.               |
| `typescript-eslint`                | `8.71.0`   | Type-checked strict lint presets.   |
| `eslint-config-prettier`           | `^10.1.8`  | Turns off formatting rules.         |
| `eslint-plugin-simple-import-sort` | `^14.0.0`  | Import ordering.                    |
| `eslint-plugin-import`             | `^2.32.0`  | Import hygiene.                     |
| `eslint-plugin-check-file`         | `^3.3.2`   | Kebab-case file and folder names.   |
| `eslint-plugin-boundaries`         | `^7.2.0`   | No imports between features.        |
| `prettier`                         | `^3.8.4`   | Formatter.                          |
| `prettier-plugin-packagejson`      | `^3.0.2`   | Sorts `package.json`.               |
| `knip`                             | `^6.39.0`  | Unused files, exports and deps.     |
| `husky`                            | `^9.1.7`   | Git hooks.                          |
| `lint-staged`                      | `^17.0.7`  | Runs the formatter on staged files. |
| `@commitlint/cli`                  | `^21.0.2`  | Commit-message linting.             |
| `@commitlint/config-conventional`  | `^21.0.2`  | Conventional Commits ruleset.       |
| `babel-plugin-react-compiler`      | `1.0.0`    | React Compiler.                     |

The project declares `engines.node` as `>=24.0.0` and pins the same major in `.nvmrc`.

## Project structure

This is what the base layer writes, before any feature is applied:

```text
.
├── .editorconfig
├── .gitattributes
├── .gitignore
├── .husky/
│   ├── commit-msg
│   └── pre-commit
├── .lintstagedrc.json
├── .nvmrc
├── .prettierignore
├── .prettierrc.json
├── AGENTS.md
├── README.md
├── commitlint.config.mjs
├── eslint.config.mjs
├── knip.json
├── next.config.ts
├── package.json
├── public/
│   └── .gitkeep
├── scripts/
│   └── setup.sh
├── src/
│   ├── app/
│   │   ├── error.tsx
│   │   ├── favicon.ico
│   │   ├── global-error.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── not-found.tsx
│   │   └── page.tsx
│   └── env.ts
└── tsconfig.json
```

Two more files always appear, produced by the generator rather than by a template: `next-suite.json` (the manifest) and `.env` (a verbatim copy of the merged `.env.example`). The `.env` copy exists only when at least one feature contributed environment variables — the base layer ships none.

Each feature then adds its own files. The conditions are the `when` predicates in `src/generator/config/features.ts`.

| Feature layer                              | Applies when                                                                  | Files added                                                                                                                                                                                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/pnpm`                            | the package manager is pnpm                                                   | `pnpm-workspace.yaml` (release-age delay, build-script allowlist, accepted audit advisories)                                                                                                                                                                               |
| `features/npm`                             | the package manager is npm                                                    | `.npmrc` (release-age delay, enforced install-script allowlist)                                                                                                                                                                                                            |
| `features/bun`                             | the package manager is Bun                                                    | `bunfig.toml` (release-age delay)                                                                                                                                                                                                                                          |
| `features/yarn`                            | the package manager is Yarn                                                   | `.yarnrc.yml` (release-age gate, accepted audit advisories)                                                                                                                                                                                                                |
| `features/seo`                             | an API layer or Better-Auth is chosen (the project has `NEXT_PUBLIC_APP_URL`) | `src/app/robots.ts`, `src/app/sitemap.ts`                                                                                                                                                                                                                                  |
| `features/tailwind`                        | Tailwind is enabled                                                           | `postcss.config.mjs`, `src/app/globals.css` (replaces the base file), plus a `.prettierrc.json` fragment                                                                                                                                                                   |
| `features/database/engine/postgres`        | the engine is PostgreSQL                                                      | `docker-compose.yml`, plus an `.env.example` fragment                                                                                                                                                                                                                      |
| `features/database/engine/mysql`           | the engine is MySQL                                                           | `docker-compose.yml`, plus an `.env.example` fragment                                                                                                                                                                                                                      |
| `features/database/orm/drizzle`            | the ORM is Drizzle                                                            | `drizzle.config.ts`, `src/lib/database/index.ts`, `src/lib/database/schema/index.ts`, plus a `package.json` fragment                                                                                                                                                       |
| `features/database/orm/prisma`             | the ORM is Prisma                                                             | `prisma.config.ts`, `prisma/schema.prisma`, `src/lib/database/index.ts`, plus a `package.json` fragment                                                                                                                                                                    |
| `features/api/shared`                      | an API layer is chosen                                                        | `src/lib/domain-error.ts`                                                                                                                                                                                                                                                  |
| `features/api/trpc`                        | the API layer is tRPC                                                         | `src/app/providers.tsx`, `src/app/api/trpc/[trpc]/route.ts`, `src/trpc/{client.ts,index.ts,query-client.ts,server.tsx}`, `src/trpc/routers/app-router.ts`, `src/features/health/server/router.ts`, plus an `.env.example` fragment                                         |
| `features/api/orpc/core`                   | the API layer is oRPC                                                         | `src/app/providers.tsx`, `src/app/api/rpc/[[...rest]]/route.ts`, `src/orpc/{client.server.ts,client.ts,index.ts,request-logging.ts,query-client.ts,server.tsx}`, `src/orpc/routers/app-router.ts`, `src/features/health/server/router.ts`, plus an `.env.example` fragment |
| `features/api/orpc/openapi`                | the API layer is oRPC and OpenAPI is on                                       | `src/app/api/v1/[[...rest]]/route.ts`, `src/orpc/routers/public-api-router.ts`                                                                                                                                                                                             |
| `features/auth/better-auth/core`           | auth is Better-Auth and a database is configured                              | `src/app/api/auth/[...all]/route.ts`, `src/lib/auth/{client.ts,index.ts,session.ts}`, plus an `.env.example` fragment                                                                                                                                                      |
| `features/auth/better-auth/schema/drizzle` | auth is Better-Auth and the ORM is Drizzle                                    | `src/lib/database/schema/auth.ts`                                                                                                                                                                                                                                          |
| `features/auth/better-auth/schema/prisma`  | auth is Better-Auth and the ORM is Prisma                                     | `prisma/models/auth.prisma`                                                                                                                                                                                                                                                |
| `features/email/resend`                    | the email provider is Resend                                                  | `src/lib/email/index.ts`, plus an `.env.example` fragment                                                                                                                                                                                                                  |
| `features/logging`                         | an API layer or Better-Auth is chosen, or production is on with a database    | `src/lib/logger.ts`, `src/instrumentation.ts`                                                                                                                                                                                                                              |
| `features/production/core`                 | a production deployment mode was chosen                                       | `.dockerignore`, `DEPLOY.md`, `docker-compose.prod.yml`, `next.Dockerfile`, `nginx/nginx.conf`, `scripts/prod.sh`, `src/app/api/health/route.ts`, plus an `.env.example` fragment                                                                                          |
| `features/production/entrypoint`           | production is on and a database is configured                                 | `entrypoint.sh`                                                                                                                                                                                                                                                            |
| `features/production/drizzle`              | production is on and the ORM is Drizzle                                       | `drizzle/.gitkeep`, `scripts/migrate.ts`                                                                                                                                                                                                                                   |
| `features/github-actions/ci`               | at least one CI step was selected                                             | `.github/actions/setup/action.yml`, `.github/workflows/ci.yml`, `renovate.json`                                                                                                                                                                                            |
| `features/github-actions/cd`               | production is on and at least one CD step was selected                        | `.github/workflows/cd.yml`                                                                                                                                                                                                                                                 |

## Pages and styling

The base pages (`page.tsx`, `not-found.tsx`, `error.tsx`, `global-error.tsx`) are placeholders with one `h1` each; `global-error.tsx` imports the stylesheet and sets its own `<title>`, since it replaces the root layout. Without shadcn/ui the stylesheet defines OKLCH role tokens (`background`, `foreground`, `muted-foreground`, `primary`, `primary-foreground`, `ring`) through `light-dark()` with `color-scheme: light dark`, so the pages follow the system theme and `themeColor` declares both. With Tailwind the pages style their link and button from those tokens. shadcn/ui brings its own tokens, whose dark theme follows a `.dark` class; until a theme switch sets it, those projects stay light and declare a single `themeColor`. Projects with `NEXT_PUBLIC_APP_URL` also get `robots.ts` and a `sitemap.ts` listing the start page.

## Security headers

`next.config.ts` sets the security headers on every route through `headers()`, so they apply in development, behind any proxy and in both deployment modes: a Content-Security-Policy following the Next.js guide's version without nonces (`'unsafe-eval'` in development only, `upgrade-insecure-requests` outside development), `Strict-Transport-Security` (outside development; two years, **without** `includeSubDomains` — a scaffold cannot know whether the app runs on an apex domain), `X-Content-Type-Options`, `Referrer-Policy`, a `Permissions-Policy` that disables unused device features, and the cross-origin policies. With the Scalar docs UI, the `/api/v1` page gets a CSP that additionally allows exactly the pinned Scalar script (`cdn.jsdelivr.net/npm/@scalar/api-reference@<version>`, the version from `VERSIONS`), its fonts from `fonts.scalar.com` and the `eval` it uses. The standalone nginx sets no headers of its own; the host block `next-suite provision` writes sets the same values and hides the app's copies, so each header arrives once. `next.config.ts` imports `src/env.ts`, which also validates the environment at build time.

## Feature matrix

Packages are listed with the version the generator writes. Files marked as fragments are merged rather than written; see [How files are composed](#how-files-are-composed).

| Feature           | Selection                                                              | Packages                                                                                                                                                                                       | Files                                                                                                                | Environment variables                                                                                               |
| ----------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Yarn support      | `--pm yarn`                                                            | none                                                                                                                                                                                           | `.yarnrc.yml`                                                                                                        | none                                                                                                                |
| Tailwind CSS      | `--tailwind`, or implied by `--shadcn`                                 | dev: `tailwindcss@^4.3.1`, `@tailwindcss/postcss@^4.3.1`, `postcss@^8.5.15`, `prettier-plugin-tailwindcss@^0.8.0`                                                                              | `postcss.config.mjs`, `src/app/globals.css`, `.prettierrc.json` fragment                                             | none                                                                                                                |
| PostgreSQL        | `--database postgres`                                                  | none directly — the driver comes with the ORM                                                                                                                                                  | `docker-compose.yml`, `.env.example` fragment                                                                        | `COMPOSE_PROJECT_NAME`, `POSTGRES_PORT`, `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE` |
| MySQL             | `--database mysql`                                                     | none directly — the driver comes with the ORM                                                                                                                                                  | `docker-compose.yml`, `.env.example` fragment                                                                        | `COMPOSE_PROJECT_NAME`, `MYSQL_PORT`, `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`                |
| Drizzle           | `--orm drizzle`                                                        | `drizzle-orm@^0.45.2`, `dotenv@^17.4.2`, `server-only@^0.0.1`, and `pg@^8.22.0` (PostgreSQL) or `mysql2@^3.22.5` (MySQL); dev: `drizzle-kit@^0.31.10`, plus `@types/pg@^8.20.0` for PostgreSQL | `drizzle.config.ts`, `src/lib/database/index.ts`, `src/lib/database/schema/index.ts`, `package.json` fragment        | none of its own                                                                                                     |
| Prisma            | `--orm prisma`                                                         | `@prisma/client@^7.8.0`, `dotenv@^17.4.2`, `server-only@^0.0.1`, and `@prisma/adapter-pg@^7.8.0` (PostgreSQL) or `@prisma/adapter-mariadb@^7.8.0` (MySQL); dev: `prisma@^7.8.0`                | `prisma.config.ts`, `prisma/schema.prisma`, `src/lib/database/index.ts`, `package.json` fragment                     | none of its own                                                                                                     |
| tRPC              | `--api trpc`                                                           | `@trpc/server@^11.18.0`, `@trpc/client@^11.18.0`, `@trpc/tanstack-react-query@^11.18.0`, `@tanstack/react-query@^5.104.0`, `superjson@^2.2.6`, `server-only@^0.0.1`, `zod@^4.4.3`              | the `src/trpc/` tree, the route handler, `src/app/providers.tsx`, `.env.example` fragment                            | `NEXT_PUBLIC_APP_URL`                                                                                               |
| oRPC              | `--api orpc`                                                           | `@orpc/server@^1.14.6`, `@orpc/client@^1.14.6`, `@orpc/tanstack-query@^1.14.6`, `@tanstack/react-query@^5.104.0`, `server-only@^0.0.1`                                                         | the `src/orpc/` tree, the route handler, `src/app/providers.tsx`, `.env.example` fragment                            | `NEXT_PUBLIC_APP_URL`                                                                                               |
| OpenAPI (oRPC)    | `--openapi`                                                            | `@orpc/openapi@^1.14.6`, `@orpc/zod@^1.14.6`                                                                                                                                                   | `src/app/api/v1/[[...rest]]/route.ts`, `src/orpc/routers/public-api-router.ts`                                       | none of its own                                                                                                     |
| Scalar docs UI    | `--scalar`                                                             | none — it is a flag on the OpenAPI layer                                                                                                                                                       | no extra file; it changes what `src/app/api/v1/[[...rest]]/route.ts` serves                                          | none                                                                                                                |
| Better-Auth       | `--auth better-auth`                                                   | `better-auth@^1.6.23`, `server-only@^0.0.1`                                                                                                                                                    | `src/lib/auth/`, `src/app/api/auth/[...all]/route.ts`, an ORM-specific schema file, `.env.example` fragment          | `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`                                                                         |
| Resend            | `--email resend`                                                       | `resend@^6.17.1`, `server-only@^0.0.1`                                                                                                                                                         | `src/lib/email/index.ts`, `.env.example` fragment                                                                    | `RESEND_API_KEY`, `EMAIL_FROM`                                                                                      |
| Logging           | implied by `--api` or `--auth`, or by `--deployment` with `--database` | `pino@^10.3.1`, `server-only@^0.0.1`; dev: `pino-pretty@^13.1.3`                                                                                                                               | `src/lib/logger.ts`, `src/instrumentation.ts`                                                                        | none                                                                                                                |
| Production        | `--deployment standalone\|proxied`                                     | dev: `esbuild@^0.28.2` when the ORM is Drizzle                                                                                                                                                 | the Docker, nginx, and deploy files listed above; `entrypoint.sh` with a database; `scripts/migrate.ts` with Drizzle | `COMPOSE_PROJECT_NAME`, `DOCKER_IMAGE`, and `APP_PORT` in proxied mode                                              |
| GitHub Actions CI | `--github-actions lint,typecheck,format,build`                         | none                                                                                                                                                                                           | `.github/actions/setup/action.yml`, `.github/workflows/ci.yml`, `renovate.json`                                      | none in `.env.example`                                                                                              |
| GitHub Actions CD | `--github-actions image,deploy`                                        | none                                                                                                                                                                                           | `.github/workflows/cd.yml`                                                                                           | none in `.env.example`                                                                                              |

`src/lib/logger.ts` imports `server-only`, like every module that holds a server secret (`src/lib/{auth,database,email}`, `src/trpc/index.ts`, `src/orpc/index.ts`), so a client component cannot import it. The production image bundles `scripts/migrate.ts` with esbuild's `react-server` condition, which resolves the marker to its no-op build, so the migration logs through the same logger. The condition for the layer lives twice: `usesLogger` in `features.ts` and the `pino-pretty` entry in `knip.json.hbs`; change both together.

### Errors and logging

- **Unexpected errors** are logged once, at `error`, where they are handled: the API route handlers for procedures, and `onRequestError` in `src/instrumentation.ts` for Server Components, Server Actions and route handlers. The client only sees `Internal server error`.
- **Rejected requests** (400, 401, 403, 429, including malformed bodies) are logged at `warn` with the client IP from `x-real-ip` (and the user ID with tRPC); failed sign-ins are logged the same way through a Better-Auth hook, and Better-Auth's own log lines go through pino.
- **Domain errors:** a feature throws a subclass of `DomainError` (`src/lib/domain-error.ts`) with a stable code and a kind (`invalid`, `not-found`, `conflict`, `forbidden`). One middleware on `publicProcedure` maps the kind to the matching tRPC or oRPC error code; the client receives the stable code as the message.
- **OpenAPI** serves only `publicApiRouter`: a procedure appears under `/api/v1` and in its spec once it is listed there, while `/api/rpc` serves the whole `appRouter`. Its errors are Problem Details (RFC 9457, `application/problem+json`), including the 404 for an unknown path; validation errors carry their issues under `errors`.
- **Redaction:** the logger redacts passwords, tokens (`token`, `accessToken`, `refreshToken`, `idToken`), secrets, cookies and the `authorization` header, also inside `headers` objects. Its error serializer replaces the bound values Drizzle appends to a failed query's message (`params: …`), and `onRequestError` logs the path without its query string. A database driver's own message can still quote the single value it rejected.

### How the two workflows relate

`CI` runs the selected checks on every pull request. It is also a reusable workflow (`workflow_call`), and when `CD` is generated it is `CD` that runs it: a `ci` job calls `.github/workflows/ci.yml`, the image job sits on `needs: ci`, and the deploy job's `!failure()` covers the whole chain. A red check therefore never reaches the registry or the server.

Because `CD` runs it on a push to `main`, `CI` drops its own `push: main` trigger in that case — two runs would otherwise collide in the `ci-${{ github.ref }}` concurrency group and cancel each other. A manual `CD` run (`workflow_dispatch`) skips `CI`, since it redeploys an already-published tag rather than building one.

The job first copies `.env.example` to `.env`, so every step — including the build, which imports `src/env.ts` through `next.config.ts` — validates the environment against harmless example values instead of skipping validation. It then audits the dependencies (`pnpm audit`, `yarn npm audit --all --recursive --no-deprecations`, or `bun audit`); the lint step is followed by `knip`. `renovate.json` holds new releases back for one day, matching the package manager's release-age delay.

### Supply chain

Every package manager installs only releases at least one day old and runs install scripts only for an allowlist (`esbuild`, `sharp`, `unrs-resolver`, plus `prisma` and `@prisma/engines` in Prisma projects):

| Package manager | Release-age delay                            | Install-script allowlist                                             | Pinned through                           |
| --------------- | -------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------- |
| pnpm            | `minimumReleaseAge` in `pnpm-workspace.yaml` | `allowBuilds` in `pnpm-workspace.yaml`                               | `packageManager`                         |
| npm             | `min-release-age` in `.npmrc`                | `allowScripts` in `package.json`, enforced by `strict-allow-scripts` | the npm bundled with Node                |
| Yarn            | `npmMinimalAgeGate` in `.yarnrc.yml`         | `dependenciesMeta.*.built` in `package.json`                         | `packageManager`                         |
| Bun             | `minimumReleaseAge` in `bunfig.toml`         | `trustedDependencies` in `package.json`                              | `packageManager` (CI and the Dockerfile) |

Where an upstream package pins a release with a known vulnerability and a compatible fix exists, the generator forces the fixed version through the package manager's override setting (`overrides` in `package.json` for npm and Bun, `resolutions` for Yarn, `overrides` in `pnpm-workspace.yaml` for pnpm) — today `mysql2` and `mariadb` under Prisma. Advisories without such a fix that reach only build or lint tooling are accepted by ID (`ACCEPTED_ADVISORIES` in `src/generator/config/advisories.ts`, each with its reason) and ignored by the audit. npm cannot ignore a single advisory, so npm projects get no audit step; GitHub's Dependabot alerts cover them.

The `CI` build step receives the repository variables (`env: ${{ vars }}`), so a project that needs `NEXT_PUBLIC_APP_URL` at build time gets the same value `CD` bakes into the image. Those projects also get a guard step that fails with a readable message when the variable is unset.

## Scripts

The base `package.json` template defines these scripts:

| Script         | Command                                                                 | Purpose                                                           |
| -------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `build`        | `next build`                                                            | Production build.                                                 |
| `check`        | `tsc --noEmit && eslint --max-warnings 0 && prettier --check . && knip` | Type-check, lint, format-check and unused-code check in one pass. |
| `dev`          | `next dev`                                                              | Development server.                                               |
| `fix`          | `eslint --fix && prettier --write .`                                    | Auto-fix lint problems, then format. Used by the post-step.       |
| `format`       | `prettier --write .`                                                    | Format everything.                                                |
| `format:check` | `prettier --check .`                                                    | Fail on unformatted files.                                        |
| `knip`         | `knip`                                                                  | Report unused files, exports and dependencies.                    |
| `lint`         | `eslint --max-warnings 0`                                               | Lint; a warning fails like an error.                              |
| `lint:fix`     | `eslint --fix`                                                          | Lint and auto-fix.                                                |
| `prepare`      | `husky`                                                                 | Install the git hooks after an install.                           |
| `setup`        | `bash scripts/setup.sh`                                                 | First-run setup: create `.env`, install, start the database.      |
| `start`        | `next start`                                                            | Serve the production build.                                       |
| `typecheck`    | `tsc --noEmit`                                                          | Type-check only.                                                  |

The Drizzle layer adds:

| Script        | Command                | Purpose                                                                 |
| ------------- | ---------------------- | ----------------------------------------------------------------------- |
| `db:generate` | `drizzle-kit generate` | Generate migrations from the schema.                                    |
| `db:migrate`  | `drizzle-kit migrate`  | Apply pending migrations.                                               |
| `db:push`     | `drizzle-kit push`     | Push the schema without migrations, for throwaway local databases only. |
| `db:studio`   | `drizzle-kit studio`   | Open Drizzle Studio.                                                    |

The Prisma layer adds:

| Script        | Command              | Purpose                                                                 |
| ------------- | -------------------- | ----------------------------------------------------------------------- |
| `db:generate` | `prisma generate`    | Regenerate the client.                                                  |
| `db:migrate`  | `prisma migrate dev` | Create and apply a development migration.                               |
| `db:push`     | `prisma db push`     | Push the schema without migrations, for throwaway local databases only. |
| `db:studio`   | `prisma studio`      | Open Prisma Studio.                                                     |
| `postinstall` | `prisma generate`    | Regenerate the client after every install.                              |

Script keys are sorted alphabetically in the written `package.json`, so the `db:*` entries appear interleaved with the base ones.

## Environment variables

These are every variable that can end up in the generated `.env.example`, collected from the fragments each feature contributes. `<project-name>` is the directory name your project was generated into.

| Variable               | Example value                            | Contributed by                   |
| ---------------------- | ---------------------------------------- | -------------------------------- |
| `COMPOSE_PROJECT_NAME` | `<project-name>`                         | PostgreSQL, MySQL, or production |
| `POSTGRES_PORT`        | `5432`                                   | PostgreSQL                       |
| `POSTGRES_HOST`        | `localhost`                              | PostgreSQL                       |
| `POSTGRES_USER`        | `next`                                   | PostgreSQL                       |
| `POSTGRES_PASSWORD`    | `next`                                   | PostgreSQL                       |
| `POSTGRES_DATABASE`    | `<project-name>`                         | PostgreSQL                       |
| `MYSQL_PORT`           | `3306`                                   | MySQL                            |
| `MYSQL_HOST`           | `localhost`                              | MySQL                            |
| `MYSQL_USER`           | `root`                                   | MySQL                            |
| `MYSQL_PASSWORD`       | `next`                                   | MySQL                            |
| `MYSQL_DATABASE`       | `<project-name>`                         | MySQL                            |
| `NEXT_PUBLIC_APP_URL`  | `http://localhost:3000`                  | tRPC, oRPC, or Better-Auth       |
| `BETTER_AUTH_SECRET`   | `insecure-dev-secret-change-me-32chars!` | Better-Auth                      |
| `RESEND_API_KEY`       | `re_dev_placeholder_replace_me`          | Resend                           |
| `EMAIL_FROM`           | `App <onboarding@resend.dev>`            | Resend                           |
| `APP_PORT`             | `8100`                                   | production, `proxied` mode only  |
| `DOCKER_IMAGE`         | empty                                    | production                       |

The placeholders for `BETTER_AUTH_SECRET` and `RESEND_API_KEY` are development stand-ins. Replace them before you deploy — `src/env.ts` only checks that the secret is at least 32 characters and that the API key is non-empty, not that either is real.

`.gitignore` excludes `.env*` but re-includes `.env.example`, so the example stays in version control and your real values do not.

### Variables not in the example file

These are referenced by generated code but never written into `.env.example`. You do not set them by hand for a normal development run.

| Variable              | Where it is used                                                                                                                                                                                                    | Value                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `SKIP_ENV_VALIDATION` | `src/env.ts` skips validation when it is truthy. Set in the `next.Dockerfile` builder stage only; CI validates against `.env.example`.                                                                              | `true`                                     |
| `NODE_ENV`            | Validated by `src/env.ts` in every project and set in the `next.Dockerfile` runner stage. The logger takes its level and pretty output from it; the Prisma client module branches on it to avoid a hot-reload leak. | `production` in the image                  |
| `PORT`                | Set in the `next.Dockerfile` runner stage.                                                                                                                                                                          | `3000`                                     |
| `HOSTNAME`            | Set in the `next.Dockerfile` runner stage, so the standalone server listens on all interfaces.                                                                                                                      | `0.0.0.0`                                  |
| `NODE_VERSION`        | A build argument in `next.Dockerfile`, used for every stage's base image.                                                                                                                                           | `24-slim` by default                       |
| `DEPLOY_TAG`          | Used by the CD workflow to pick the image tag to deploy. Validated against a character allowlist before use.                                                                                                        | the workflow input, or `latest` when unset |

## How files are composed

Generation runs entirely in memory first. The generator selects the active features in registry order, walks each feature's template directory, and accumulates the result into one map of path to content. Only after the whole project exists in memory is anything written to disk — and a target directory that this run created is removed again if the write fails.

The layer order is the order of the `FEATURES` array: `base` first, then pnpm, Yarn, Tailwind, the database engine, the ORM, the API layer, auth, email, production, and finally the GitHub Actions layers. Within that order, **a later layer overwrites an earlier one at the same output path**. That is how `features/tailwind` replaces the base `src/app/globals.css`.

Along the way:

- A file ending in `.hbs` is rendered as a Handlebars template and loses the extension. Everything else is copied through unchanged, byte for byte.
- The stand-in name `gitignore` is renamed to `.gitignore` on output.
- Binary files are detected by content, not by extension, and pass through untouched.

Three files are the exception to overwrite-wins. They are **merged** across layers instead, and only at the project root — a nested `package.json` in some subdirectory is written at its own path like any other file.

### `package.json`

Each layer contributes a JSON fragment, base first, and the resolved dependency list is appended as the final fragment. Merging then works field by field:

- The fields `dependencies`, `devDependencies`, and `scripts` are unioned across all fragments. On a key collision the last fragment wins.
- Every other top-level field is replaced outright by the last fragment that declares it. A field no later fragment mentions keeps the earlier value.
- Those three maps are emitted with their keys sorted alphabetically.
- The output is two-space-indented JSON with a trailing newline.
- A fragment that does not parse, is not a JSON object, or carries a `dependencies`, `devDependencies` or `scripts` field that is not an object aborts generation with `Invalid package.json fragment at index <n>: <reason>.`

### `.env.example`

The merge is block-aware, and **comments and block structure survive it**. A block is a run of comment lines and `KEY=value` lines; blocks are separated by blank lines in the fragment.

- Values are resolved first, across all fragments: the last fragment that sets a key wins.
- Blocks are then emitted in fragment order. A key is emitted in the first block that mentions it, and skipped in every later block.
- A block whose keys were all emitted earlier disappears entirely, taking its comment lines with it.
- Surviving blocks are joined by exactly one blank line, and the file ends with a newline.
- Whitespace around the key and around the value is trimmed. Only the first `=` splits a line, so an `=` inside a value is preserved.
- Lines that contain no `=` are dropped.

This behaviour is pinned by the tests in `src/generator/__tests__/merge.test.ts` — specifically that `["# Database\nA=1\nnonsense", "# Auth\nB=2"]` merges to `# Database\nA=1\n\n# Auth\nB=2\n`, and that a block repeating an already-emitted key vanishes along with its own comment header.

Once merged, `.env.example` is copied verbatim to `.env`. Nothing in the project reads `.env.example`, so without that copy a freshly generated project would start with no environment at all.

### `.prettierrc.json`

- Scalar options take the value from the last fragment that sets them.
- The `plugins` arrays are concatenated in layer order and deduplicated last-seen-wins, so a plugin that a later layer re-declares moves to the end of the list. That is what guarantees `prettier-plugin-tailwindcss` runs last.
- An empty or absent `plugins` array is omitted from the output.
- The output is two-space-indented JSON with a trailing newline.
- A fragment that does not parse, is not a JSON object, or carries a `plugins` field that is not an array of strings aborts generation with `Invalid .prettierrc.json fragment at index <n>: <reason>.`

Finally, the manifest `next-suite.json` is added to the map, and the whole map is written to disk.

## `next-suite.json`

The manifest records the choices that produced the project. `next-suite provision` and `next-suite deprovision` read it from the current directory and refuse to run without it.

| Field            | Type                                                                           | Always present | Meaning                                                           |
| ---------------- | ------------------------------------------------------------------------------ | -------------- | ----------------------------------------------------------------- |
| `version`        | `1`                                                                            | yes            | Manifest schema version. Anything else is rejected.               |
| `name`           | string                                                                         | yes            | The project name (the target directory's basename).               |
| `packageManager` | `"npm"` \| `"pnpm"` \| `"bun"` \| `"yarn"`                                     | yes            | The manager the project was scaffolded for.                       |
| `database`       | `{ engine: "postgres" \| "mysql", orm: "drizzle" \| "prisma" }`                | no             | Omitted when no database was chosen.                              |
| `api`            | `{ type: "trpc" }` or `{ type: "orpc", openapi?: { scalar: boolean } }`        | no             | Omitted when no API layer was chosen.                             |
| `auth`           | `"better-auth"` \| `"none"`                                                    | yes            | The auth provider.                                                |
| `email`          | `"resend"` \| `"none"`                                                         | yes            | The email provider.                                               |
| `production`     | `{ mode: "standalone" \| "proxied" }`                                          | no             | Omitted when no production deployment was chosen.                 |
| `githubActions`  | array of `"lint"`, `"typecheck"`, `"format"`, `"build"`, `"image"`, `"deploy"` | yes            | The selected pipeline steps, in canonical order. Empty when none. |

An example from a full-stack project:

```json
{
  "version": 1,
  "name": "<project-name>",
  "packageManager": "pnpm",
  "database": {
    "engine": "postgres",
    "orm": "drizzle"
  },
  "api": {
    "type": "trpc"
  },
  "auth": "better-auth",
  "email": "resend",
  "production": {
    "mode": "standalone"
  },
  "githubActions": ["lint", "typecheck", "format", "build", "image", "deploy"]
}
```

When a command reads the manifest it validates it: the file must be valid JSON, an object, carry `version: 1`, and hold a non-empty `name` that starts with a lowercase letter and contains only lowercase letters, digits, dots, underscores, and hyphens. `provision` additionally requires `production.mode` to be `proxied`.

## After generation

Once the files are on disk, the CLI runs a short sequence of post-steps. **Every step is best-effort**: it runs under its own spinner, and a failure prints a red line plus the tool's own stderr or stdout and then continues with the next step. None of them can invalidate the generated project, and none of them changes the exit code.

Before the sequence starts, the CLI probes your `PATH` for the selected package manager — but only when it is actually needed (an install or the shadcn setup was requested). If it is missing you get a warning naming the command to run yourself, and both of those steps are skipped.

| Order | Step              | Runs when                                                                              | What it does                                                                                                                                                                                                                                    |
| ----- | ----------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | git init          | git was enabled                                                                        | `git init` with `init.defaultBranch=main`, in an environment stripped of inherited git context variables.                                                                                                                                       |
| 2     | Install           | install was enabled and the manager is available                                       | `<package-manager> install`. Yarn additionally gets `YARN_ENABLE_HARDENED_MODE=0` and `YARN_ENABLE_IMMUTABLE_INSTALLS=false`, because a fresh scaffold has no lockfile yet.                                                                     |
| 3     | shadcn/ui setup   | shadcn/ui was chosen and the manager is available                                      | Runs `shadcn@latest init` through the manager's one-off runner, with `--template next`, your base, `--pointer` or `--no-pointer`, `--preset <code>` (falling back to `b0`), and `--yes`.                                                        |
| 4     | Initial migration | the install succeeded, a database and a production deployment were chosen              | Drizzle: `<package-manager> run db:generate`. Prisma: `prisma migrate diff --from-empty --to-schema prisma --script` into `prisma/migrations/0_init/migration.sql`. Both work offline, so the first production deploy has a migration to apply. |
| 5     | Fix files         | the install or the shadcn/ui setup succeeded (shadcn installs the dependencies itself) | `<package-manager> run fix` — ESLint auto-fix followed by Prettier, so the first commit is already sorted and formatted.                                                                                                                        |
| 6     | Initial commit    | git was enabled and step 1 succeeded                                                   | `git add -A`, then `git commit --no-verify -m "chore: initial commit"`.                                                                                                                                                                         |

Two dependencies between the steps are deliberate. The fix step runs only once the dependencies are installed — by the install step, or by the shadcn/ui setup, which installs them even with `--no-install` — because it needs that toolchain. The commit runs only after a successful `git init`, so a missing repository does not produce a second error for the same cause.

If the machine has no committer identity configured — neither locally nor globally — the initial commit supplies a fallback identity for that one commit: the name `create-next-suite` and the address `create-next-suite@users.noreply.github.com`. Your own identity is never overwritten when you have one.

Every external command runs with stdin ignored, stdout and stderr captured, and a timeout of 600000 ms (10 minutes). A command that exceeds it is killed and reported as a failed step.

---

[Documentation index](README.md)
