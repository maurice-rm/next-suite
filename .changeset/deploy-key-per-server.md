---
"create-next-suite": minor
---

`next-suite provision` keeps one deploy key per server and project (`~/.config/next-suite/keys/<host>/<name>`) instead of one per project name, so two same-named projects on different servers never share a key that opens both; `authorized_keys` now holds exactly the current key for the project. Keys from earlier versions at `keys/<name>` are no longer read — the next run mints a per-server key. Re-run `provision` for every project that shared a name with one on another server to revoke the old shared key, then delete `keys/<name>`; with `--skip-github`, store the newly printed key as `DEPLOY_SSH_KEY` yourself.
