---
"create-next-suite": patch
---

A failed migration no longer takes the site down.

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
