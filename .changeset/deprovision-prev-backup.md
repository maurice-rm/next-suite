---
"create-next-suite": patch
---

Let `deprovision` take the nginx backup with the config it belongs to.

Every provision run rotates the previous vhost to `<project>.conf.prev` so an
interrupted certbot step cannot leave the host without a copy. The teardown
removed `<project>.conf` but never the backup, so each deprovisioned project
left one behind for good. nginx includes `*.conf` only and never loaded them,
but they accumulated in `conf.d` with the project's domain still inside.
