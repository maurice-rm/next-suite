---
"create-next-suite": patch
---

Fixes from a full audit of the production stack against a local reproduction of
the real server (Ubuntu 24.04 host nginx 1.24 → sidecar → app).

- **The `:443` catch-all only closed the handshake, not the request.**
  `ssl_reject_handshake` stops an unknown SNI, but a client that presents a
  _valid_ SNI and then sends a foreign `Host:` header re-selects the virtual
  server after the handshake and lands in that same block. With no `return`
  there, nginx falls back to its compiled-in root — measured: `200 OK` with
  Ubuntu's "Welcome to nginx!" page. Standalone mode now answers `444`.
- **Standalone TLS accepted ciphers without forward secrecy.** The block set
  `ssl_protocols` but no `ssl_ciphers`, leaving nginx's built-in
  `HIGH:!aNULL:!MD5` — measured: `AES128-SHA`, `AES128-SHA256` and static-RSA
  `AES256-GCM-SHA384` all negotiated. It now pins the same Mozilla
  "intermediate" list certbot writes for the proxied host.
- **Rate limiting starved a normal page load.** One Next.js navigation pulls
  dozens of `/_next/static/` chunks, which spent the whole `burst=50` before a
  route was rendered — measured: 17 rejections in a 70-request burst. Immutable
  build output is now exempt, and a tripped limiter returns `429` rather than
  `503`.
- **`provision --staging` then `provision` kept the staging certificate.**
  `certbot certonly` leaves a lineage that is not due for renewal alone, so the
  documented two-step flow silently served an untrusted certificate. The
  existing certificate's issuer is now checked and a staging one is reissued
  with `--force-renewal`.
- **Preflight accepted an admin user that provision cannot use.** It passed a
  non-root user with passwordless sudo, but every remote step runs the bare
  command (`useradd`, `cat > /etc/nginx/…`, `certbot`) — the run failed midway.
  It now requires root and says why.
- **Preflight now requires a `:443` default server on the host.** `ssl_protocols`
  is not selectable per SNI; without a catch-all the alphabetically first
  project block becomes the default and nginx's stock `TLSv1 TLSv1.1 …` applies
  to every site on the box.
- **The development database published on `0.0.0.0`.** `docker-compose.yml` now
  binds `127.0.0.1`, matching the production stack.
