# Security

## Reporting a vulnerability

Report security problems privately through GitHub, not in a public issue.

1. Go to the repository `maurice-rm/next-suite` on GitHub.
2. Open the **Security** tab and choose **Report a vulnerability** (GitHub Private Vulnerability Reporting).
3. Describe what you found, how to reproduce it, and which version or commit you tested.

The report stays private between you and the maintainer until an advisory is published.

Please do **not** open a public issue, a discussion, or a pull request that demonstrates the problem — the repository has no separate embargoed branch, so a public report is a public disclosure.

What to expect, stated plainly: this is a beta project maintained by a single person in their own time. **No response time is promised.** Reports are read and taken seriously, but there is no on-call rotation, no service level agreement, and no guarantee that a fix ships on any particular schedule. If you need a coordinated disclosure timeline, say so in the report and treat the answer as a negotiation rather than a given.

Scope note: findings in generated projects are in scope when the cause is in the templates or the generator here. Findings in an upstream dependency of a generated project belong to that project.

## Security model of `next-suite provision`

`next-suite provision` (and its counterpart `next-suite deprovision`) is the riskiest thing this package does. It runs locally in a scaffolded project directory, reads the committed `next-suite.json` and `.env.example`, and then drives a server you own over SSH. Everything below is taken from `packages/cli/src/provision/`.

Provision supports only the `proxied` production mode; it aborts on a standalone deployment.

### What it requires

The admin connection must be **root over SSH**. The first preflight check is literally `[ "$(id -u)" = 0 ]`, and the failure message says why: provision writes to `/etc` and `/srv` directly, without `sudo`. Authentication is your existing SSH setup — the CLI never asks for or stores a password for the admin account; it shells out to the `ssh` binary and inherits your agent, keys and config.

Before it changes anything, `runPreflight` (`preflight.ts`) opens one reachability check (`ssh <admin>@<host> true`) and then runs nine checks. All nine run even if one fails, and every failure is reported together, so one round trip tells you the whole story. Provision aborts on any failure, before the first write.

| #   | Check           | What it asserts                                                                                                                                                           |
| --- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `root`          | The admin user is uid 0.                                                                                                                                                  |
| 2   | `nginx`         | `nginx` is on the server.                                                                                                                                                 |
| 3   | `certbot`       | `certbot` is on the server.                                                                                                                                               |
| 4   | `docker`        | `docker compose version` and `docker info` both succeed, so the Compose plugin exists _and_ the daemon is running.                                                        |
| 5   | `webroot`       | `/var/www/certbot` exists, for the ACME challenge.                                                                                                                        |
| 6   | `dhparams`      | `/etc/letsencrypt/ssl-dhparams.pem` exists.                                                                                                                               |
| 7   | `options-ssl`   | `/etc/letsencrypt/options-ssl-nginx.conf` exists.                                                                                                                         |
| 8   | `renewal-hook`  | At least one executable, non-backup file sits in `/etc/letsencrypt/renewal-hooks/deploy`, so a renewed certificate is actually picked up by nginx.                        |
| 9   | `tls-catch-all` | The running nginx config has a `listen … 443 … default_server`, so an unknown SNI does not get served the first project's certificate and the stock TLS 1.0/1.1 defaults. |

Checks 5 to 9 are host prerequisites provision refuses to create for you. That is deliberate: they are host-wide settings that affect every site on the box, not just this project.

### What it creates or changes on the server

The complete list, in the order a run produces it:

| Resource                                                   | Change                                                                                                                                                                                                                                                    | Source                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `/srv/www`                                                 | Created; `chown www-data:www-data` when that user exists; mode `3775`.                                                                                                                                                                                    | `commands.ts`             |
| System user `<project>`                                    | Created with `useradd -m -d /srv/www/<project> -s /bin/bash` if absent. No password is set and no sudo rule is added. If the user already exists with a _different_ home, the script aborts and touches nothing.                                          | `commands.ts`             |
| Group membership `docker`                                  | `usermod -aG docker <project>`, only if the group exists.                                                                                                                                                                                                 | `commands.ts`             |
| Group membership `deploy`                                  | `usermod -aG deploy <project>`, only if the group exists.                                                                                                                                                                                                 | `commands.ts`             |
| `/srv/www/<project>`                                       | Created, `chown <project>:<project>`, mode `3755`.                                                                                                                                                                                                        | `commands.ts`             |
| `/srv/www/<project>/.ssh`                                  | Created, owner `<project>`, mode `700`.                                                                                                                                                                                                                   | `commands.ts`             |
| `/srv/www/<project>/.ssh/authorized_keys`                  | The deploy public key is appended if not already present (exact-line match); mode `600`, owner `<project>`.                                                                                                                                               | `commands.ts`             |
| `/srv/ports.json`                                          | Read, and rewritten with this project's port when it has none yet. A shared registry across all projects on the host.                                                                                                                                     | `steps.ts`                |
| `/srv/www/<project>/.env.tmp`                              | Created with `install -m 600 -o <project> -g <project>`, filled, then `mv`d over `.env`. Staged so a failed upload cannot leave an empty `.env` on a running host.                                                                                        | `steps.ts`                |
| `/srv/www/<project>/.env`                                  | Replaced by the staged file. Mode `600`, owner `<project>`.                                                                                                                                                                                               | `steps.ts`                |
| `/etc/nginx/conf.d/<project>.conf`                         | Written — first an ACME-challenge-only block if no certificate exists yet, then the full TLS and proxy block. A `.conf.bak` copy is taken during the write and removed on success; a failed `nginx -t` restores it and the run fails.                     | `commands.ts`, `nginx.ts` |
| nginx process                                              | Reloaded via `systemctl reload nginx`, falling back to `nginx -s reload`.                                                                                                                                                                                 | `commands.ts`             |
| fail2ban jails `nginx-limit-req`, `nginx-botsearch`        | `fail2ban-client reload` per jail, best effort, so the new project's `error.log` enters the jail's glob. Failures are ignored.                                                                                                                            | `commands.ts`             |
| `/etc/letsencrypt/…`                                       | `certbot certonly --webroot -w /var/www/certbot -d <domain> --non-interactive --agree-tos -m <configured email>` — certbot writes the certificate, archive and renewal configuration itself. `--staging` and `--force-renewal` are added when applicable. | `commands.ts`, `steps.ts` |
| `/var/log/nginx/<domain>.access.log`, `<domain>.error.log` | Created by nginx as a result of the site config.                                                                                                                                                                                                          | `nginx.ts`                |

Read-only commands the run also issues: `ss -ltn` (to find a free port in `8100`–`8199`), `hostname -I` (advisory DNS check), `cat` on the files above, and `openssl x509 -noout -issuer` to detect a leftover staging certificate.

Outside the server, provision writes GitHub Actions configuration for the repository `gh` resolves — the secrets `DEPLOY_SSH_KEY`, `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER` and the variables `DEPLOY_PATH` and, when the project needs it, `NEXT_PUBLIC_APP_URL`. If the repository cannot be resolved, the run aborts rather than sending secrets to an unknown target.

`next-suite deprovision` is the rollback for the server-side items. It explicitly does **not** touch running containers or docker volumes and says so in its output.

### The deploy user joins the `docker` group

`serverSetupScript` runs `usermod -aG docker <project>` whenever the `docker` group exists. This is what lets the deploy workflow run `docker compose` over SSH without sudo, and it is the single most consequential decision in the whole command.

**Membership in the `docker` group is equivalent to root on that host.** Anyone who can talk to the Docker socket can start a container that mounts `/` and read or write anything on the machine. There is no privilege boundary between the deploy user and root.

The CLI warns about this itself before it does anything. The confirmation note in `src/provision/index.ts` reads:

```text
⚠ The deploy user joins the docker group, which on this
  host is equivalent to root.
  Its private key is uploaded as DEPLOY_SSH_KEY.
```

The second line appears when GitHub configuration is enabled. Take both at face value: the private key stored in your repository's GitHub Actions secrets is, in practice, a root credential for that server. Anyone who can run a workflow in that repository — including through a compromised action or a malicious pull request configuration — inherits it. Use a host you are willing to treat as belonging to that repository, and keep the repository's Actions permissions tight.

### What it does not do

Verified by reading every script the command sends:

- **It installs nothing.** There is no `apt`, no `apt-get`, no `curl … | sh`, no `wget`, no package installation of any kind. Missing prerequisites cause a preflight failure with an instruction for you to run, not an automatic install.
- **It configures no firewall.** No `ufw`, no `iptables`, no `nftables`, no cloud firewall API. Port exposure on the host is entirely yours to manage.
- **It writes no systemd units.** The only systemd interaction anywhere is `systemctl reload nginx`, with `nginx -s reload` as the fallback. Nothing is enabled, installed or made to start at boot.
- **It starts no containers.** Deploying the application is the job of the generated CI/CD workflow, not of provision.
- **It sets no password and grants no sudo** for the deploy user.

### Where secrets live locally

| Path                                      | Content                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `~/.config/next-suite/config.json`        | The global config: `host`, `adminUser`, `certbotEmail`. Not a credential, but it names your server and your admin login. |
| `~/.config/next-suite/keys/<project>`     | The **private** SSH deploy key for that project, in plain text.                                                          |
| `~/.config/next-suite/keys/<project>.pub` | The matching public key.                                                                                                 |

`XDG_CONFIG_HOME` is respected: `configPath()` uses `$XDG_CONFIG_HOME/next-suite/config.json` when the variable is set, and falls back to `~/.config/next-suite/config.json` otherwise. The key directory is derived from the same base.

The key directory is created with mode `0700`, and the private key file is written with mode `0600`. The keypair is deliberately persisted and reused across runs — a fresh key every run would append to the server's `authorized_keys` forever and orphan the previous GitHub secret.

### Known inconsistency: the config file's permissions depend on which command created it

There are two code paths that write `config.json`, and they do not agree on the mode:

- `src/provision/index.ts` (`loadOrPromptConfig`, reached when `provision` finds no config and prompts for one) writes it with an explicit mode:

  ```ts
  await fs.outputFile(file, serializeGlobalConfig(config), { mode: 0o600 });
  ```

- `src/provision/config-command.ts` (the `next-suite config` command) writes it with no mode at all:

  ```ts
  await fs.outputFile(file, serializeGlobalConfig(config));
  ```

  The file then gets the default `0666` masked by your umask — commonly `0644`, that is world-readable.

The mode argument only applies when the file is created, so **whichever path creates the file first determines its permissions for good**. Later writes by the other path do not tighten or loosen them.

Recommendation: check the permissions yourself after running `next-suite config`, and fix them if needed.

```bash
ls -l ~/.config/next-suite/config.json
chmod 600 ~/.config/next-suite/config.json
chmod 700 ~/.config/next-suite/keys
```

On a single-user machine the practical exposure is small — the file holds a hostname, a username and an email address, not a key. Do it anyway on a shared host.

One more local artifact: on non-Windows platforms the CLI multiplexes its roughly twenty-five SSH calls through a control socket in a per-process directory under the system temp directory, created with mode `0700` and removed when the process exits. The master connection can outlive the process by up to `ControlPersist=60s`.

### Warning: `--skip-github` prints the private deploy key in clear text

When you pass `--skip-github`, provision cannot store the secrets for you, so it prints them for manual entry. That checklist includes `DEPLOY_SSH_KEY` — the **private** key, in full, unredacted. In `src/provision/steps.ts`:

```ts
} else {
  const title = "Skipped GitHub config (--skip-github) — set these manually";
  const body = formatManualChecklist(entries);
  log.push(title, body);
  onBlock(title, body);
}
```

`entries` comes from `ghDeployConfig(deploy, domain, privateKey, …)`, whose first entry is `{ kind: "secret", name: "DEPLOY_SSH_KEY", value: privateKey }`. `formatManualChecklist` exists specifically to render that multi-line value verbatim so it survives copy-paste. The block is written to the terminal _and_ appended to the returned log.

The consequences are the ones you would expect, and they are easy to overlook:

- **Terminal scrollback.** The key sits in your scroll buffer, and in any terminal that persists scrollback to disk, in that file too.
- **CI logs.** `--skip-github` combined with `--yes` in an automated context writes a root-equivalent private key into the job log, where everyone with read access to the run can retrieve it. GitHub's secret masking does not help — this value was never registered as a secret.
- **`script`, `tee`, `tmux` capture panes** and anything else recording the session.

If you use `--skip-github`, run it interactively, transfer the key to its destination, then clear the scrollback. Never use it in CI. Note that the key remains available at `~/.config/next-suite/keys/<project>`, so you never need to recover it from a log.

### How generated secrets are made, and what survives a re-run

`src/provision/env.ts` builds the server `.env` from the project's own `.env.example`, preserving its structure — comments, blank lines and ordering all stay — and replacing only the values it knows about.

Generated secrets come from Node's cryptographic random source:

```ts
export const generateSecret = (): string =>
  randomBytes(32).toString("base64url");
```

That is 256 bits from the CSPRNG, base64url-encoded. It is applied to the keys in `SECRET_KEYS`: `POSTGRES_PASSWORD`, `MYSQL_PASSWORD` and `BETTER_AUTH_SECRET`. Other keys get deterministic, non-secret values (`COMPOSE_PROJECT_NAME`, `APP_PORT`, `POSTGRES_HOST`, `MYSQL_HOST`, `NEXT_PUBLIC_APP_URL`), and `RESEND_API_KEY` is set to an empty string rather than being invented — you fill it in yourself.

Existing values survive. `mergeEnv` reads the `.env` already on the server and adds only the keys it is missing; a key that is already there is never overwritten. So a second `provision` run does not rotate your database password or invalidate existing sessions by replacing `BETTER_AUTH_SECRET`. The same holds for the deploy keypair, which is loaded from disk before it is ever generated.

The one thing that is reported rather than changed: if the server `.env` carries a `NEXT_PUBLIC_APP_URL` that does not match the domain you are provisioning, provision keeps the existing value and prints a warning telling you to edit it on the server.

### Start with `--dry-run`

```bash
next-suite provision --dry-run
```

The dry run is the recommended first step and is side-effect free by construction. It makes no server connection, and it does not even persist the global config — `loadOrPromptConfig(false)` skips the write precisely because a dry run promises to change nothing.

What it prints, from `buildDryRunPlan` in `src/provision/plan.ts`: the admin target, the user and directory to be created (flagged `(docker group)`), the port, the derived `.env`, the full server setup script, the nginx write script with the rendered site block, the exact `certbot` command line, the preflight check names — derived from `remoteChecks()` rather than hand-written, so the list cannot drift — and the GitHub entries.

The output is redacted where it matters:

| Value                                         | Printed as                      |
| --------------------------------------------- | ------------------------------- |
| The deploy public key inside the setup script | `<deploy-public-key>`           |
| The private key in the GitHub entry list      | `<redacted>`                    |
| Every generated secret in the `.env` preview  | `<generated>`                   |
| GitHub secrets and variables                  | Names and kinds only, no values |

Two honest limits on that. First, the redaction covers values _the tool generates_; any literal value you already wrote into your own `.env.example` is echoed verbatim. Second, the plan is still a rendered script — treat the output as sensitive enough not to paste into a public issue without reading it first.
