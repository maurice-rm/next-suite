# Troubleshooting

Known failure modes of both binaries: `create-next-suite`, which scaffolds a
project, and `next-suite`, which provisions a server for one. Start at the index,
then read the matching section.

Most scaffolding steps are best-effort by design. A failing post-step prints a
red line, names the command you can run yourself, and lets the remaining steps
continue — the generated project is never invalidated by one of them.

## Symptom index

| Symptom                                                                                  | Likely cause                                           | Check                                   | Section                                                                                |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------- |
| `create-next-suite needs Node …`                                                         | Node older than the required floor                     | `node -v`                               | [Node is too old](#node-is-too-old)                                                    |
| `"<name>" already has conflicting files`, or a prompt asking how to proceed              | The target directory holds non-benign files            | `ls -a <name>`                          | [The target directory is not empty](#the-target-directory-is-not-empty)                |
| `<pm> was not found on your PATH — skipping install and shadcn setup`                    | The chosen package manager is not installed            | `which <pm>`                            | [The package manager is not on your PATH](#the-package-manager-is-not-on-your-path)    |
| `--yes` aborts before anything is generated                                              | A rejected flag or flag combination                    | re-run without `--yes`                  | [A `--yes` flag combination is rejected](#a---yes-flag-combination-is-rejected)        |
| `Invalid --shadcn-preset: Use only letters, numbers, - or _.`                            | The preset code contains other characters              | —                                       | [The shadcn preset is rejected](#the-shadcn-preset-is-rejected)                        |
| `Could not set up shadcn/ui — run 'shadcn init' yourself`                                | The shadcn CLI itself failed                           | `cd <name> && <dlx> shadcn@latest init` | [The shadcn preset is rejected](#the-shadcn-preset-is-rejected)                        |
| `Could not install — run '<pm> install' yourself`, and files are unformatted             | The install failed, so `fix` never ran                 | `cd <name> && <pm> install`             | [The install fails](#the-install-fails)                                                |
| The new project has no commit                                                            | `--no-git`, or `git init` failed                       | `cd <name> && git log`                  | [There is no initial commit](#there-is-no-initial-commit)                              |
| `Preflight failed:` followed by a list                                                   | A missing host prerequisite                            | see the table below                     | [A preflight check fails](#a-preflight-check-fails)                                    |
| `--yes requires --domain.`                                                               | Non-interactive mode has no domain to use              | —                                       | [`--yes` without `--domain`](#--yes-without---domain)                                  |
| `No next-suite.json here.`                                                               | Wrong working directory, or the file was not committed | `ls next-suite.json`                    | [No manifest, or the wrong production mode](#no-manifest-or-the-wrong-production-mode) |
| `provision supports only the 'proxied' production mode`                                  | The project was scaffolded standalone                  | `cat next-suite.json`                   | [No manifest, or the wrong production mode](#no-manifest-or-the-wrong-production-mode) |
| `gh is not authenticated`, `no GitHub remote`, `could not resolve the GitHub repository` | `gh` cannot reach the target repo                      | `gh auth status`                        | [GitHub is not reachable](#github-is-not-reachable)                                    |
| `TLS: deferred`, usually after `<domain> does not resolve to this server`                | The domain does not point at this server               | `dig +short A <domain>`                 | [The certificate request fails](#the-certificate-request-fails)                        |
| `nginx -t failed; reverted /etc/nginx/conf.d/<project>.conf`                             | The host's nginx config rejects the new site           | `ssh root@<host> nginx -t`              | [`nginx -t` fails](#nginx--t-fails)                                                    |
| A 502 after a re-run, or `No free port in 8100-8199`                                     | The assigned port is taken, or the range is full       | `ssh root@<host> ss -ltn`               | [The port is already taken](#the-port-is-already-taken)                                |

## Scaffolding

### Node is too old

The CLI checks the running Node version against its own `engines.node` floor
before it does any work, and exits with:

```text
create-next-suite needs Node >=24.0.0 — you are on v22.11.0. Please upgrade Node and try again.
```

Only the lower bound of the range is enforced. Install a Node release at or above
that floor and re-run; nothing was written.

The floor moved to the Node 24 LTS line deliberately. Node 22 entered maintenance
in October 2025, and the dependency trees of the generated projects already
required more than the old floor — installing produced a wall of `EBADENGINE`
warnings.

### The target directory is not empty

A directory counts as conflicting when it holds anything that is not on the
benign list: `.git`, `.gitignore`, `.gitattributes`, `.gitkeep`, `.idea`,
`.vscode`, `.DS_Store`, `Thumbs.db`, `.npmignore`, `LICENSE`, `LICENSE.md`, and
any `*.iml` file. A missing or empty directory never conflicts.

Interactively you are asked how to proceed:

| Option                                                | Effect                                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| `Empty the directory — delete everything except .git` | Wipes the target first. Not offered when the target is the current directory. |
| `Continue (keep existing files)`                      | Generates on top; a generated file replaces an existing one at the same path. |
| `Cancel`                                              | Nothing is written.                                                           |

In `--yes` mode there is no prompt:

```text
"my-app" already has conflicting files — pass --overwrite or --empty to proceed.
```

Pass exactly one of them — `--overwrite and --empty are mutually exclusive — pass
only one.` if you pass both.

If a run fails _after_ you chose `--empty`, the error is followed by a warning
that the directory may already have been emptied and its previous contents could
be gone. Take that literally: emptying happens before generation.

### The package manager is not on your PATH

```text
pnpm was not found on your PATH — skipping install and shadcn setup. Install it, then run `pnpm install`.
```

This is a warning, not an error. The project is generated and git is still
initialized, but **both** the dependency install and the shadcn setup are
skipped, and because `fix` runs only after a successful install, the files stay
unformatted. Install the package manager and run its `install` yourself, then
`<pm> run fix`.

The probe is a plain `which` (`where` on Windows), so a manager installed only in
a shell function or an unsourced profile looks missing.

### A `--yes` flag combination is rejected

`--yes` resolves the whole configuration from flags and validates it up front.
Any of these aborts the run before a single file is written:

| Message                                                                    | Cause                                                                                                                                                |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `A project name is required in --yes mode — pass it as the argument.`      | No positional name                                                                                                                                   |
| `Target must be inside the current directory — no '..' or absolute paths.` | The name resolves outside the cwd                                                                                                                    |
| `A file already exists at that path — choose another name.`                | The target path is a regular file                                                                                                                    |
| `--overwrite and --empty are mutually exclusive — pass only one.`          | Both conflict flags given                                                                                                                            |
| `--shadcn-base, --shadcn-preset, and --shadcn-pointer require --shadcn.`   | A shadcn sub-flag without `--shadcn`                                                                                                                 |
| `--database and --orm must be passed together.`                            | Only one half of the database pair                                                                                                                   |
| `--scalar requires --openapi.`                                             | Scalar without the OpenAPI layer                                                                                                                     |
| `--openapi requires --api orpc.`                                           | OpenAPI is oRPC-only                                                                                                                                 |
| `--auth requires --database — Better-Auth needs a database adapter.`       | Auth without a database                                                                                                                              |
| `--github-actions image/deploy requires --deployment.`                     | A CD step without a production mode                                                                                                                  |
| `Unknown <thing> "<value>" — expected one of …`                            | An unrecognized value for `--pm`, `--shadcn-base`, `--database`, `--orm`, `--api`, `--auth`, `--email`, `--deployment`, or a `--github-actions` step |

The name is additionally validated as an npm package name, so its own error text
can surface here too.

### The shadcn preset is rejected

There are two different rejections, at two different times.

**Locally**, the preset code is checked against `^[A-Za-z0-9_-]+$` — the same
rule in the wizard and in `--yes` mode, because it is handed to another CLI. An
empty value is fine and falls back to the blank-base preset `b0`. In `--yes`
mode the message is `Invalid --shadcn-preset: Use only letters, numbers, - or
_.`; interactively the prompt simply asks again.

**Later**, `shadcn init` runs as a post-step. The local check only validates the
shape of the code, not that it exists, so a well-formed but unknown preset fails
here instead:

```text
Could not set up shadcn/ui — run `shadcn init` yourself
```

The tool's own output is printed below that line. The project is already
generated at this point; re-run `shadcn init` in the project directory with a
valid preset.

### The install fails

```text
Could not install — run `pnpm install` yourself
```

The package manager's own stderr follows. Two consequences worth knowing:

- **`fix` does not run.** It needs the toolchain the install would have
  provided, so it is skipped rather than failing with a second error for one
  cause. The generated files are therefore neither import-sorted nor formatted
  until you run `<pm> run fix`.
- **The initial commit still happens** (when git was initialized), so the
  unformatted state is what gets committed.

Every external command has a 10-minute timeout. A stalled download or a tool
waiting on an unexpected prompt fails at that point instead of hanging the CLI
under a spinner.

### There is no initial commit

The commit is created only when git initialization succeeded in the same run. If
you see `Could not initialize git repository`, the commit step is skipped
silently — one root cause, one error. The most common reason is git missing
entirely, which reports `Git is not installed.`

A missing committer identity is **not** a reason. When neither a local nor a
global `user.email` is configured, the CLI supplies a generic identity for that
one commit instead of failing, so scaffolding works on fresh machines and in CI
without overwriting your real identity where you have one.

The commit itself runs with `--no-verify`, so a global hooks path cannot block
it.

## Provisioning

### A preflight check fails

Preflight runs every check and reports all failures at once, then aborts before
anything is changed:

```text
Preflight failed:
  - nginx is not installed on the server.
  - /var/www/certbot is missing. Create it: sudo mkdir -p /var/www/certbot
```

| Failing check   | Fix                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| reachability    | `Cannot reach <user>@<host>` — fix the host, the key, or your SSH config first; nothing else runs.                                      |
| `root`          | Set `adminUser` to `root` via `next-suite config`, and allow root login by key. Passwordless sudo is not enough.                        |
| `nginx`         | `apt install -y nginx`                                                                                                                  |
| `certbot`       | `apt install -y certbot python3-certbot-nginx`                                                                                          |
| `docker`        | Install Docker with the Compose plugin and start the daemon. See [Docker](server-requirements.md#docker).                               |
| `webroot`       | `mkdir -p /var/www/certbot`                                                                                                             |
| `dhparams`      | Install it from the certbot packages, or generate one. See [The two TLS helper files](server-requirements.md#the-two-tls-helper-files). |
| `options-ssl`   | Install it from the certbot packages. Same section.                                                                                     |
| `renewal-hook`  | Add an executable deploy hook. See [The certbot deploy hook](server-requirements.md#the-certbot-deploy-hook).                           |
| `tls-catch-all` | Add a `:443 default_server`. See [The `:443` catch-all default server](server-requirements.md#the-443-catch-all-default-server).        |

Two of these are easy to get almost right. A deploy hook that is not `chmod +x`
is ignored by certbot without a word, and preflight rejects it for the same
reason. And `ssl-dhparams.pem` ships with certbot's nginx plugin — generating one
by hand is the fallback, not the intended route.

The `root` check is stricter than it once was on purpose: a non-root admin user
with passwordless sudo used to pass preflight and then fail midway through the
run, because every remote step executes the bare command.

### `--yes` without `--domain`

```text
--yes requires --domain.
```

Non-interactive mode has no prompt to fall back on. Pass the domain:

```bash
next-suite provision --domain app.example.com --yes
```

The domain must be a valid hostname with at least two labels, otherwise the run
stops with `Invalid domain: <value>`. Note that `deprovision --yes` does _not_
require `--domain` — it reads the domain from the nginx config on the server and
only uses the flag as a fallback.

### No manifest, or the wrong production mode

Provision reads three things from the project directory, and each has its own
message:

| Message                                                                       | Meaning                                                                                                                                                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `No next-suite.json here. Run provision from a next-suite project directory.` | Wrong directory, or the manifest was never committed.                                                                                                                          |
| `next-suite.json is not valid JSON.` / `must be a JSON object.`               | The file was hand-edited.                                                                                                                                                      |
| `Unsupported next-suite.json version: … (expected 1)`                         | The manifest predates or postdates this CLI. Re-scaffold or upgrade.                                                                                                           |
| `next-suite.json: unsafe project name '<name>'`                               | The name must start with a lowercase letter and use only lowercase letters, digits, dot, underscore, and hyphen — it becomes a user name, a directory, and a config file name. |
| `provision supports only the 'proxied' production mode …`                     | The project was scaffolded standalone. Re-scaffold with `--deployment proxied`.                                                                                                |
| `No .env.example here — it ships with the scaffold; restore it …`             | The template for the server `.env` is missing. Restore it from git.                                                                                                            |

There is no way to provision a standalone deployment: it terminates TLS in its
own sidecar, so there is no host nginx for provision to configure.

### GitHub is not reachable

Unless `--skip-github` is passed, three things are verified before any secret is
written:

| Message                                                               | Fix                                                        |
| --------------------------------------------------------------------- | ---------------------------------------------------------- |
| `no GitHub remote — add one or pass --skip-github`                    | `git remote add origin …`                                  |
| `gh is not authenticated — run 'gh auth login' or pass --skip-github` | `gh auth login`                                            |
| `could not resolve the GitHub repository (gh repo view) …`            | Fix the remote so `gh repo view` resolves an `owner/repo`. |

The last one is a refusal, not a bug: the deploy key must not be written to an
unknown target. Every `gh` call is pinned to the resolved repository with
`--repo`, because `gh` otherwise picks its target from the remotes, which in a
fork is not necessarily `origin`.

`--skip-github` prints the full checklist instead, **including the private deploy
key in clear text**. Treat your scrollback accordingly.

### The certificate request fails

The run reports `TLS: deferred` and finishes. The nginx site is not written; if a
previous config for a different domain existed, it is restored first. Re-run once
the cause is fixed — everything else the run did is reused.

The usual cause is DNS. Provision resolves the domain before calling certbot and
warns on a mismatch:

```text
<domain> does not resolve to this server (203.0.113.10); attempting certbot anyway.
```

**This warning is IPv4-only.** It resolves A records exclusively, so a host that
publishes only an AAAA record warns on every run even when DNS is correct. It
also compares against the server's own `hostname -I` output, which is wrong
behind NAT. The warning never blocks the request; certbot's exit code is the
real answer.

When it is genuinely DNS, mind the rate limits before retrying: Let's Encrypt
allows five failed validations per hostname per hour, with one slot returning
every 12 minutes. `--staging` has its own, far higher limits — use it while you
are still fixing records.

Also check that port 80 reaches the server, since the challenge is served over
plain HTTP from `/var/www/certbot`.

### `nginx -t` fails

```text
nginx -t failed; reverted /etc/nginx/conf.d/<project>.conf
```

**Nothing is left broken.** The write is staged: the existing file is backed up,
the new one written, `nginx -t` run, and only on success is the backup dropped
and nginx reloaded. On failure the backup is moved back, or the new file removed
if there was none — and the run aborts rather than reloading.

The generated block is self-contained, so a failure is almost always a collision
with the rest of the host's configuration. Run `nginx -t` over SSH and read the
message: a duplicate `default_server`, a `server_name` already claimed by another
file, or a missing `include` target are the common ones.

### The port is already taken

Two distinct situations.

**The range is exhausted.** Allocation walks 8100 to 8199 and skips both the
ports recorded in `/srv/ports.json` and the ports currently listening:

```text
No free port in 8100-8199 (all 100 taken).
```

Deprovision an old project, or clear its stale entry from the registry.

**A reused port is now occupied by something else.** A project that already has a
registry entry keeps its port without re-checking whether anything else took it
in the meantime. nginx will proxy to a port that is not the app, which shows up
as a 502 or as the wrong response entirely. Compare the registry against what is
listening:

```bash
ssh root@<host> cat /srv/ports.json
ssh root@<host> ss -ltn
```

Note also that the registry is written without a lock. Two provision runs against
the same host at the same time can hand out the same port or lose one another's
entry — provision one project at a time per host.

---

[Documentation index](README.md)
