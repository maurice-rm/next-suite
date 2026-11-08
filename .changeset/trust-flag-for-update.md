---
"create-next-suite": patch
---

`next-suite update`, `next-suite add` and `next-suite disable` take `--trust <pattern>`, which trusts matching sources for this run only and stores nothing, as `create-next-suite --trust` does; an update passes the patterns on to the version of create-next-suite that generates the old output.
