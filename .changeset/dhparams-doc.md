---
"create-next-suite": patch
---

Clarify the `ssl-dhparams.pem` prerequisite: it ships with certbot's nginx plugin, so generating one by hand is only the fallback. The README table and the preflight message said "generate this", which invited overwriting certbot's own file for no benefit — TLS 1.3 does not use `ssl_dhparam` at all.
