---
"create-next-suite": minor
---

Every scaffolded project now emits a committed `next-suite.json` manifest, and proxied deployments expose their port via `APP_PORT`. The new `next-suite provision` command — **beta, experimental server tooling** — provisions a proxied project's server over SSH — deploy user, `.env`, central nginx + certbot TLS, and GitHub deploy secrets — with `--dry-run`, `--staging`, `--skip-github`, and `--yes`.

`provision` is now interactive by default: a banner, prompts for domain/staging/GitHub, a plan summary, and a confirm gate before anything changes, with live step output as each action completes; flags make it non-interactive (`--yes` requires `--domain`). The server layout uses a plain project-name user under `/srv/www/<name>` (refusing to reuse an existing account with a different home), with `.env` owned by that user at mode 600.

Two new commands round out the lifecycle: `next-suite deprovision` interactively discovers and tears down everything a `provision` run created (nginx conf, cert, user, `/srv/www/<name>`, port entry, GitHub secrets, local deploy key), and `next-suite config` edits the global `~/.config/next-suite/config.json` (host, admin user, certbot email).

`provision` requires the project's committed `.env.example` on disk — it's the template for the server `.env`. It also requires the project name to start with a lowercase letter.
