---
"create-next-suite": patch
---

`next-suite provision` and `deprovision` fail loudly where they used to guess: a DNS lookup that fails for any reason other than a missing or temporarily unreachable record, an unreadable `next-suite.json` or config, and a malformed `/srv/ports.json` now stop with a message instead of being treated as absent; error messages are full sentences.
