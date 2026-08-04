---
"create-next-suite": patch
---

Lock down the per-project nginx logs, and correct the last documented claims
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
