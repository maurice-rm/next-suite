---
"create-next-suite": patch
---

`next-suite provision` checks DNS before it replaces the nginx config, so a lookup that fails hard no longer leaves the previous site switched off.
