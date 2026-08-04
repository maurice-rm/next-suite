---
"create-next-suite": patch
---

Provisioning no longer depends on host-wide nginx snippets, and preflight checks
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
