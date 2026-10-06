---
"create-next-suite": patch
---

`next-suite provision` no longer regenerates — and overwrites — the persisted deploy key when reading it fails for any reason other than the key not existing; a key missing one half now stops the run with a message instead.
