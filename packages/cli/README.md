# create-next-suite

> A better starting point for Next.js.

[![npm](https://img.shields.io/npm/v/create-next-suite?color=2563eb)](https://www.npmjs.com/package/create-next-suite)
[![downloads](https://img.shields.io/npm/dm/create-next-suite?color=2563eb)](https://www.npmjs.com/package/create-next-suite)
[![node](https://img.shields.io/badge/node-%E2%89%A524-3c873a)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-MIT-blue)](https://github.com/maurice-rm/next-suite/blob/main/LICENSE)
[![status](https://img.shields.io/badge/status-beta-f59e0b)](https://github.com/maurice-rm/next-suite/releases)

An interactive CLI that scaffolds an opinionated, production-ready **Next.js 16 · React 19 · TypeScript** project — then leaves you in a formatted, git-initialized app that runs on the first try.

> **⚠️ Beta** — pre-1.0 release; flags and generated output may still change.

## 🚀 Quick start

```bash
npm create next-suite@latest my-app
# or:  pnpm create next-suite@latest my-app  ·  yarn create next-suite@latest my-app  ·  bun create next-suite@latest my-app
```

While the package is in beta, `@latest` is required — a bare name resolves to the semver range `*`, which excludes prereleases like the current `1.0.0-beta.x`. Drop it once `1.0.0` ships.

Answer the guided wizard (with back-navigation) and the CLI generates the project, then optionally installs dependencies, formats it, and makes an initial commit. For CI, `--yes` builds from flags — see [Non-interactive / CI](#-non-interactive--ci).

## ✨ What you get

⚡ and 🧰 ship in every project; the rest are optional integrations chosen in the wizard.

- ⚡ **Next 16 · React 19 · TypeScript (strict)** — App Router, React Compiler, `@/*` alias
- 🧰 **DX toolchain** — ESLint · Prettier · Husky · lint-staged · commitlint · typed env (`@t3-oss/env-nextjs`)
- 🎨 **Tailwind CSS + shadcn/ui** _(optional)_
- 🗄️ **Database** _(optional)_ — PostgreSQL / MySQL with Drizzle or Prisma
- 🔌 **API** _(optional)_ — tRPC / oRPC + TanStack Query, optional OpenAPI + Scalar
- 🔐 **Better-Auth** · ✉️ **Resend** _(optional)_
- 🐳 **Production** _(optional)_ — multi-stage Docker + nginx + compose
- 🤖 **GitHub Actions CI/CD** _(optional)_

## 📋 Requirements

**Node.js ≥ 24** and one of npm / pnpm / yarn / bun. **git** for the initial commit; **Docker** only for the database and production features.

`next-suite provision` additionally needs an **`ssh` client with `ssh-keygen`** (it generates and installs the deploy key) and the **GitHub CLI `gh`, authenticated** — or `--skip-github`, which prints the secrets for you to set by hand.

## 🧑‍💻 Non-interactive / CI

`--yes` skips every prompt and builds from flags plus defaults:

```bash
npx create-next-suite@latest my-app --yes --pm pnpm --tailwind \
  --database postgres --orm drizzle --auth better-auth
```

| Flag                                 | Default (`--yes`)     | Description                                                  |
| ------------------------------------ | --------------------- | ------------------------------------------------------------ |
| `<name>`                             | required with `--yes` | Project name or path; `.` targets the current directory      |
| `--yes`, `-y`                        | `false`               | Non-interactive                                              |
| `--pm <npm\|pnpm\|yarn\|bun>`        | detected, else `npm`  | Package manager                                              |
| `--tailwind`                         | `false`               | Tailwind CSS (forced on by `--shadcn`)                       |
| `--shadcn`                           | `false`               | shadcn/ui — implies Tailwind                                 |
| `--shadcn-base <base\|radix>`        | `base`                | shadcn base library                                          |
| `--shadcn-preset <code>`             | shadcn's blank preset | Preset code from shadcn/create                               |
| `--shadcn-pointer`                   | `false`               | Pointer cursor on buttons                                    |
| `--database <postgres\|mysql>`       | none                  | Dockerized local database — pass with `--orm`                |
| `--orm <drizzle\|prisma>`            | none                  | ORM — pass with `--database`                                 |
| `--api <trpc\|orpc>`                 | none                  | API layer + TanStack Query                                   |
| `--openapi`                          | `false`               | OpenAPI/REST layer — oRPC only                               |
| `--scalar`                           | `false`               | Scalar API-docs UI — requires `--openapi`                    |
| `--auth <better-auth>`               | none                  | Auth — requires `--database`                                 |
| `--email <resend>`                   | none                  | Email provider                                               |
| `--deployment <standalone\|proxied>` | none                  | Production Docker + nginx                                    |
| `--github-actions <steps>`           | none                  | Comma-separated: `lint,typecheck,format,build,image,deploy`  |
| `--no-git`, `--no-install`           | both on               | Skip git init / dependency install                           |
| `--overwrite`, `--empty`             | `false`               | Proceed into a non-empty target — keep it, or clear it first |

Note the asymmetry: in the wizard every yes/no question defaults to **yes**, while the matching flags default to **off**. `create-next-suite --help` prints the full list; the [CLI reference](https://github.com/maurice-rm/next-suite/blob/main/docs/cli-reference.md) documents every wizard step, validation rule, and exit code.

## 🛰️ Server provisioning

> **⚠️ Beta** — `provision`/`deprovision` are new and experimental: a run changes a real server (creates a user, writes nginx config, obtains TLS certificates, sets GitHub secrets), and bugs are possible. Run `--dry-run` first to see the exact commands, use `--staging` for a first TLS run (a Let's Encrypt test certificate, no rate limits), and prefer a throwaway subdomain for the first try. `deprovision` exists to roll a run back.

`next-suite provision` runs **locally** in the project directory: it reads the committed `next-suite.json` and drives the target server over SSH — nothing is installed on the server beyond what the steps below describe. **Proxied projects only** — it aborts on a standalone deployment (no host nginx to configure). It also needs the project's committed `.env.example` on disk (the template for the server `.env`) and a project name starting with a lowercase letter.

The `provision`/`deprovision`/`config` commands live on the `next-suite` bin, which ships inside this package — install it globally once (pnpm needs a one-time `pnpm setup` before `pnpm add -g` works):

```bash
npm i -g create-next-suite@latest      # once — also: pnpm add -g · yarn global add · bun add -g
next-suite provision
```

**What a run does, in order:**

1. **Preflight** — checks the server is reachable and has the prerequisites below; aborts before changing anything if not.
2. **Deploy keypair** — generates (or reuses) an SSH keypair, persisted at `~/.config/next-suite/keys/<name>`.
3. **Server user + `/srv/www/<name>`** — creates a user named after the project, home `/srv/www/<name>`. `/srv/www` itself is `www-data:www-data` mode `3775`; the project dir is `<user>:<user>` mode `3755`. The user joins the `docker` group and the `deploy` group — each only if that group already exists — and gets no password and no sudo. The `deploy` group is what takes SSH tunneling away from the deploy key; see [Server requirements](https://github.com/maurice-rm/next-suite/blob/main/docs/server-requirements.md).
4. **Port allocation** — assigns a free port in `8100`–`8199` from the shared registry `/srv/ports.json`; reused on re-run.
5. **`.env`** — derived from the project's own `.env.example`: structure (comments, blank lines) is preserved, known keys get server-appropriate values, secrets are freshly generated. Uploaded to `/srv/www/<name>/.env`, owned by the deploy user, mode `600`. **Additive merge** — keys already present on the server are never overwritten.
6. **nginx + TLS** — writes the site config to `conf.d/<name>.conf` and obtains a certificate via `certbot certonly --webroot`, two-phase: an ACME-challenge-only block first, then the certificate, then the full TLS/proxy block — written only once the certificate exists.
7. **GitHub deploy secrets/variables** — sets `DEPLOY_SSH_KEY`, `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_PATH`, and (if the project needs it) `NEXT_PUBLIC_APP_URL` via `gh`, unless `--skip-github` (then prints them for manual entry).

**Idempotent — safe to re-run:**

- Deploy keypair — reused from disk, never reminted.
- Server user — reused only if its home is already `/srv/www/<name>`; refuses to touch an unrelated account.
- Port — reused from the registry if already assigned.
- `.env` — additive merge; existing keys are never overwritten.
- TLS certificate — reused if it already exists on the server, skipping the ACME bootstrap and certbot request entirely.
- GitHub secrets — re-set every run (harmless; `gh secret/variable set` overwrites).

**One-time host prerequisites** (checked in preflight, not created by provision):

| Prerequisite                       | Notes                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| root over SSH (not sudo)           | provision writes to `/etc` and `/srv` directly                                                           |
| `nginx` installed                  | the host reverse proxy                                                                                   |
| `certbot` installed                | TLS via `certonly --webroot`                                                                             |
| Docker + Compose plugin, daemon up | runs the project stack                                                                                   |
| `/var/www/certbot` exists          | ACME challenge webroot                                                                                   |
| `ssl-dhparams.pem` exists          | ships with certbot, but only copied into `/etc/letsencrypt` by certbot's nginx installer — see the guide |
| `options-ssl-nginx.conf` exists    | same — see the guide                                                                                     |
| a `:443 default_server`            | without it, the first site alphabetically becomes the default                                            |
| an executable certbot deploy hook  | otherwise renewed certificates are never served                                                          |

**[Server requirements](https://github.com/maurice-rm/next-suite/blob/main/docs/server-requirements.md)** walks a stock Ubuntu box through all of it, with the reasoning behind each step. **[Provisioning](https://github.com/maurice-rm/next-suite/blob/main/docs/provisioning.md)** documents the full workflow.

The generated site block is self-contained: it declares its own `map` and
`limit_req_zone`, so no global nginx snippet has to exist for it.

Without flags, `provision` is a full interactive wizard — domain, staging, GitHub, a plan summary, and a confirm gate — with back-navigation. Flags make it scriptable:

| Flag            | Description                                          |
| --------------- | ---------------------------------------------------- |
| `--domain <d>`  | Public domain for the project                        |
| `--dry-run`     | Print the exact commands and `.env` keys; no changes |
| `--staging`     | Request a Let's Encrypt staging certificate          |
| `--skip-github` | Skip GitHub secrets/variables (prints them instead)  |
| `--yes`, `-y`   | Non-interactive: no prompts, requires `--domain`     |

```bash
next-suite provision --domain app.example.com --yes
```

Global config (`host`, `adminUser`, `certbotEmail`) lives at `~/.config/next-suite/config.json` — prompted and created on first run.

### `next-suite deprovision`

Tears a target back down: discovers what's actually on the server (nginx conf, cert, user, `/srv/www/<name>`, port registry entry, local deploy key) and confirms before removing each. GitHub secrets/variables aren't discovered — deleting them is a separate confirm, best-effort and tolerant of already-missing entries. `--yes` removes everything found, `--skip-github` leaves GitHub alone, `--domain` is a fallback once the nginx conf is already gone.

### `next-suite config`

Shows and edits the global config shared by `provision`/`deprovision` (`host`, `adminUser`, `certbotEmail`). Also runs automatically on `provision`'s first use, if no config exists yet.

**What it does NOT do:** deploy the application (that's the CD pipeline / `docker compose`), touch the host's `nginx.conf` (only `conf.d/<name>.conf`), or support standalone deployments.

## 📚 Documentation

| Document                                                                                              | What it covers                                            |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [CLI reference](https://github.com/maurice-rm/next-suite/blob/main/docs/cli-reference.md)             | Every flag, every wizard step, exit codes                 |
| [The generated project](https://github.com/maurice-rm/next-suite/blob/main/docs/generated-project.md) | File tree, packages, scripts, env vars, `next-suite.json` |
| [Provisioning](https://github.com/maurice-rm/next-suite/blob/main/docs/provisioning.md)               | `provision` / `deprovision` / `config`, step by step      |
| [Server requirements](https://github.com/maurice-rm/next-suite/blob/main/docs/server-requirements.md) | What a server needs before `provision` runs               |
| [Troubleshooting](https://github.com/maurice-rm/next-suite/blob/main/docs/troubleshooting.md)         | Symptom → cause → fix                                     |

## 🔗 Links

[Repository](https://github.com/maurice-rm/next-suite) · [Documentation](https://github.com/maurice-rm/next-suite/blob/main/docs/README.md) · [Changelog](https://github.com/maurice-rm/next-suite/blob/main/packages/cli/CHANGELOG.md) · [Issues](https://github.com/maurice-rm/next-suite/issues) · [Security](https://github.com/maurice-rm/next-suite/blob/main/SECURITY.md)

## 📄 License

MIT © [Maurice Reim](https://github.com/maurice-rm)
