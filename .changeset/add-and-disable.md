---
"create-next-suite": minor
---

`next-suite add <plugin>` adds a plugin to `next-suite.config.ts`, a built-in one by its name or any other by its path or address, with answers to its options as `--<option> <value>`, and `next-suite disable <plugin>` adds one to `disable` and drops its answers; both edit the config through its syntax tree, keeping its formatting and comments, and run `next-suite update`. When the update fails before it changed a file, the config is restored.
