---
"create-next-suite": patch
---

`next-suite update` and `next-suite add` take `--trust <pattern>`, which trusts matching sources for this run only and stores nothing, as `create-next-suite --trust` does; an update passes the patterns on to the version of create-next-suite that generates the old output. The error for an untrusted plugin in a run without a terminal recommends `--trust` only to a command that takes it.
