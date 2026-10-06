---
"create-next-suite": patch
---

`next-suite provision` refuses to set up a project directory that is a symlink, so nothing with write access to `/srv/www` can redirect its ownership change.
