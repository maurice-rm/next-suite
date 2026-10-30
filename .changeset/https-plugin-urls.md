---
"create-next-suite": patch
---

Refuse a plugin or registry address over plain http, such as `http://host/mail.tgz` or `git+http://host/repo.git`, before anything is downloaded; such addresses must use https.
