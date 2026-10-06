---
"create-next-suite": minor
---

`next-suite provision` keeps one deploy key per server and project (`~/.config/next-suite/keys/<host>/<name>`) instead of one per project name, so two same-named projects on different servers never share a key that opens both; `authorized_keys` now holds exactly the current key for the project. Keys from earlier versions at `keys/<name>` are no longer read — the next run mints a per-server key.
