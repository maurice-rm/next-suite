---
"create-next-suite": patch
---

Fix four `provision` failure modes that a re-run could not heal.

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
