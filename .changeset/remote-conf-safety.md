---
"create-next-suite": patch
---

`next-suite provision` checks names read from an existing nginx config before it puts them into a shell command, and refuses a config containing the upload's heredoc terminator instead of cutting it short.
