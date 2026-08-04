---
"create-next-suite": patch
---

Harden the generated proxy chain, from a review of all three nginx layers against the official docs.

- **`X-Forwarded-For` is no longer client-controlled.** The internet-facing hops set `$remote_addr` instead of `$proxy_add_x_forwarded_for`, which appends to whatever the client sent — correct for a proxy behind a trusted one, an injection point at the edge. The proxied sidecar's pass-through is right once the host is the sole authority.
- **Deploys now recreate the nginx sidecar** (`depends_on.app.restart`). Without it the sidecar kept the upstream IP it resolved at startup — a permanent 502 whenever the app container came back on a different address — and never loaded the `nginx.conf` the pipeline had just shipped.
- **`APP_PORT` is required rather than defaulted.** It was missing from `DEPLOY.md`'s key list, so following the documented manual first deploy bound the `:-8080` fallback: a port collision with whatever else uses 8080, and a 502 either way, since the host block points at the assigned port. Compose now aborts with a message naming the file to fix.
- **`serverActions.bodySizeLimit` matches `client_max_body_size`.** nginx accepted 25 MB while Server Actions still capped at the 1 MB default, so large uploads were transferred in full and then rejected inside the app instead of getting a 413 at the edge.
- **`provision` no longer takes a live site down to renew a certificate.** A config already serving the target domain is left in place (both renderings serve the ACME webroot), and if certbot fails after a domain change the previous vhost is restored — the bootstrap block is valid nginx, so the existing revert-on-`nginx -t`-failure never caught this.
- **Standalone mode rejects requests that are not for this site.** Its server block was the default for both sockets, so a bare-IP request, an unknown SNI, or a foreign domain pointed at the host was answered with this site's certificate and an attacker-chosen `Host` header — which Next.js treats as authoritative for absolute URLs. A catch-all now closes those connections; the ACME challenge still resolves, since it carries the real domain.
- **`DEPLOY.md`** documents `APP_PORT`, and that standalone mode needs the certbot deploy hook to signal the container: a host-level `systemctl reload nginx` never reaches a sidecar that terminates TLS itself, so renewed certificates were not served.

A second pass audited every directive in the generated nginx config against its own page on nginx.org:

- **The nginx container ran a single worker.** The image sets `worker_processes auto`, but the config bind-mount replaces the file that carries it, leaving nginx's built-in default of `1`. Measured: 1 worker before, 16 after on a 16-core host.
- **Access logs carried no client identity.** Same cause — the mount removed the image's `log_format main`, so logging fell back to the built-in `combined`, which has no `$http_x_forwarded_for` field. Behind the host nginx every line recorded the proxy's address.
- **gzip was dead configuration and is gone**, in both the sidecar and the host block. The Next.js server compresses its own responses by default, and nginx does not re-compress an already-compressed upstream response. This also retires a `gzip_types` list that was missing `text/x-component` (the content type of every RSC navigation and Server Action result) while pointlessly listing the already-compressed `font/woff` and `font/woff2`.
- **Standalone mode could crash-loop on a fresh host.** It included `/etc/letsencrypt/options-ssl-nginx.conf`, a file only certbot's nginx _installer_ creates — and a non-glob `include` of a missing file aborts config load, which with `restart: always` means an endless restart cycle. The TLS settings now live in the config itself, alongside a session cache (nginx's default is `none`, i.e. no resumption at all).
- **Uploads were spooled to disk twice** in proxied mode, once per hop; the sidecar now sets `proxy_request_buffering off` and leaves the host to absorb slow uploaders.
- **Standalone mode gained request rate limiting** (20 r/s, burst 50), the one item on the Next.js self-hosting docs' list of reverse-proxy responsibilities that was unimplemented where the sidecar is the sole edge.
