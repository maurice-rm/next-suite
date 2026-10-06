---
"create-next-suite": patch
---

`next-suite provision` checks the project directory for a symlink before creating the user as well as right before changing its owner and mode, and changes the owner of the link itself if one appears in between.
