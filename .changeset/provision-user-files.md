---
"create-next-suite": patch
---

`next-suite provision` creates `~/.ssh` and reads and writes the server `.env` as the deploy user too, so no root step follows a symlink the user could plant in their home.
