---
"create-next-suite": patch
---

Close the quieter failure modes in `provision` and `deprovision`.

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
