# Provisioning

`next-suite provision` prepares an already-running server for one scaffolded
project and wires up its deploy pipeline. It runs on your machine, in the
project directory, and drives the server over SSH.

## What it does

A run creates a dedicated server user, assigns the project a port, uploads a
server `.env`, obtains a TLS certificate, writes one nginx site config, and
stores the deploy credentials as GitHub Actions secrets. It never deploys the
application itself — that is the job of the CD workflow or `docker compose` on
the server.

Three things must be in place locally before the command does anything:

| Requirement                    | Checked as                                               | Error when missing                                                            |
| ------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `next-suite.json` in the cwd   | file exists, valid JSON, `version` is `1`, `name` is set | `No next-suite.json here. Run provision from a next-suite project directory.` |
| `production.mode` is `proxied` | `requireProxied()`                                       | `provision supports only the 'proxied' production mode …`                     |
| `.env.example` in the cwd      | file exists                                              | `No .env.example here — it ships with the scaffold; restore it …`             |
| A global config                | `~/.config/next-suite/config.json`                       | none — you are prompted for it and it is written on the spot                  |

The project name is also validated: it must match `^[a-z][a-z0-9._-]*$`, because
it becomes a Linux user name, a directory name, and an nginx config file name.

Standalone deployments are rejected. There is no host nginx to configure in that
mode, so the whole command has nothing to do.

## Prerequisites on the server

Provision checks the server before it changes anything, and **installs nothing**.
Every check below is a one-shot command over SSH; a single failure aborts the run
with the full list of what failed. Setting these up once is described in
[Server requirements](server-requirements.md).

| Check           | Command run over SSH                                                                                   | A failure means                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `root`          | `[ "$(id -u)" = 0 ]`                                                                                   | The admin user is not root. Every remote step runs the bare command (`useradd`, `cat > /etc/nginx/…`, `certbot`), so sudo is not enough. |
| `nginx`         | `command -v nginx >/dev/null`                                                                          | nginx is not installed.                                                                                                                  |
| `certbot`       | `command -v certbot >/dev/null`                                                                        | certbot is not installed.                                                                                                                |
| `docker`        | `docker compose version >/dev/null 2>&1 && docker info >/dev/null 2>&1`                                | Docker or the Compose plugin is missing, or the daemon is down. Provision would succeed and the first deploy would fail.                 |
| `webroot`       | `[ -d /var/www/certbot ]`                                                                              | The ACME webroot is missing, so `certbot certonly --webroot` has nowhere to place its challenge.                                         |
| `dhparams`      | `[ -f /etc/letsencrypt/ssl-dhparams.pem ]`                                                             | The generated site config includes this file. nginx refuses to load a config whose non-glob `include` points at a missing file.          |
| `options-ssl`   | `[ -f /etc/letsencrypt/options-ssl-nginx.conf ]`                                                       | Same as above, for certbot's TLS defaults.                                                                                               |
| `renewal-hook`  | `find /etc/letsencrypt/renewal-hooks/deploy -maxdepth 1 -type f -executable ! -name '*~' \| grep -q .` | certbot would renew the certificate but nginx would keep serving the expiring one — visible only about 60 days later as an outage.       |
| `tls-catch-all` | `nginx -T 2>/dev/null \| grep -qE 'listen[^;]*\b443\b[^;]*default_server'`                             | Every site inherits the stock `ssl_protocols` (TLS 1.0/1.1) and an unknown SNI is answered with the first project's certificate.         |

The `renewal-hook` check mirrors certbot's own hook discovery: the file must be
executable and must not be an editor backup (`*~`).

## First run

### 0. Point DNS at the server

Create an `A` record (and an `AAAA` record if the host has IPv6) for the domain,
pointing at the server, and wait for it to resolve. Certbot proves control of the
domain over HTTP, so a record that does not resolve yet means the certificate
request fails — and a failed request still counts against the [Let's Encrypt rate
limits](https://letsencrypt.org/docs/rate-limits/), which is why the staging run
below exists.

Provision checks the record and only warns, because `hostname -I` is unreliable
behind NAT or on IPv6-only hosts. The warning is advisory; certbot's exit code
decides.

### 1. Store the global config

```bash
next-suite config
```

You are asked for the SSH host, the admin SSH user (default `root`), and the
Let's Encrypt contact address. Expected result: the outro prints the config path
and `<adminUser>@<host>`, and `~/.config/next-suite/config.json` now exists.

Do this before the dry run. A dry run promises to change nothing, including this
file, so a config it has to prompt for is not persisted and you are asked again
on the real run.

### 2. Preview the plan

```bash
next-suite provision --dry-run
```

Expected result: the plan is printed and nothing else happens. The command does
not contact the server at all — no SSH connection, no preflight, no lookups. The
output contains the target, the user and directory to be created, the port, the
full derived `.env` with secrets shown as `<generated>`, the server setup script
with the public key shown as `<deploy-public-key>`, the nginx write script, the
certbot command line, the names of the preflight checks, and the names (never
values) of the GitHub secrets and variables.

**The dry run always reports port 8100.** Port allocation is a pure function
over the ports already reserved and the ports already listening, and a dry run
has neither — it calls the allocator with two empty lists, which yields the low
end of the range. The real run reads `/srv/ports.json` and `ss -ltn` first and
will pick a different port whenever 8100 is taken or the project already has an
entry. The port appears in the previewed `.env` (`APP_PORT`) and inside the
previewed nginx block (`upstream app_8100`, `zone=perip_8100`), so treat all
three as placeholders.

### 3. Provision with a test certificate

```bash
next-suite provision --staging
```

Expected result: a full run that requests a Let's Encrypt **staging**
certificate. Browsers will not trust it, but the staging endpoint has far higher
rate limits, so a misconfigured DNS record costs you nothing. Use it for the
first attempt against a new domain.

### 4. Provision for real

```bash
next-suite provision
```

Without flags this is a wizard: domain, staging, GitHub, a plan summary, and a
confirm gate, all back-navigable. Expected result: a step line per phase and an
outro showing `https://<domain>` once the certificate exists.

If step 3 left a staging certificate behind, this run detects it and reissues a
real one — see [Idempotence](#idempotence).

## What happens, step by step

### Deploy keypair

An ed25519 keypair is loaded from `~/.config/next-suite/keys/<project>` or
generated there if absent (private key mode `600`, directory mode `700`). It is
never reminted on a later run: a fresh key would append to the server's
`authorized_keys` forever and orphan the GitHub secret that still holds the old
one.

### Server setup

One script runs as root and is safe to repeat:

- `/srv/www` is created, owned by `www-data` if that user exists, mode `3775`.
- A user named after the project is created with home `/srv/www/<project>` and
  shell `/bin/bash`. If the user already exists with a **different** home, the
  script aborts rather than touch an unrelated account.
- The project directory becomes `<project>:<project>`, mode `3755`.
- The user joins the `docker` group and the `deploy` group — each only if the
  group already exists on the host.
- `~/.ssh` is created mode `700`, and the deploy public key is appended to
  `authorized_keys` (mode `600`) unless the exact line is already there.

The user gets no password and no sudo rule.

### Port allocation

`/srv/ports.json` is a flat `{"<project>": <port>}` registry shared by every
project on the host. If the project already has an entry, that port is reused
and nothing is written. Otherwise `ss -ltn` is run, the first port in
**8100–8199** that is neither in the registry nor currently listening is taken,
and the updated registry is written back.

### Server `.env`

The server `.env` is derived from the project's own `.env.example`. Every line,
comment, and blank line survives; only known keys are rewritten:

| Key                                                         | Value on the server              |
| ----------------------------------------------------------- | -------------------------------- |
| `COMPOSE_PROJECT_NAME`                                      | the project name                 |
| `APP_PORT`                                                  | the allocated port               |
| `POSTGRES_HOST`                                             | `postgres`                       |
| `MYSQL_HOST`                                                | `mysql`                          |
| `NEXT_PUBLIC_APP_URL`                                       | `https://<domain>`               |
| `RESEND_API_KEY`                                            | emptied                          |
| `POSTGRES_PASSWORD`, `MYSQL_PASSWORD`, `BETTER_AUTH_SECRET` | 32 fresh random bytes, base64url |

If `.env.example` carries no `APP_PORT`, one is inserted directly after
`COMPOSE_PROJECT_NAME`; if it carries neither, both are prepended. The file is
uploaded to a temporary path, then moved into place — a partially written upload
never replaces a working `.env` on a running host. The result is owned by the
deploy user, mode `600`.

### Certificate

`/etc/letsencrypt/live/<domain>/fullchain.pem` decides the path:

- **Present** — the certificate is reused, and the ACME bootstrap and certbot
  call are skipped entirely.
- **Absent** — an ACME-challenge-only `:80` server block is written first
  (unless a config already serving this exact domain is in place, in which case
  it is left alone: both renderings serve the webroot, so a live site does not
  have to go down to renew). Then `certbot certonly --webroot -w /var/www/certbot
-d <domain> --non-interactive --agree-tos -m <email>` runs, plus `--staging`
  and `--force-renewal` when they apply.

Before certbot runs, the domain is resolved and compared against the server's
own addresses. This is advisory only — a mismatch prints a warning and the
request is attempted anyway, because certbot's exit code is the real answer.

If certbot fails, the previous nginx config is restored when there was one for a
different domain, and the run continues with TLS deferred. The outro then tells
you to re-run once DNS points at the server, and repeats the Let's Encrypt
limits: five failed validations per hostname per hour, one slot back every
12 minutes.

### nginx vhost

The full site config is written to `/etc/nginx/conf.d/<project>.conf` only once
the certificate exists. The write is validated before it is committed: the old
file is copied to `<name>.conf.bak`, the new one is written, `nginx -t` runs, and
only on success is the backup dropped and nginx reloaded. On failure the backup
is moved back (or the new file removed) and the step fails. After a successful
reload the `nginx-limit-req` and `nginx-botsearch` fail2ban jails are reloaded,
because their `*error.log` glob is resolved only at jail start and would
otherwise never see this project's new log file.

The block is self-contained: it declares its own `map` for the WebSocket upgrade
header, its own `limit_req_zone`, and its own `upstream`, each suffixed with the
port so several projects can share the one `http{}` namespace. It terminates TLS,
redirects `:80` to `:443` while keeping the ACME location open, sets the usual
security headers, rate-limits everything except `/_next/static/`, and proxies to
`127.0.0.1:<port>`.

### GitHub secrets and variables

The deploy credentials are pushed with `gh`, each call pinned to the resolved
repository. See [GitHub integration](#github-integration).

## Idempotence

A second run against the same project and host is safe. What is reused and what
is regenerated:

| Item           | On a second run                                                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deploy keypair | Reused from disk. Never reminted.                                                                                                                                           |
| Server user    | Reused, but only if its home is already `/srv/www/<project>`. A foreign home aborts the run.                                                                                |
| Port           | Reused from `/srv/ports.json`. No scan, no write.                                                                                                                           |
| `.env`         | Additive merge — only keys the server does not have yet are appended. Existing values, including generated secrets, are never overwritten, so they stay stable across runs. |
| Certificate    | Reused if `fullchain.pem` exists, except for the staging case below.                                                                                                        |
| nginx config   | Rewritten every run (validated, with rollback).                                                                                                                             |
| GitHub secrets | Set every run. `gh secret set` and `gh variable set` overwrite, so this is harmless.                                                                                        |

The merge works on blank-line-separated blocks: a block's comments travel with
it and survive only if at least one of its keys is new. A key that exists on the
server is dropped from the incoming block, which is why a re-run never rotates a
password.

One value is reported but not changed: if the server `.env` already has a
`NEXT_PUBLIC_APP_URL` that differs from `https://<domain>`, the run prints a
warning and keeps the old value. Edit it on the server if the domain really
changed.

### The staging special case

If a certificate exists, `--staging` is **not** set, and the certificate's
issuer contains `staging`, the run treats it as missing: it re-requests the
certificate with `--force-renewal`.

This case exists because `certbot certonly` leaves a lineage that is not due for
renewal on its own. Without the issuer check, the documented "test with
`--staging`, then run for real" flow would silently keep serving the untrusted
test certificate.

## Flags

### `provision`

| Flag            | Type    | Effect                                                                           |
| --------------- | ------- | -------------------------------------------------------------------------------- |
| `--domain <d>`  | string  | Public domain for the project. Validated as a hostname with at least two labels. |
| `--yes`, `-y`   | boolean | Non-interactive. No banner, no prompts, no confirm gate. Requires `--domain`.    |
| `--dry-run`     | boolean | Print the plan and exit. No SSH connection, no local writes.                     |
| `--staging`     | boolean | Request a Let's Encrypt staging certificate.                                     |
| `--skip-github` | boolean | Do not touch GitHub. Prints the secrets for manual entry instead.                |

In the interactive path, a flag that is already set removes its wizard step
entirely rather than showing a step that silently resolves — this keeps
back-navigation walking through real prompts only.

### `deprovision`

| Flag            | Type    | Effect                                                                                                                |
| --------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| `--domain <d>`  | string  | Domain to target. Used only as a fallback when the nginx config is already gone and its `server_name` cannot be read. |
| `--yes`, `-y`   | boolean | Non-interactive. Removes everything that was found. Does not require `--domain`.                                      |
| `--skip-github` | boolean | Leave GitHub secrets and variables alone, and drop that confirm gate.                                                 |

### `config`

No flags. It reads the existing config if there is one, prompts for all three
fields with the current values pre-filled, and writes the file back.

## GitHub integration

Unless `--skip-github` is passed, three preconditions are checked after preflight
and before anything is written to GitHub:

| Precondition              | Checked with                        | Error                                                                            |
| ------------------------- | ----------------------------------- | -------------------------------------------------------------------------------- |
| An `origin` remote exists | `git remote get-url origin`         | `no GitHub remote — add one or pass --skip-github`                               |
| `gh` is authenticated     | `gh auth status`                    | `gh is not authenticated — run 'gh auth login' or pass --skip-github`            |
| The repository resolves   | `gh repo view --json nameWithOwner` | `could not resolve the GitHub repository … fix the remote or pass --skip-github` |

The resolved `owner/repo` is passed to every `gh` call as `--repo`. Without it
`gh` picks its target from the remotes, which in a fork is not necessarily
`origin` — and deploy credentials must never land in an unknown repository.

What gets set (names only):

| Kind     | Name                  | Set when                                         |
| -------- | --------------------- | ------------------------------------------------ |
| secret   | `DEPLOY_SSH_KEY`      | always                                           |
| secret   | `DEPLOY_SSH_HOST`     | always                                           |
| secret   | `DEPLOY_SSH_USER`     | always                                           |
| variable | `DEPLOY_PATH`         | always                                           |
| variable | `NEXT_PUBLIC_APP_URL` | the project has an API layer or uses Better-Auth |

**Warning:** `--skip-github` prints the whole checklist to your terminal,
including the **private deploy key in clear text**. That key is a login on the
server. Treat the terminal buffer, your scrollback, and any log file capturing
it as secret material, and prefer letting `gh` transfer the key.

## Configuration and local files

| Path                                      | Contents                                                     |
| ----------------------------------------- | ------------------------------------------------------------ |
| `~/.config/next-suite/config.json`        | `host`, `adminUser`, `certbotEmail` — shared by all projects |
| `~/.config/next-suite/keys/<project>`     | The deploy private key, mode `600`                           |
| `~/.config/next-suite/keys/<project>.pub` | The matching public key                                      |

`XDG_CONFIG_HOME` is respected: when it is set, both paths live under
`$XDG_CONFIG_HOME/next-suite/` instead of `~/.config/next-suite/`.

The config is parsed strictly. All three fields must be non-empty strings, and
`certbotEmail` must look like an address, otherwise the command aborts and names
the offending field. When provision creates the file itself on a first run it
writes it with mode `600`; `next-suite config` writes it with your default file
mode.

## Deprovisioning

`next-suite deprovision` first discovers what is actually present — nginx config,
domain, certificate, user, `/srv/www/<project>`, port registry entry, local
deploy key — prints the list, and then asks up to three separate questions:
server side, GitHub, local key. Nothing is removed without a yes, and if nothing
is found the command says so and exits.

Removed when you confirm the server side:

- `/etc/nginx/conf.d/<project>.conf`, the `.conf.prev` backup a provision run
  leaves next to it, and the domain's access and error logs, followed by an
  `nginx -t` and a reload. A failed reload is tolerated and reported, because a
  broken `nginx.conf` may have nothing to do with this project.
- The certificate, via `certbot delete --cert-name <domain> -n`.
- The user, via `userdel -r`, but only if its home is still
  `/srv/www/<project>`. A foreign home leaves both the user and the directory
  untouched.
- The project directory `/srv/www/<project>`.
- The project's entry in `/srv/ports.json`.

Removed when you confirm GitHub: the three secrets and both variables, each
best-effort — an already-missing entry is reported and does not stop the rest.
Removed when you confirm the local key: both key files.

**Not removed, deliberately:** the teardown runs no Docker command at all.
Running containers, their volumes, and any built images survive it, and the run
says so. Nothing outside the project's own files is touched either — no host
`nginx.conf`, no other project's certificate, no group, and no shared package.

Tear the stack down **before** you deprovision, while its compose file is still
there:

```bash
cd /srv/www/<project> && docker compose -f docker-compose.prod.yml down -v
```

Afterwards that file is gone with the project directory, so address the stack by
its Compose project name instead — the labels on the containers, network and
volumes carry it, and no compose file is needed:

```bash
docker compose -p <project> down -v
```

Run it from a directory that has no compose file of its own. `<project>` is the
project name with any dots removed, since Compose strips what it disallows.
**`-v` deletes the database volume**; leave it off to keep the data for a later
deploy. The built image survives either way — `docker images` and `docker rmi`.

## Known limitations

### The port registry is not locked

`/srv/ports.json` is read, modified in memory, and written back with no lock on
either side. Two provision runs against the same host at the same time can read
the same registry and hand out the same port, or one can overwrite the other's
new entry. Deprovision has the same read-modify-write shape. Provision one
project at a time per host.

### The DNS pre-check is IPv4-only

The advisory check before certbot resolves **A records only**. A host that
publishes only an AAAA record therefore never matches, and every run prints
`does not resolve to this server` even when DNS is perfectly correct. The
warning is advisory: certbot still runs, and its exit code decides. The same
check compares against the output of `hostname -I`, so a NAT'd host warns for a
second reason.

### The HSTS `includeSubDomains` decision is a heuristic

`includeSubDomains` is added when the domain has three or more labels, on the
assumption that it is a subdomain and not an apex. A registrable domain under a
multi-label public suffix — `<project>.co.uk` — has three labels too and is
pinned as if it were a subdomain, for two years, with no way to undo it from the
server. Check this before provisioning such a domain.

---

[Documentation index](README.md)
