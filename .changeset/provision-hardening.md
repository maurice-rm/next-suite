---
"create-next-suite": patch
---

`next-suite provision` writes `authorized_keys` as the deploy user (a new `runuser` preflight check), never appends a key that is already there, checks the existing nginx config before changing anything, and explains a pre-1.4 key file that blocks the new per-server key directory.
