---
"create-next-suite": patch
---

`next-suite provision` changes the project directory's owner and mode through a working directory bound to the checked path, closing the window in which a swapped-in symlink could redirect them.
