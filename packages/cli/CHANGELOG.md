# create-next-suite

## 1.0.0

### Major Changes

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - First public release. The CLI and the projects it generates are feature-complete
  and covered by unit tests, a golden snapshot, and an end-to-end build matrix.

- [#12](https://github.com/maurice-rm/next-suite/pull/12) [`a45830b`](https://github.com/maurice-rm/next-suite/commit/a45830bae4d0267bbe554bb6980e29e290b5f1a0) Thanks [@maurice-rm](https://github.com/maurice-rm)! - `create-next-suite` 1.0.0 — the first stable release.

  Everything the beta line shipped is in here; the entries below `1.0.0-beta.0`
  in this changelog are the full record of how it got here. What changes with
  this release is the promise, not the code: flags, wizard steps and the shape
  of a generated project now follow semantic versioning. A breaking change to
  any of them means a major release, so a pinned `create-next-suite@1` keeps
  scaffolding the same way.

  `next-suite provision` and `deprovision` stay marked beta. They rewrite a real
  server over SSH, they are the youngest part of the package, and a stable
  version number for the scaffolder is not a claim about them. Run `--dry-run`
  first and read the warning in the README.

### Minor Changes

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Generate shell helper scripts in scaffolded projects. `scripts/setup.sh` takes a
  fresh clone to a running app (creates `.env` with generated secrets, installs
  dependencies, optionally starts the database). Production projects also get
  `scripts/prod.sh` (bootstrap `.env` + Docker Compose control) and a `DEPLOY.md`
  server checklist; the auto-deploy now ships the scripts and fails clearly when no
  `.env` exists on the server.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Move to the Node 24 LTS line: the CLI and every generated project now require Node >= 24, with `.nvmrc`, the production Dockerfile, and the generated CI workflows updated to match.

  Node 22 entered maintenance in October 2025 and reaches end of life in April 2027, so scaffolding new projects onto it would hand users a migration right after `create`. Node 24 is supported until April 2028. The previous floor was also below what the dependency trees actually require (`lint-staged` needs >= 22.22.1, `@commitlint/*` >= 22.12, `prisma` ^22.12), which made `npm install` print a wall of `EBADENGINE` warnings — both for the CLI and in every scaffolded project.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Every scaffolded project now emits a committed `next-suite.json` manifest, and proxied deployments expose their port via `APP_PORT`. The new `next-suite provision` command — **beta, experimental server tooling** — provisions a proxied project's server over SSH — deploy user, `.env`, central nginx + certbot TLS, and GitHub deploy secrets — with `--dry-run`, `--staging`, `--skip-github`, and `--yes`.

  `provision` is now interactive by default: a banner, prompts for domain/staging/GitHub, a plan summary, and a confirm gate before anything changes, with live step output as each action completes; flags make it non-interactive (`--yes` requires `--domain`). The server layout uses a plain project-name user under `/srv/www/<name>` (refusing to reuse an existing account with a different home), with `.env` owned by that user at mode 600.

  Two new commands round out the lifecycle: `next-suite deprovision` interactively discovers and tears down everything a `provision` run created (nginx conf, cert, user, `/srv/www/<name>`, port entry, GitHub secrets, local deploy key), and `next-suite config` edits the global `~/.config/next-suite/config.json` (host, admin user, certbot email).

  `provision` requires the project's committed `.env.example` on disk — it's the template for the server `.env`. It also requires the project name to start with a lowercase letter.

### Patch Changes

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Bump the actions in the generated workflows onto their current majors, which
  run on Node 24. GitHub is deprecating Node 20 and already forces these onto 24,
  so every run of a generated project logged a deprecation warning naming
  `actions/checkout`, `docker/build-push-action`, `docker/login-action`,
  `docker/metadata-action` and `docker/setup-buildx-action`.

  `actions/checkout` v4 → v7, `actions/setup-node` v4 → v7, `pnpm/action-setup`
  v4 → v6, `docker/setup-buildx-action` v3 → v4, `docker/login-action` v3 → v4,
  `docker/metadata-action` v5 → v6, `docker/build-push-action` v6 → v7.
  `oven-sh/setup-bun@v2` already runs on Node 24 and stays.

  Nothing in the templates uses an input the new majors dropped, and the explicit
  `cache:` in the setup action keeps precedence over the automatic package-manager
  caching `setup-node` v5 introduced. The majors require Actions runner v2.327.1,
  which GitHub-hosted runners exceed.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Simplify the startup banner: the meta strip now shows just the version and the
  repo link (the feature count is removed), so it sits centered under the wordmark
  instead of running the full width.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Fix the generated CD deploy step, which could break a repository outright and
  left no way back from a bad release.

  The image was pushed under a lowercased name — `docker/metadata-action`
  lowercases it — but pulled with the repository's original spelling. Any owner or
  repository containing a capital letter built and pushed green, then failed the
  deploy with `repository name must be lowercase`. The name is now folded on both
  sides.

  A rollout that never becomes healthy no longer takes the site with it. The step
  records the running image, waits for health with `up -d --wait`, and on failure
  puts the previous image back and brings the stack up again — then still exits
  non-zero, so the run goes red. Previously the old container was already gone by
  the time the new one failed.

  `docker image prune -f` ran daemon-wide after every deploy. The image it deleted
  first was the one the deploy could have rolled back to — freshly untagged by the
  pull — and on a host with several provisioned projects it took their images too.
  It is now limited to images unused for a week.

  Appending `DOCKER_IMAGE` to a `.env` without a trailing newline glued it onto the
  last line, silently corrupting whatever it held — `BETTER_AUTH_SECRET` in a
  default project. The file gets its newline first. `provision`-written files were
  never affected; hand-written ones, which `DEPLOY.md` asks for, were.

  The GHCR token was interpolated into the remote command line, so it sat in
  `/proc/<pid>/cmdline` for the length of the deploy, readable by any local user.
  It now travels on stdin, and the session logs out afterwards.

  Also: `rsync` is documented as a server requirement. The deploy has always
  needed it on both ends, and nothing said so — preflight passes without it and
  the first deploy is what fails.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Guard the database credentials in `docker-compose.prod.yml` the same way
  `APP_PORT` already was. Without them Postgres started with an empty user and
  password and failed inside the image with a message that pointed nowhere near
  the `.env`; compose now refuses to interpolate and names the missing key.

- [#10](https://github.com/maurice-rm/next-suite/pull/10) [`16325c5`](https://github.com/maurice-rm/next-suite/commit/16325c59821d5eeb4a500ba4b733cec34ee6b682) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Move to `validate-npm-package-name` 8 and refresh the toolchain.

  The name validator is a runtime dependency and its major release keeps the
  shape the CLI relies on — verified against the installed v8: same callable
  default export, same `validForNewPackages`, `errors` and `warnings` on the
  result. `prettier`, `@types/node`, `@eslint/js`, `globals` and the pinned
  GitHub Actions move up as development-only changes.

  ESLint 10's new `preserve-caught-error` rule caught a `throw` in
  `generator/merge.ts` that dropped the underlying `JSON.parse` failure; the
  rethrown error now carries it as `cause`.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Move the CLI onto `execa` 10 and refresh the rest of the toolchain.

  `execa` is a runtime dependency and drives every post-step that shells out —
  git init, install, shadcn, format, commit. Verified with a full scaffold that
  ran all of them and ended on a clean tree with the initial commit in place.
  `@clack/core`, `@clack/prompts` and `fs-extra` move up too; `eslint` 10,
  `@types/node` 26, `simple-import-sort` 14, `vitest`, `tsx`, `turbo` and
  `typescript-eslint` are development-only.

  Generated projects are unaffected — they pin their own versions in
  `generator/config/dependencies.ts`.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Fix a deploy that stopped after the migration and still reported success.

  The deploy script reaches the server on stdin (`bash -s` with a heredoc), and
  `docker compose run` attaches stdin — so it consumed the rest of the script.
  Everything after the migration, including `up -d --wait`, never ran, and the
  step exited 0 because bash simply reached end of input. On a first deploy the
  result was a project with only its database container running and a green
  workflow. `-T` does not prevent this; the command now reads from `/dev/null`.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Let `deprovision` take the nginx backup with the config it belongs to.

  Every provision run rotates the previous vhost to `<project>.conf.prev` so an
  interrupted certbot step cannot leave the host without a copy. The teardown
  removed `<project>.conf` but never the backup, so each deprovisioned project
  left one behind for good. nginx includes `*.conf` only and never loaded them,
  but they accumulated in `conf.d` with the project's domain still inside.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Give `deprovision` a teardown command you can actually run.

  The run already said that containers and volumes survive the teardown, but the
  same run deletes `/srv/www/<project>` and with it the compose file you would
  have needed to act on that. The note now names the Compose project instead —
  `docker compose -p <project> down -v` finds the containers, network and volumes
  by their labels and needs no compose file. Compose strips characters it
  disallows when it derives the project name from the directory, so the note drops
  the dot a project name may carry.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Clarify the `ssl-dhparams.pem` prerequisite: it ships with certbot's nginx plugin, so generating one by hand is only the fallback. The README table and the preflight message said "generate this", which invited overwriting certbot's own file for no benefit — TLS 1.3 does not use `ssl_dhparam` at all.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Lock down the per-project nginx logs, and correct the last documented claims
  that did not match the code.

  nginx creates a per-project access and error log `0644` and root-owned, so on a
  host running several provisioned projects every project user could read every
  other project's client IPs and request URLs. Provision now creates them
  `0640 www-data:adm`, the mode the distribution uses for its own logs, and
  logrotate keeps them there. The paths are derived from the config block itself,
  so they cannot drift apart. Measured on a live host: `head` as the project user
  went from printing a foreign client IP to `Permission denied`.

  `nginx: site <domain> live` overstated what had happened — the vhost is written
  and nginx reloaded, but nothing listens on the loopback port until a deploy
  brings the stack up, so the site answers 502 until then. The step now says what
  it actually did.

  Documentation corrections, each checked against the code rather than re-read:

  - Three of the five exit-code rows in the CLI reference were wrong. A post-step
    cannot produce exit 1 (each is caught individually, as the same page states
    two paragraphs later); exit 1 belongs to all three `next-suite` subcommands,
    not just `provision`; and only `next-suite` can fail to parse its command
    line — measured, `create-next-suite` ignores an unknown flag and exits 0.
  - `next-suite` subcommands "all read and write the global config" — only
    `config` and `provision` write it, `provision` only when it does not exist
    yet and never under `--dry-run`.
  - `AGENTS.md` listed three workflows; there are four. `zizmor.yml` runs on
    workflow edits, so touching one triggers a job the other three do not cover.
  - The layering table in `architecture.md` was missing `@/branding` and
    `@/core/version-check` for `ui/`, `@/core/target` for `generator/`, and two of
    the three imports in `suite.ts`; it also listed `@/options` for `generator/`,
    which only `generator/config/` imports. The shorthand `@/core` suggested a
    barrel module that does not exist.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Fix documentation that pointed nowhere, and close the gaps a first-time user
  falls into on a fresh server.

  Three preflight failure messages told the reader to see "'Host setup', step 1 /
  4 / 5 in the CLI README". No such section existed in any file — and a test
  asserted the strings, so the dead pointers stayed green. They now name the real
  sections in `docs/server-requirements.md`, and the test resolves each reference
  against that file's actual headings instead of matching the text.

  `provision` needs `ssh`, `ssh-keygen` and an authenticated `gh`; none of them
  appeared in either requirements list. `ssh-keygen` was not mentioned in the
  published documentation at all.

  Provisioning now opens with the DNS record, which was only ever mentioned as a
  warning after the fact — a record that does not resolve yet costs a Let's
  Encrypt rate-limit slot.

  The generated `DEPLOY.md` for `standalone` now covers what has to happen before
  the first deploy: the four `# TODO` placeholders in `nginx/nginx.conf`, the
  `includeSubDomains` default that is wrong for an apex domain, and the first
  certificate — which cannot come from the webroot, because the nginx that would
  serve the challenge is the one that will not start without the certificate.
  `scripts/prod.sh bootstrap` is documented in both modes; it existed but appeared
  in no published file.

  `docs/architecture.md` described a `wizard.ts` ↔ `ui/` module cycle that was
  removed some releases ago. It documented a layering violation that no longer
  exists, in the file that teaches contributors the layering rules.

  Also corrected: the README said the deploy user joins the `docker` group,
  omitting `deploy` — the group that takes SSH tunneling away from the deploy key
  — and called the two TLS helper files "not shipped by any package", which
  contradicts the guide, the troubleshooting page and the preflight message.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Fix the documented install/run commands, which were broken for real users: a
  bare package name resolves to the semver range `*`, which excludes the
  prerelease versions this beta publishes, so every scaffolder example now pins
  `@latest`. `npx next-suite provision` also referenced a package that doesn't
  exist — `next-suite` ships as the bin of `create-next-suite`, so the docs now
  show installing it globally once (`npm i -g create-next-suite@latest`) before
  running `next-suite provision`.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Harden a few edge cases:

  - The post-generation `fix` step no longer runs after a failed install, which
    previously surfaced a second error for the same root cause.
  - `--shadcn-preset` is validated in `--yes` mode the same way the interactive
    wizard validates it, instead of being passed to `shadcn/create` unchecked.
  - `--help` now shows the full package description.
  - The Better-Auth and CD-workflow feature guards are self-sufficient, so a
    hand-built config can't emit a project that references files it never
    generated.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Make the first production deploy of a database project actually work, and make
  the health check mean something.

  A generated Drizzle project shipped with an empty `drizzle/` directory: nothing
  ever ran `db:generate`, and it was named in no generated file. The production
  entrypoint checks for `drizzle/meta/_journal.json` and, finding none, skipped
  migrations with a friendly message — so the first deploy served an application
  against a database with no tables, while the container reported healthy and
  every query that touched a table returned 500. Scaffolding now generates the
  initial migration after the install, so it lands in the initial commit, and the
  entrypoint refuses to start instead of skipping.

  `/api/health` was `() => Response.json({ status: "ok" })`. It imported nothing,
  so it proved only that Node was answering a socket: measured with an invalid
  `BETTER_AUTH_SECRET`, the container stayed healthy and `/` returned 200 while
  every auth and API route returned 500. It now imports `@/env` — which validates
  on import — and, when the project has a database, runs `select 1` against it,
  returning 503 on failure. Measured on a running stack: stopping the database
  turns the endpoint from 200 to 503 and the container from healthy to unhealthy.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - A failed migration no longer takes the site down.

  Migrations ran inside the app container's entrypoint, so a bad one killed the
  container, and compose — which had already stopped the previous release to
  recreate it — left nginx stopped too. Measured on a running stack: connection
  refused, a crash-looping app container, and no way back.

  `prod.sh up` and the CD deploy now apply migrations **before** they touch the
  stack, as a one-off container:

  ```sh
  docker compose -f docker-compose.prod.yml run --rm app migrate
  ```

  The ordering is the whole point. `compose up` stops the running containers to
  recreate them, so a migration failing in there still ends in an outage; run on
  its own it fails while the current release is still serving and nothing has
  been changed. Measured, same broken migration, on a live stack:

  ```
  compose up            -> site unreachable, app crash-loops
  prod.sh up            -> "Migration failed — the running stack was left
                            untouched", exit 1, site still 200
  ```

  The entrypoint takes an optional `migrate` argument for this and otherwise
  behaves exactly as before, so a plain `docker compose up` still migrates and
  nothing regresses for anyone not going through `prod.sh` or CD. The migration
  itself stays transactional — nothing is half-applied either way.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Tighten the generated nginx site block.

  `proxy_buffering` is now on for `/_next/static/` and `/_next/image` and stays off
  for the app. Off is right for the streaming SSR response, but on a static asset
  it made nginx hold one upstream connection into Node for the whole download —
  measured, ten throttled clients held eleven connections open where buffering
  holds one.

  `/_next/image` gets its own `limit_req` zone at 100 r/s instead of sharing the
  app's 30 r/s. A page with a gallery issues image requests in a burst no page view
  produces, so it used to throttle itself: measured on a live host, 150 parallel
  image requests now all pass where the same load against the app is limited.

  `server_tokens off` was only set on the TLS block, so the `:80` redirect and the
  ACME bootstrap answered with `nginx/1.24.0 (Ubuntu)`. Setting it per block is the
  only option here — from `conf.d` a http-level directive would be duplicated by
  the second project.

  **Behaviour change:** HSTS no longer carries `includeSubDomains`, in either
  deployment mode. The proxied block derived it from the label count, which cannot
  tell an apex from a subdomain — `example.co.uk` and `bbc.co.uk` are apexes with
  three labels and got it — and the standalone template hard-coded it while
  shipping `example.com`, an apex, as its placeholder. Guessing wrong commits every
  subdomain of the zone to HTTPS for two years with no server-side way back, so the
  header now ships without it in both and is opted into by hand.

  Two smaller corrections in the same area: `DEPLOY.md` recommended setting
  `X-Accel-Buffering: no` on SSE responses, which does nothing — nginx consumes
  `X-Accel-*` instead of forwarding it, so it never reaches the hop that would act
  on it, and the location serving the app already runs unbuffered. And
  `prod.sh restart` now waits for health like `prod.sh up` does, instead of
  reporting success for a container that comes back up and immediately dies.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Fixes from a full audit of the production stack against a local reproduction of
  the real server (Ubuntu 24.04 host nginx 1.24 → sidecar → app).

  - **The `:443` catch-all only closed the handshake, not the request.**
    `ssl_reject_handshake` stops an unknown SNI, but a client that presents a
    _valid_ SNI and then sends a foreign `Host:` header re-selects the virtual
    server after the handshake and lands in that same block. With no `return`
    there, nginx falls back to its compiled-in root — measured: `200 OK` with
    Ubuntu's "Welcome to nginx!" page. Standalone mode now answers `444`.
  - **Standalone TLS accepted ciphers without forward secrecy.** The block set
    `ssl_protocols` but no `ssl_ciphers`, leaving nginx's built-in
    `HIGH:!aNULL:!MD5` — measured: `AES128-SHA`, `AES128-SHA256` and static-RSA
    `AES256-GCM-SHA384` all negotiated. It now pins the same Mozilla
    "intermediate" list certbot writes for the proxied host.
  - **Rate limiting starved a normal page load.** One Next.js navigation pulls
    dozens of `/_next/static/` chunks, which spent the whole `burst=50` before a
    route was rendered — measured: 17 rejections in a 70-request burst. Immutable
    build output is now exempt, and a tripped limiter returns `429` rather than
    `503`.
  - **`provision --staging` then `provision` kept the staging certificate.**
    `certbot certonly` leaves a lineage that is not due for renewal alone, so the
    documented two-step flow silently served an untrusted certificate. The
    existing certificate's issuer is now checked and a staging one is reissued
    with `--force-renewal`.
  - **Preflight accepted an admin user that provision cannot use.** It passed a
    non-root user with passwordless sudo, but every remote step runs the bare
    command (`useradd`, `cat > /etc/nginx/…`, `certbot`) — the run failed midway.
    It now requires root and says why.
  - **Preflight now requires a `:443` default server on the host.** `ssl_protocols`
    is not selectable per SNI; without a catch-all the alphabetically first
    project block becomes the default and nginx's stock `TLSv1 TLSv1.1 …` applies
    to every site on the box.
  - **The development database published on `0.0.0.0`.** `docker-compose.yml` now
    binds `127.0.0.1`, matching the production stack.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Harden the generated proxy chain, from a review of all three nginx layers against the official docs.

  - **`X-Forwarded-For` is no longer client-controlled.** The internet-facing hops set `$remote_addr` instead of `$proxy_add_x_forwarded_for`, which appends to whatever the client sent — correct for a proxy behind a trusted one, an injection point at the edge. The proxied sidecar's pass-through is right once the host is the sole authority.
  - **Deploys now recreate the nginx sidecar** (`depends_on.app.restart`). Without it the sidecar kept the upstream IP it resolved at startup — a permanent 502 whenever the app container came back on a different address — and never loaded the `nginx.conf` the pipeline had just shipped.
  - **`APP_PORT` is required rather than defaulted.** It was missing from `DEPLOY.md`'s key list, so following the documented manual first deploy bound the `:-8080` fallback: a port collision with whatever else uses 8080, and a 502 either way, since the host block points at the assigned port. Compose now aborts with a message naming the file to fix.
  - **`serverActions.bodySizeLimit` matches `client_max_body_size`.** nginx accepted 25 MB while Server Actions still capped at the 1 MB default, so large uploads were transferred in full and then rejected inside the app instead of getting a 413 at the edge.
  - **`provision` no longer takes a live site down to renew a certificate.** A config already serving the target domain is left in place (both renderings serve the ACME webroot), and if certbot fails after a domain change the previous vhost is restored — the bootstrap block is valid nginx, so the existing revert-on-`nginx -t`-failure never caught this.
  - **Standalone mode rejects requests that are not for this site.** Its server block was the default for both sockets, so a bare-IP request, an unknown SNI, or a foreign domain pointed at the host was answered with this site's certificate and an attacker-chosen `Host` header — which Next.js treats as authoritative for absolute URLs. A catch-all now closes those connections; the ACME challenge still resolves, since it carries the real domain.
  - **`DEPLOY.md`** documents `APP_PORT`, and that standalone mode needs the certbot deploy hook to signal the container: a host-level `systemctl reload nginx` never reaches a sidecar that terminates TLS itself, so renewed certificates were not served.

  A second pass audited every directive in the generated nginx config against its own page on nginx.org:

  - **The nginx container ran a single worker.** The image sets `worker_processes auto`, but the config bind-mount replaces the file that carries it, leaving nginx's built-in default of `1`. Measured: 1 worker before, 16 after on a 16-core host.
  - **Access logs carried no client identity.** Same cause — the mount removed the image's `log_format main`, so logging fell back to the built-in `combined`, which has no `$http_x_forwarded_for` field. Behind the host nginx every line recorded the proxy's address.
  - **gzip was dead configuration and is gone**, in both the sidecar and the host block. The Next.js server compresses its own responses by default, and nginx does not re-compress an already-compressed upstream response. This also retires a `gzip_types` list that was missing `text/x-component` (the content type of every RSC navigation and Server Action result) while pointlessly listing the already-compressed `font/woff` and `font/woff2`.
  - **Standalone mode could crash-loop on a fresh host.** It included `/etc/letsencrypt/options-ssl-nginx.conf`, a file only certbot's nginx _installer_ creates — and a non-glob `include` of a missing file aborts config load, which with `restart: always` means an endless restart cycle. The TLS settings now live in the config itself, alongside a session cache (nginx's default is `none`, i.e. no resumption at all).
  - **Uploads were spooled to disk twice** in proxied mode, once per hop; the sidecar now sets `proxy_request_buffering off` and leaves the host to absorb slow uploaders.
  - **Standalone mode gained request rate limiting** (20 r/s, burst 50), the one item on the Next.js self-hosting docs' list of reverse-proxy responsibilities that was unimplemented where the sidecar is the sole edge.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Polish the docs that ship in generated projects: the project `README.md` now
  uses the chosen package manager in its commands and groups its sections more
  clearly, and the production `DEPLOY.md` is tightened with clearer headings.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Improve generated production projects:

  - Only declare and consume `NEXT_PUBLIC_APP_URL` in the production compose file,
    Dockerfile, and CD workflow when the app actually uses it (an API layer or
    Better-Auth), avoiding an unset build-arg warning otherwise.
  - Document the GitHub Actions deploy secrets and variables (`DEPLOY_SSH_KEY`,
    `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_PATH`) in the generated
    `DEPLOY.md`.
  - The generated `README.md` stack table now reflects the chosen features
    (styling, database, ORM, API, auth, email, deployment).

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Fix four `provision` failure modes that a re-run could not heal.

  `APP_PORT` now follows the port registry instead of surviving the additive
  `.env` merge. A lost `/srv/ports.json` used to allocate a fresh port, hand it to
  nginx, and leave the old one in `.env` — nginx proxying to one port while the
  container bound another, permanently, with every further run reproducing it.

  `/srv/ports.json` is written staged (`.tmp` + `mv`) like the `.env` already was.
  `cat >` truncates before it writes, so an interrupted upload cost every project
  on the host its port assignment.

  A validated nginx config now rotates its backup to `$conf.prev` instead of
  deleting it. Provision runs certbot between the ACME bootstrap and the full
  block; if that process died in between, the original vhost was gone with no copy
  anywhere.

  A domain already served by another project in `conf.d` now aborts the run before
  anything is written. nginx treats a duplicate `server_name` as a warning and
  `nginx -t` still exits 0, so the write guard could not see it — the
  alphabetically first config silently won and took over the other project's site.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Close the quieter failure modes in `provision` and `deprovision`.

  `readRemoteFile` could not tell a missing file from an unreadable one — both
  read as empty. The callers act on the two in opposite ways: an absent `.env` is
  created with fresh secrets, so an unreadable one silently rotated the database
  password and every session, while the run reported `.env: N keys uploaded (0
kept)`. A file that exists but cannot be read now throws.

  Host-key checking is pinned to `accept-new`. The default is `ask`, and execa
  gives ssh no TTY, so the first connection from CI or any non-interactive shell
  died on `ssh-askpass: No such file or directory` instead of connecting.
  `accept-new` still refuses a host key that changed.

  A hand-added `server_name` — a `www` alias, a second brand — used to disappear
  without a word on the next run, because the generated block carries exactly one
  name. Provision now names what it is about to drop, and points at a leftover
  certificate lineage for that name if one actually exists.

  `deprovision` announced `<name> deprovisioned.` even when `userdel` had failed
  or the nginx config could not be removed. It now says what stayed behind.

  The control socket directory is short enough for macOS, where `os.tmpdir()` is
  already ~48 characters and the old name pushed `ControlPath` past the ~104-byte
  limit for unix sockets. Its cleanup also runs on SIGINT and SIGTERM — `exit`
  does not fire on a signal, and Ctrl-C during the minute certbot can take left a
  directory behind every time.

  `host` and `adminUser` are validated: they become ssh's first argument, and a
  value starting with `-` is read as an option, so `-oProxyCommand=…` from a
  tampered config file executed locally. A project name is capped at 32
  characters, the limit `useradd` enforces — over it, the run died mid-way with a
  raw ssh error after preflight had reported everything green.

  The `tls-catch-all` preflight check no longer blames a missing `:443
default_server` when `nginx -T` fails to load for an unrelated reason.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Provisioning no longer depends on host-wide nginx snippets, and preflight checks
  the one prerequisite that actually breaks the first deploy.

  - **The generated site block declares its own `map` and `limit_req_zone`.** It
    referenced a global `$connection_upgrade` map and a `perip` zone that had to
    exist in nginx `http{}` — but `conf.d` sits inside one shared `http{}`
    namespace, so a second project could not declare them itself and preflight had
    to demand them from the host. Both now live in the block, suffixed with the
    project's port, and the two preflight checks are gone.
  - **Preflight now verifies Docker and the Compose plugin.** The deploy runs
    `docker compose` on the server, so a host without it passed provision and
    failed on the first deploy instead.
  - **Teardown left the project's nginx logs behind**, and the fail2ban jails that
    read them kept pointing at deleted files. `deprovision` now removes both log
    files and reloads `nginx-limit-req` / `nginx-botsearch`.
  - **A provision run re-authenticated ~25 separate ssh connections.** They now
    share one multiplexed connection (`ControlMaster`); Windows OpenSSH has no
    multiplexing and stays on the plain path.
  - **The dry-run plan derives its prerequisite list from the checks themselves**
    rather than a hand-written copy that could drift out of sync.
  - `@types/node` moved to v24, matching the Node >= 24 floor the CLI and every
    generated project already require.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Remove inline comments from the CLI sources and from the scaffolded output.

  Comments now sit above declarations or not at all — trailing labels and
  step-body comments are gone from the templates, the CD workflow and the
  production entrypoint, so generated projects start out clean. ESLint
  directives and the placeholder hints that tell you where to add your own
  schema, models and `NEXT_PUBLIC_*` variables are untouched.

- [`1c93622`](https://github.com/maurice-rm/next-suite/commit/1c93622edb74707317036888611fa25aae15fea7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Fix wizard back-navigation discarding the previous answer. Revisiting a step now
  restores the value you had chosen instead of resetting to its default, so
  pressing Enter after going back no longer silently overwrites it.

## 1.0.0-beta.9

### Patch Changes

- [#94](https://github.com/maurice-rm/next-suite/pull/94) [`8997b95`](https://github.com/maurice-rm/next-suite/commit/8997b95896428a50e47d5553773afa41ac7ae1c5) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Move the CLI onto `execa` 10 and refresh the rest of the toolchain.

  `execa` is a runtime dependency and drives every post-step that shells out —
  git init, install, shadcn, format, commit. Verified with a full scaffold that
  ran all of them and ended on a clean tree with the initial commit in place.
  `@clack/core`, `@clack/prompts` and `fs-extra` move up too; `eslint` 10,
  `@types/node` 26, `simple-import-sort` 14, `vitest`, `tsx`, `turbo` and
  `typescript-eslint` are development-only.

  Generated projects are unaffected — they pin their own versions in
  `generator/config/dependencies.ts`.

## 1.0.0-beta.8

### Patch Changes

- [#92](https://github.com/maurice-rm/next-suite/pull/92) [`0cdb143`](https://github.com/maurice-rm/next-suite/commit/0cdb143f4a43c54410a2de8c3dc62d4c16e65d9f) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Let `deprovision` take the nginx backup with the config it belongs to.

  Every provision run rotates the previous vhost to `<project>.conf.prev` so an
  interrupted certbot step cannot leave the host without a copy. The teardown
  removed `<project>.conf` but never the backup, so each deprovisioned project
  left one behind for good. nginx includes `*.conf` only and never loaded them,
  but they accumulated in `conf.d` with the project's domain still inside.

- [#92](https://github.com/maurice-rm/next-suite/pull/92) [`6f3e55f`](https://github.com/maurice-rm/next-suite/commit/6f3e55fd84ce61a55ba2ce6a13c08c4ef8b8d1bc) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Give `deprovision` a teardown command you can actually run.

  The run already said that containers and volumes survive the teardown, but the
  same run deletes `/srv/www/<project>` and with it the compose file you would
  have needed to act on that. The note now names the Compose project instead —
  `docker compose -p <project> down -v` finds the containers, network and volumes
  by their labels and needs no compose file. Compose strips characters it
  disallows when it derives the project name from the directory, so the note drops
  the dot a project name may carry.

## 1.0.0-beta.7

### Patch Changes

- [#83](https://github.com/maurice-rm/next-suite/pull/83) [`cf0dbf6`](https://github.com/maurice-rm/next-suite/commit/cf0dbf629b6cefecef4b382361dc4877c397dda4) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Bump the actions in the generated workflows onto their current majors, which
  run on Node 24. GitHub is deprecating Node 20 and already forces these onto 24,
  so every run of a generated project logged a deprecation warning naming
  `actions/checkout`, `docker/build-push-action`, `docker/login-action`,
  `docker/metadata-action` and `docker/setup-buildx-action`.

  `actions/checkout` v4 → v7, `actions/setup-node` v4 → v7, `pnpm/action-setup`
  v4 → v6, `docker/setup-buildx-action` v3 → v4, `docker/login-action` v3 → v4,
  `docker/metadata-action` v5 → v6, `docker/build-push-action` v6 → v7.
  `oven-sh/setup-bun@v2` already runs on Node 24 and stays.

  Nothing in the templates uses an input the new majors dropped, and the explicit
  `cache:` in the setup action keeps precedence over the automatic package-manager
  caching `setup-node` v5 introduced. The majors require Actions runner v2.327.1,
  which GitHub-hosted runners exceed.

- [#84](https://github.com/maurice-rm/next-suite/pull/84) [`875ab45`](https://github.com/maurice-rm/next-suite/commit/875ab45a0379bbc0774c46b19527bf51fd15d56b) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Fix a deploy that stopped after the migration and still reported success.

  The deploy script reaches the server on stdin (`bash -s` with a heredoc), and
  `docker compose run` attaches stdin — so it consumed the rest of the script.
  Everything after the migration, including `up -d --wait`, never ran, and the
  step exited 0 because bash simply reached end of input. On a first deploy the
  result was a project with only its database container running and a green
  workflow. `-T` does not prevent this; the command now reads from `/dev/null`.

- [#86](https://github.com/maurice-rm/next-suite/pull/86) [`5dfee13`](https://github.com/maurice-rm/next-suite/commit/5dfee13ab338d24020c0b5b499638ebad6e803ec) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Remove inline comments from the CLI sources and from the scaffolded output.

  Comments now sit above declarations or not at all — trailing labels and
  step-body comments are gone from the templates, the CD workflow and the
  production entrypoint, so generated projects start out clean. ESLint
  directives and the placeholder hints that tell you where to add your own
  schema, models and `NEXT_PUBLIC_*` variables are untouched.

## 1.0.0-beta.6

### Patch Changes

- [#81](https://github.com/maurice-rm/next-suite/pull/81) [`8b57060`](https://github.com/maurice-rm/next-suite/commit/8b570608bb76e1fe627baeadac18f068c721c7ee) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Fix the generated CD deploy step, which could break a repository outright and
  left no way back from a bad release.

  The image was pushed under a lowercased name — `docker/metadata-action`
  lowercases it — but pulled with the repository's original spelling. Any owner or
  repository containing a capital letter built and pushed green, then failed the
  deploy with `repository name must be lowercase`. The name is now folded on both
  sides.

  A rollout that never becomes healthy no longer takes the site with it. The step
  records the running image, waits for health with `up -d --wait`, and on failure
  puts the previous image back and brings the stack up again — then still exits
  non-zero, so the run goes red. Previously the old container was already gone by
  the time the new one failed.

  `docker image prune -f` ran daemon-wide after every deploy. The image it deleted
  first was the one the deploy could have rolled back to — freshly untagged by the
  pull — and on a host with several provisioned projects it took their images too.
  It is now limited to images unused for a week.

  Appending `DOCKER_IMAGE` to a `.env` without a trailing newline glued it onto the
  last line, silently corrupting whatever it held — `BETTER_AUTH_SECRET` in a
  default project. The file gets its newline first. `provision`-written files were
  never affected; hand-written ones, which `DEPLOY.md` asks for, were.

  The GHCR token was interpolated into the remote command line, so it sat in
  `/proc/<pid>/cmdline` for the length of the deploy, readable by any local user.
  It now travels on stdin, and the session logs out afterwards.

  Also: `rsync` is documented as a server requirement. The deploy has always
  needed it on both ends, and nothing said so — preflight passes without it and
  the first deploy is what fails.

- [#81](https://github.com/maurice-rm/next-suite/pull/81) [`ec2b114`](https://github.com/maurice-rm/next-suite/commit/ec2b1142df5458fadaddf3cb8631d22be0e5cd19) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Guard the database credentials in `docker-compose.prod.yml` the same way
  `APP_PORT` already was. Without them Postgres started with an empty user and
  password and failed inside the image with a message that pointed nowhere near
  the `.env`; compose now refuses to interpolate and names the missing key.

- [#81](https://github.com/maurice-rm/next-suite/pull/81) [`79cd44a`](https://github.com/maurice-rm/next-suite/commit/79cd44acbffe8ec9e4a56d2de77f4f05ce796d7f) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Lock down the per-project nginx logs, and correct the last documented claims
  that did not match the code.

  nginx creates a per-project access and error log `0644` and root-owned, so on a
  host running several provisioned projects every project user could read every
  other project's client IPs and request URLs. Provision now creates them
  `0640 www-data:adm`, the mode the distribution uses for its own logs, and
  logrotate keeps them there. The paths are derived from the config block itself,
  so they cannot drift apart. Measured on a live host: `head` as the project user
  went from printing a foreign client IP to `Permission denied`.

  `nginx: site <domain> live` overstated what had happened — the vhost is written
  and nginx reloaded, but nothing listens on the loopback port until a deploy
  brings the stack up, so the site answers 502 until then. The step now says what
  it actually did.

  Documentation corrections, each checked against the code rather than re-read:

  - Three of the five exit-code rows in the CLI reference were wrong. A post-step
    cannot produce exit 1 (each is caught individually, as the same page states
    two paragraphs later); exit 1 belongs to all three `next-suite` subcommands,
    not just `provision`; and only `next-suite` can fail to parse its command
    line — measured, `create-next-suite` ignores an unknown flag and exits 0.
  - `next-suite` subcommands "all read and write the global config" — only
    `config` and `provision` write it, `provision` only when it does not exist
    yet and never under `--dry-run`.
  - `AGENTS.md` listed three workflows; there are four. `zizmor.yml` runs on
    workflow edits, so touching one triggers a job the other three do not cover.
  - The layering table in `architecture.md` was missing `@/branding` and
    `@/core/version-check` for `ui/`, `@/core/target` for `generator/`, and two of
    the three imports in `suite.ts`; it also listed `@/options` for `generator/`,
    which only `generator/config/` imports. The shorthand `@/core` suggested a
    barrel module that does not exist.

- [#81](https://github.com/maurice-rm/next-suite/pull/81) [`e24b06d`](https://github.com/maurice-rm/next-suite/commit/e24b06d67cd1a4a918aa597df038a73dbc05eacc) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Fix documentation that pointed nowhere, and close the gaps a first-time user
  falls into on a fresh server.

  Three preflight failure messages told the reader to see "'Host setup', step 1 /
  4 / 5 in the CLI README". No such section existed in any file — and a test
  asserted the strings, so the dead pointers stayed green. They now name the real
  sections in `docs/server-requirements.md`, and the test resolves each reference
  against that file's actual headings instead of matching the text.

  `provision` needs `ssh`, `ssh-keygen` and an authenticated `gh`; none of them
  appeared in either requirements list. `ssh-keygen` was not mentioned in the
  published documentation at all.

  Provisioning now opens with the DNS record, which was only ever mentioned as a
  warning after the fact — a record that does not resolve yet costs a Let's
  Encrypt rate-limit slot.

  The generated `DEPLOY.md` for `standalone` now covers what has to happen before
  the first deploy: the four `# TODO` placeholders in `nginx/nginx.conf`, the
  `includeSubDomains` default that is wrong for an apex domain, and the first
  certificate — which cannot come from the webroot, because the nginx that would
  serve the challenge is the one that will not start without the certificate.
  `scripts/prod.sh bootstrap` is documented in both modes; it existed but appeared
  in no published file.

  `docs/architecture.md` described a `wizard.ts` ↔ `ui/` module cycle that was
  removed some releases ago. It documented a layering violation that no longer
  exists, in the file that teaches contributors the layering rules.

  Also corrected: the README said the deploy user joins the `docker` group,
  omitting `deploy` — the group that takes SSH tunneling away from the deploy key
  — and called the two TLS helper files "not shipped by any package", which
  contradicts the guide, the troubleshooting page and the preflight message.

- [#81](https://github.com/maurice-rm/next-suite/pull/81) [`8b57060`](https://github.com/maurice-rm/next-suite/commit/8b570608bb76e1fe627baeadac18f068c721c7ee) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Make the first production deploy of a database project actually work, and make
  the health check mean something.

  A generated Drizzle project shipped with an empty `drizzle/` directory: nothing
  ever ran `db:generate`, and it was named in no generated file. The production
  entrypoint checks for `drizzle/meta/_journal.json` and, finding none, skipped
  migrations with a friendly message — so the first deploy served an application
  against a database with no tables, while the container reported healthy and
  every query that touched a table returned 500. Scaffolding now generates the
  initial migration after the install, so it lands in the initial commit, and the
  entrypoint refuses to start instead of skipping.

  `/api/health` was `() => Response.json({ status: "ok" })`. It imported nothing,
  so it proved only that Node was answering a socket: measured with an invalid
  `BETTER_AUTH_SECRET`, the container stayed healthy and `/` returned 200 while
  every auth and API route returned 500. It now imports `@/env` — which validates
  on import — and, when the project has a database, runs `select 1` against it,
  returning 503 on failure. Measured on a running stack: stopping the database
  turns the endpoint from 200 to 503 and the container from healthy to unhealthy.

- [#81](https://github.com/maurice-rm/next-suite/pull/81) [`8b57060`](https://github.com/maurice-rm/next-suite/commit/8b570608bb76e1fe627baeadac18f068c721c7ee) Thanks [@maurice-rm](https://github.com/maurice-rm)! - A failed migration no longer takes the site down.

  Migrations ran inside the app container's entrypoint, so a bad one killed the
  container, and compose — which had already stopped the previous release to
  recreate it — left nginx stopped too. Measured on a running stack: connection
  refused, a crash-looping app container, and no way back.

  `prod.sh up` and the CD deploy now apply migrations **before** they touch the
  stack, as a one-off container:

  ```sh
  docker compose -f docker-compose.prod.yml run --rm app migrate
  ```

  The ordering is the whole point. `compose up` stops the running containers to
  recreate them, so a migration failing in there still ends in an outage; run on
  its own it fails while the current release is still serving and nothing has
  been changed. Measured, same broken migration, on a live stack:

  ```
  compose up            -> site unreachable, app crash-loops
  prod.sh up            -> "Migration failed — the running stack was left
                            untouched", exit 1, site still 200
  ```

  The entrypoint takes an optional `migrate` argument for this and otherwise
  behaves exactly as before, so a plain `docker compose up` still migrates and
  nothing regresses for anyone not going through `prod.sh` or CD. The migration
  itself stays transactional — nothing is half-applied either way.

- [#81](https://github.com/maurice-rm/next-suite/pull/81) [`79cd44a`](https://github.com/maurice-rm/next-suite/commit/79cd44acbffe8ec9e4a56d2de77f4f05ce796d7f) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Tighten the generated nginx site block.

  `proxy_buffering` is now on for `/_next/static/` and `/_next/image` and stays off
  for the app. Off is right for the streaming SSR response, but on a static asset
  it made nginx hold one upstream connection into Node for the whole download —
  measured, ten throttled clients held eleven connections open where buffering
  holds one.

  `/_next/image` gets its own `limit_req` zone at 100 r/s instead of sharing the
  app's 30 r/s. A page with a gallery issues image requests in a burst no page view
  produces, so it used to throttle itself: measured on a live host, 150 parallel
  image requests now all pass where the same load against the app is limited.

  `server_tokens off` was only set on the TLS block, so the `:80` redirect and the
  ACME bootstrap answered with `nginx/1.24.0 (Ubuntu)`. Setting it per block is the
  only option here — from `conf.d` a http-level directive would be duplicated by
  the second project.

  **Behaviour change:** HSTS no longer carries `includeSubDomains`, in either
  deployment mode. The proxied block derived it from the label count, which cannot
  tell an apex from a subdomain — `example.co.uk` and `bbc.co.uk` are apexes with
  three labels and got it — and the standalone template hard-coded it while
  shipping `example.com`, an apex, as its placeholder. Guessing wrong commits every
  subdomain of the zone to HTTPS for two years with no server-side way back, so the
  header now ships without it in both and is opted into by hand.

  Two smaller corrections in the same area: `DEPLOY.md` recommended setting
  `X-Accel-Buffering: no` on SSE responses, which does nothing — nginx consumes
  `X-Accel-*` instead of forwarding it, so it never reaches the hop that would act
  on it, and the location serving the app already runs unbuffered. And
  `prod.sh restart` now waits for health like `prod.sh up` does, instead of
  reporting success for a container that comes back up and immediately dies.

- [#81](https://github.com/maurice-rm/next-suite/pull/81) [`79cd44a`](https://github.com/maurice-rm/next-suite/commit/79cd44acbffe8ec9e4a56d2de77f4f05ce796d7f) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Fix four `provision` failure modes that a re-run could not heal.

  `APP_PORT` now follows the port registry instead of surviving the additive
  `.env` merge. A lost `/srv/ports.json` used to allocate a fresh port, hand it to
  nginx, and leave the old one in `.env` — nginx proxying to one port while the
  container bound another, permanently, with every further run reproducing it.

  `/srv/ports.json` is written staged (`.tmp` + `mv`) like the `.env` already was.
  `cat >` truncates before it writes, so an interrupted upload cost every project
  on the host its port assignment.

  A validated nginx config now rotates its backup to `$conf.prev` instead of
  deleting it. Provision runs certbot between the ACME bootstrap and the full
  block; if that process died in between, the original vhost was gone with no copy
  anywhere.

  A domain already served by another project in `conf.d` now aborts the run before
  anything is written. nginx treats a duplicate `server_name` as a warning and
  `nginx -t` still exits 0, so the write guard could not see it — the
  alphabetically first config silently won and took over the other project's site.

- [#81](https://github.com/maurice-rm/next-suite/pull/81) [`79cd44a`](https://github.com/maurice-rm/next-suite/commit/79cd44acbffe8ec9e4a56d2de77f4f05ce796d7f) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Close the quieter failure modes in `provision` and `deprovision`.

  `readRemoteFile` could not tell a missing file from an unreadable one — both
  read as empty. The callers act on the two in opposite ways: an absent `.env` is
  created with fresh secrets, so an unreadable one silently rotated the database
  password and every session, while the run reported `.env: N keys uploaded (0
kept)`. A file that exists but cannot be read now throws.

  Host-key checking is pinned to `accept-new`. The default is `ask`, and execa
  gives ssh no TTY, so the first connection from CI or any non-interactive shell
  died on `ssh-askpass: No such file or directory` instead of connecting.
  `accept-new` still refuses a host key that changed.

  A hand-added `server_name` — a `www` alias, a second brand — used to disappear
  without a word on the next run, because the generated block carries exactly one
  name. Provision now names what it is about to drop, and points at a leftover
  certificate lineage for that name if one actually exists.

  `deprovision` announced `<name> deprovisioned.` even when `userdel` had failed
  or the nginx config could not be removed. It now says what stayed behind.

  The control socket directory is short enough for macOS, where `os.tmpdir()` is
  already ~48 characters and the old name pushed `ControlPath` past the ~104-byte
  limit for unix sockets. Its cleanup also runs on SIGINT and SIGTERM — `exit`
  does not fire on a signal, and Ctrl-C during the minute certbot can take left a
  directory behind every time.

  `host` and `adminUser` are validated: they become ssh's first argument, and a
  value starting with `-` is read as an option, so `-oProxyCommand=…` from a
  tampered config file executed locally. A project name is capped at 32
  characters, the limit `useradd` enforces — over it, the run died mid-way with a
  raw ssh error after preflight had reported everything green.

  The `tls-catch-all` preflight check no longer blames a missing `:443
default_server` when `nginx -T` fails to load for an unrelated reason.

## 1.0.0-beta.5

### Patch Changes

- [`c4258d8`](https://github.com/maurice-rm/next-suite/commit/c4258d8c238282bdc9b571ff76e54d0d115cc354) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Provisioning no longer depends on host-wide nginx snippets, and preflight checks
  the one prerequisite that actually breaks the first deploy.

  - **The generated site block declares its own `map` and `limit_req_zone`.** It
    referenced a global `$connection_upgrade` map and a `perip` zone that had to
    exist in nginx `http{}` — but `conf.d` sits inside one shared `http{}`
    namespace, so a second project could not declare them itself and preflight had
    to demand them from the host. Both now live in the block, suffixed with the
    project's port, and the two preflight checks are gone.
  - **Preflight now verifies Docker and the Compose plugin.** The deploy runs
    `docker compose` on the server, so a host without it passed provision and
    failed on the first deploy instead.
  - **Teardown left the project's nginx logs behind**, and the fail2ban jails that
    read them kept pointing at deleted files. `deprovision` now removes both log
    files and reloads `nginx-limit-req` / `nginx-botsearch`.
  - **A provision run re-authenticated ~25 separate ssh connections.** They now
    share one multiplexed connection (`ControlMaster`); Windows OpenSSH has no
    multiplexing and stays on the plain path.
  - **The dry-run plan derives its prerequisite list from the checks themselves**
    rather than a hand-written copy that could drift out of sync.
  - `@types/node` moved to v24, matching the Node >= 24 floor the CLI and every
    generated project already require.

## 1.0.0-beta.4

### Patch Changes

- [#72](https://github.com/maurice-rm/next-suite/pull/72) [`1ea8076`](https://github.com/maurice-rm/next-suite/commit/1ea80761ff62c46430b2c2c0975f4ad59aa61706) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Fixes from a full audit of the production stack against a local reproduction of
  the real server (Ubuntu 24.04 host nginx 1.24 → sidecar → app).

  - **The `:443` catch-all only closed the handshake, not the request.**
    `ssl_reject_handshake` stops an unknown SNI, but a client that presents a
    _valid_ SNI and then sends a foreign `Host:` header re-selects the virtual
    server after the handshake and lands in that same block. With no `return`
    there, nginx falls back to its compiled-in root — measured: `200 OK` with
    Ubuntu's "Welcome to nginx!" page. Standalone mode now answers `444`.
  - **Standalone TLS accepted ciphers without forward secrecy.** The block set
    `ssl_protocols` but no `ssl_ciphers`, leaving nginx's built-in
    `HIGH:!aNULL:!MD5` — measured: `AES128-SHA`, `AES128-SHA256` and static-RSA
    `AES256-GCM-SHA384` all negotiated. It now pins the same Mozilla
    "intermediate" list certbot writes for the proxied host.
  - **Rate limiting starved a normal page load.** One Next.js navigation pulls
    dozens of `/_next/static/` chunks, which spent the whole `burst=50` before a
    route was rendered — measured: 17 rejections in a 70-request burst. Immutable
    build output is now exempt, and a tripped limiter returns `429` rather than
    `503`.
  - **`provision --staging` then `provision` kept the staging certificate.**
    `certbot certonly` leaves a lineage that is not due for renewal alone, so the
    documented two-step flow silently served an untrusted certificate. The
    existing certificate's issuer is now checked and a staging one is reissued
    with `--force-renewal`.
  - **Preflight accepted an admin user that provision cannot use.** It passed a
    non-root user with passwordless sudo, but every remote step runs the bare
    command (`useradd`, `cat > /etc/nginx/…`, `certbot`) — the run failed midway.
    It now requires root and says why.
  - **Preflight now requires a `:443` default server on the host.** `ssl_protocols`
    is not selectable per SNI; without a catch-all the alphabetically first
    project block becomes the default and nginx's stock `TLSv1 TLSv1.1 …` applies
    to every site on the box.
  - **The development database published on `0.0.0.0`.** `docker-compose.yml` now
    binds `127.0.0.1`, matching the production stack.

- [#72](https://github.com/maurice-rm/next-suite/pull/72) [`ae428b2`](https://github.com/maurice-rm/next-suite/commit/ae428b23cd7838438f6ba567fc4d1597f74daa19) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Harden the generated proxy chain, from a review of all three nginx layers against the official docs.

  - **`X-Forwarded-For` is no longer client-controlled.** The internet-facing hops set `$remote_addr` instead of `$proxy_add_x_forwarded_for`, which appends to whatever the client sent — correct for a proxy behind a trusted one, an injection point at the edge. The proxied sidecar's pass-through is right once the host is the sole authority.
  - **Deploys now recreate the nginx sidecar** (`depends_on.app.restart`). Without it the sidecar kept the upstream IP it resolved at startup — a permanent 502 whenever the app container came back on a different address — and never loaded the `nginx.conf` the pipeline had just shipped.
  - **`APP_PORT` is required rather than defaulted.** It was missing from `DEPLOY.md`'s key list, so following the documented manual first deploy bound the `:-8080` fallback: a port collision with whatever else uses 8080, and a 502 either way, since the host block points at the assigned port. Compose now aborts with a message naming the file to fix.
  - **`serverActions.bodySizeLimit` matches `client_max_body_size`.** nginx accepted 25 MB while Server Actions still capped at the 1 MB default, so large uploads were transferred in full and then rejected inside the app instead of getting a 413 at the edge.
  - **`provision` no longer takes a live site down to renew a certificate.** A config already serving the target domain is left in place (both renderings serve the ACME webroot), and if certbot fails after a domain change the previous vhost is restored — the bootstrap block is valid nginx, so the existing revert-on-`nginx -t`-failure never caught this.
  - **Standalone mode rejects requests that are not for this site.** Its server block was the default for both sockets, so a bare-IP request, an unknown SNI, or a foreign domain pointed at the host was answered with this site's certificate and an attacker-chosen `Host` header — which Next.js treats as authoritative for absolute URLs. A catch-all now closes those connections; the ACME challenge still resolves, since it carries the real domain.
  - **`DEPLOY.md`** documents `APP_PORT`, and that standalone mode needs the certbot deploy hook to signal the container: a host-level `systemctl reload nginx` never reaches a sidecar that terminates TLS itself, so renewed certificates were not served.

  A second pass audited every directive in the generated nginx config against its own page on nginx.org:

  - **The nginx container ran a single worker.** The image sets `worker_processes auto`, but the config bind-mount replaces the file that carries it, leaving nginx's built-in default of `1`. Measured: 1 worker before, 16 after on a 16-core host.
  - **Access logs carried no client identity.** Same cause — the mount removed the image's `log_format main`, so logging fell back to the built-in `combined`, which has no `$http_x_forwarded_for` field. Behind the host nginx every line recorded the proxy's address.
  - **gzip was dead configuration and is gone**, in both the sidecar and the host block. The Next.js server compresses its own responses by default, and nginx does not re-compress an already-compressed upstream response. This also retires a `gzip_types` list that was missing `text/x-component` (the content type of every RSC navigation and Server Action result) while pointlessly listing the already-compressed `font/woff` and `font/woff2`.
  - **Standalone mode could crash-loop on a fresh host.** It included `/etc/letsencrypt/options-ssl-nginx.conf`, a file only certbot's nginx _installer_ creates — and a non-glob `include` of a missing file aborts config load, which with `restart: always` means an endless restart cycle. The TLS settings now live in the config itself, alongside a session cache (nginx's default is `none`, i.e. no resumption at all).
  - **Uploads were spooled to disk twice** in proxied mode, once per hop; the sidecar now sets `proxy_request_buffering off` and leaves the host to absorb slow uploaders.
  - **Standalone mode gained request rate limiting** (20 r/s, burst 50), the one item on the Next.js self-hosting docs' list of reverse-proxy responsibilities that was unimplemented where the sidecar is the sole edge.

## 1.0.0-beta.3

### Patch Changes

- [#69](https://github.com/maurice-rm/next-suite/pull/69) [`2dd591b`](https://github.com/maurice-rm/next-suite/commit/2dd591b41f9b70c709475141ba30a41ede0fb86d) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Clarify the `ssl-dhparams.pem` prerequisite: it ships with certbot's nginx plugin, so generating one by hand is only the fallback. The README table and the preflight message said "generate this", which invited overwriting certbot's own file for no benefit — TLS 1.3 does not use `ssl_dhparam` at all.

- [#71](https://github.com/maurice-rm/next-suite/pull/71) [`5c717c9`](https://github.com/maurice-rm/next-suite/commit/5c717c92a005d22d26e9b9064a495f8c6116bcab) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Fix the documented install/run commands, which were broken for real users: a
  bare package name resolves to the semver range `*`, which excludes the
  prerelease versions this beta publishes, so every scaffolder example now pins
  `@latest`. `npx next-suite provision` also referenced a package that doesn't
  exist — `next-suite` ships as the bin of `create-next-suite`, so the docs now
  show installing it globally once (`npm i -g create-next-suite@latest`) before
  running `next-suite provision`.

## 1.0.0-beta.2

### Minor Changes

- [#67](https://github.com/maurice-rm/next-suite/pull/67) [`312a746`](https://github.com/maurice-rm/next-suite/commit/312a74688fdb246d0ce1c7810a4eec151c3a9629) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Move to the Node 24 LTS line: the CLI and every generated project now require Node >= 24, with `.nvmrc`, the production Dockerfile, and the generated CI workflows updated to match.

  Node 22 entered maintenance in October 2025 and reaches end of life in April 2027, so scaffolding new projects onto it would hand users a migration right after `create`. Node 24 is supported until April 2028. The previous floor was also below what the dependency trees actually require (`lint-staged` needs >= 22.22.1, `@commitlint/*` >= 22.12, `prisma` ^22.12), which made `npm install` print a wall of `EBADENGINE` warnings — both for the CLI and in every scaffolded project.

- [#67](https://github.com/maurice-rm/next-suite/pull/67) [`3dcf978`](https://github.com/maurice-rm/next-suite/commit/3dcf97856b454cd5f9f1bd78594db892a810d80f) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Every scaffolded project now emits a committed `next-suite.json` manifest, and proxied deployments expose their port via `APP_PORT`. The new `next-suite provision` command — **beta, experimental server tooling** — provisions a proxied project's server over SSH — deploy user, `.env`, central nginx + certbot TLS, and GitHub deploy secrets — with `--dry-run`, `--staging`, `--skip-github`, and `--yes`.

  `provision` is now interactive by default: a banner, prompts for domain/staging/GitHub, a plan summary, and a confirm gate before anything changes, with live step output as each action completes; flags make it non-interactive (`--yes` requires `--domain`). The server layout uses a plain project-name user under `/srv/www/<name>` (refusing to reuse an existing account with a different home), with `.env` owned by that user at mode 600.

  Two new commands round out the lifecycle: `next-suite deprovision` interactively discovers and tears down everything a `provision` run created (nginx conf, cert, user, `/srv/www/<name>`, port entry, GitHub secrets, local deploy key), and `next-suite config` edits the global `~/.config/next-suite/config.json` (host, admin user, certbot email).

  `provision` requires the project's committed `.env.example` on disk — it's the template for the server `.env`. It also requires the project name to start with a lowercase letter.

## 1.0.0-beta.1

### Patch Changes

- [#64](https://github.com/maurice-rm/next-suite/pull/64) [`be738e8`](https://github.com/maurice-rm/next-suite/commit/be738e8e42c70c5199feddf537c8cc7ac95007c7) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Simplify the startup banner: the meta strip now shows just the version and the
  repo link (the feature count is removed), so it sits centered under the wordmark
  instead of running the full width.

## 1.0.0-beta.0

### Major Changes

- [#62](https://github.com/maurice-rm/next-suite/pull/62) [`776df1f`](https://github.com/maurice-rm/next-suite/commit/776df1ffde6a3df2abab6396a33ed63247481536) Thanks [@maurice-rm](https://github.com/maurice-rm)! - First public release. The CLI and the projects it generates are feature-complete
  and covered by unit tests, a golden snapshot, and an end-to-end build matrix.
  Shipped as a `1.0.0` beta while the flags and generated output settle ahead of a
  stable `1.0.0`.

### Minor Changes

- [#52](https://github.com/maurice-rm/next-suite/pull/52) [`eb1ad5f`](https://github.com/maurice-rm/next-suite/commit/eb1ad5f205a300ac9e86cc884788432a08184fbb) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Generate shell helper scripts in scaffolded projects. `scripts/setup.sh` takes a
  fresh clone to a running app (creates `.env` with generated secrets, installs
  dependencies, optionally starts the database). Production projects also get
  `scripts/prod.sh` (bootstrap `.env` + Docker Compose control) and a `DEPLOY.md`
  server checklist; the auto-deploy now ships the scripts and fails clearly when no
  `.env` exists on the server.

### Patch Changes

- [#57](https://github.com/maurice-rm/next-suite/pull/57) [`03ca68b`](https://github.com/maurice-rm/next-suite/commit/03ca68b29d6bb2daa707a760c37aa4a07d06f830) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Harden a few edge cases:

  - The post-generation `fix` step no longer runs after a failed install, which
    previously surfaced a second error for the same root cause.
  - `--shadcn-preset` is validated in `--yes` mode the same way the interactive
    wizard validates it, instead of being passed to `shadcn/create` unchecked.
  - `--help` now shows the full package description.
  - The Better-Auth and CD-workflow feature guards are self-sufficient, so a
    hand-built config can't emit a project that references files it never
    generated.

- [#61](https://github.com/maurice-rm/next-suite/pull/61) [`5dca1a4`](https://github.com/maurice-rm/next-suite/commit/5dca1a45b7319401b51f842926292551657dca6d) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Polish the docs that ship in generated projects: the project `README.md` now
  uses the chosen package manager in its commands and groups its sections more
  clearly, and the production `DEPLOY.md` is tightened with clearer headings.

- [#58](https://github.com/maurice-rm/next-suite/pull/58) [`687aa75`](https://github.com/maurice-rm/next-suite/commit/687aa7597c61f3bfc788cff63f57284aace22f09) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Improve generated production projects:

  - Only declare and consume `NEXT_PUBLIC_APP_URL` in the production compose file,
    Dockerfile, and CD workflow when the app actually uses it (an API layer or
    Better-Auth), avoiding an unset build-arg warning otherwise.
  - Document the GitHub Actions deploy secrets and variables (`DEPLOY_SSH_KEY`,
    `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_PATH`) in the generated
    `DEPLOY.md`.
  - The generated `README.md` stack table now reflects the chosen features
    (styling, database, ORM, API, auth, email, deployment).

- [#55](https://github.com/maurice-rm/next-suite/pull/55) [`46a555c`](https://github.com/maurice-rm/next-suite/commit/46a555c075d304aa135e4119bac36632d97e8961) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Fix wizard back-navigation discarding the previous answer. Revisiting a step now
  restores the value you had chosen instead of resetting to its default, so
  pressing Enter after going back no longer silently overwrites it.

## 0.11.0

### Minor Changes

- [#50](https://github.com/maurice-rm/next-suite/pull/50) [`790f012`](https://github.com/maurice-rm/next-suite/commit/790f012a7cffe53bb4c5fdca5d600f6264f71041) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Add an optional OpenAPI/REST layer for oRPC projects. When enabled, the same procedures are additionally served as REST at `/api/v1`, with an OpenAPI spec at `/api/v1/spec.json` and (optionally) a browsable Scalar API-docs UI at `/api/v1` — the existing `/api/rpc` handler keeps working for the typed client. Opt in via the wizard or the `--openapi` / `--scalar` flags.

## 0.10.0

### Minor Changes

- [#47](https://github.com/maurice-rm/next-suite/pull/47) [`d4b5c35`](https://github.com/maurice-rm/next-suite/commit/d4b5c35740b78ab957a2e210312aea6be8802ac9) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Add optional production deployment and GitHub Actions CI/CD generation. The production dimension scaffolds a multi-stage Docker build (Next.js standalone), an nginx config (terminating TLS itself or serving HTTP behind an upstream proxy), a `docker-compose.prod.yml` for the app and database, and an entrypoint that waits for the database and applies migrations on start. The GitHub Actions dimension scaffolds a CI workflow (lint, type-check, format, build via a per-package-manager setup composite) and a CD workflow that builds and pushes the image to GHCR and deploys over SSH.

## 0.9.0

### Minor Changes

- [#45](https://github.com/maurice-rm/next-suite/pull/45) [`0d3c4d4`](https://github.com/maurice-rm/next-suite/commit/0d3c4d440a5c6f9a956c27be6179617be15a226e) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Generate the Resend email layer: client + EMAIL_FROM under src/lib/email, RESEND_API_KEY/EMAIL_FROM in the validated env chain, and an --email flag for --yes mode.

## 0.8.0

### Minor Changes

- [#43](https://github.com/maurice-rm/next-suite/pull/43) [`0c8d63d`](https://github.com/maurice-rm/next-suite/commit/0c8d63d881fb237d58bddbbd3ec7dd5fa621ce16) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Base UI is now the default shadcn base (following shadcn's July 2026 default change); Radix stays selectable via the wizard and --shadcn-base radix.

## 0.7.0

### Minor Changes

- [#41](https://github.com/maurice-rm/next-suite/pull/41) [`6bdbdc3`](https://github.com/maurice-rm/next-suite/commit/6bdbdc3eba22d8d19e56248eaa8d69caa4427831) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Generate a headless Better-Auth setup: email+password with the matching Drizzle/Prisma adapter and frozen schema tables, /api/auth route handler, typed getSession, session in the tRPC/oRPC context with protectedProcedure, and an --auth flag (requires --database) for --yes mode.

## 0.6.0

### Minor Changes

- [#39](https://github.com/maurice-rm/next-suite/pull/39) [`157de01`](https://github.com/maurice-rm/next-suite/commit/157de01c8aa91b6c831378f3d45bd1e8f10a6310) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Generate the API layer: tRPC or oRPC with end-to-end TanStack Query integration (typed procedures, RSC prefetch + hydration, health example, NEXT_PUBLIC_APP_URL env wiring) and an --api flag for --yes mode.

## 0.5.0

### Minor Changes

- [#37](https://github.com/maurice-rm/next-suite/pull/37) [`d6ab082`](https://github.com/maurice-rm/next-suite/commit/d6ab082905a6f1077eec69af9029696d67ec1dfa) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Generate the database layer: a dockerized local Postgres/MySQL (docker-compose.yml, driven by POSTGRES__/MYSQL__ variables in .env), a complete Drizzle or Prisma 7 setup with db:* scripts, and --database/--orm flags for --yes mode.

- [#37](https://github.com/maurice-rm/next-suite/pull/37) [`d6ab082`](https://github.com/maurice-rm/next-suite/commit/d6ab082905a6f1077eec69af9029696d67ec1dfa) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Generated projects ship a typed env module (`@/env` via @t3-oss/env-nextjs + zod), validated at startup; features contribute their variables to the schema.

## 0.4.0

### Minor Changes

- [#21](https://github.com/maurice-rm/next-suite/pull/21) [`81e08e3`](https://github.com/maurice-rm/next-suite/commit/81e08e3faa45defe6ec289414141fd5af79e621f) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Add a wizard step for an nginx reverse proxy in Docker: ask whether to set one up, and if so whether it is standalone (terminates TLS and manages certificates) or sits behind an upstream reverse proxy (serves HTTP). Configuration only — generation of the Docker/nginx files lands in a later release.

## 0.3.1

### Patch Changes

- [#20](https://github.com/maurice-rm/next-suite/pull/20) [`192f36d`](https://github.com/maurice-rm/next-suite/commit/192f36d6d91c74967fa59cfe0b2c485f9930979b) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Only prompt for authentication when a database is selected — Better-Auth needs one to persist users and sessions.

## 0.3.0

### Minor Changes

- [#17](https://github.com/maurice-rm/next-suite/pull/17) [`e407f38`](https://github.com/maurice-rm/next-suite/commit/e407f3812c6fb18d261cc6554be7b3890966c242) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Redesign the post-scaffold summary into a branded panel: the project name, the selected stack (read from the config, each label resolved via `options.ts`), the next-step commands, and a docs link. The stack mirrors every wizard selection and grows automatically as options are added.

## 0.2.0

### Minor Changes

- [#3](https://github.com/maurice-rm/next-suite/pull/3) [`227f765`](https://github.com/maurice-rm/next-suite/commit/227f76517622c38708c238849342f68231b975e8) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Add a non-interactive `--yes` mode. Passing `--yes` (with flags like `--pm`, `--tailwind`, `--shadcn`, `--no-git`, `--no-install`) skips the wizard and scaffolds straight from the flags plus sensible defaults — scriptable and CI-friendly.

- [#2](https://github.com/maurice-rm/next-suite/pull/2) [`ca937ad`](https://github.com/maurice-rm/next-suite/commit/ca937ad2bc63f40cdedb62a78f99335f83f35378) Thanks [@maurice-rm](https://github.com/maurice-rm)! - Add a Tailwind CSS feature. Choosing Tailwind — or shadcn/ui, which now works too — scaffolds a Tailwind v4 setup (`@tailwindcss/postcss`, `@import "tailwindcss"`, and `prettier-plugin-tailwindcss`).

  The generated base is also slimmer: a blank starter page, an empty `globals.css`, and no demo `not-found` page. And the post-generation step now sorts imports in addition to formatting.

## 0.1.0

Initial release — an interactive CLI that scaffolds a Next.js project.

- Interactive wizard → a fully-resolved project configuration
- Package managers: npm, pnpm, yarn, bun
- Base Next.js scaffold (App Router + TypeScript, ESLint, Prettier)
- Post-generation pipeline: git init → install → format → initial commit
- CI + Changesets-based release pipeline
