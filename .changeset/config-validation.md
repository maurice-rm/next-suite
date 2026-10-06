---
"create-next-suite": patch
---

`next-suite config` and the first-run prompt of `provision` validate the host and admin user by the same rules the config parser applies, always save the config with mode `0600`, and `next-suite config` lets you repair a saved file that no longer parses.
