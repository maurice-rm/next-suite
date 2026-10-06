---
"create-next-suite": patch
---

`next-suite` creates its SSH control-socket directory with an unguessable name, so another local user cannot pre-create it to intercept the multiplexed connection.
