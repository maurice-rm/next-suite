---
"create-next-suite": patch
---

Tighten the generated nginx site block.

`proxy_buffering` is now on for `/_next/static/` and `/_next/image` and stays off
for the app. Off is right for the streaming SSR response, but on a static asset
it made nginx hold one upstream connection into Node for the whole download —
measured, ten throttled clients held eleven connections open where buffering
holds one.

`/_next/image` gets its own `limit_req` zone at 100 r/s instead of sharing the
app's 30 r/s. A page with a gallery issues image requests in a burst no page view
produces, so it used to throttle itself: measured on a live host, 150 parallel
image requests now all pass where the same load against the app is limited.

`server_tokens off` was only set on the TLS block, so the `:80` redirect and the
ACME bootstrap answered with `nginx/1.24.0 (Ubuntu)`. Setting it per block is the
only option here — from `conf.d` a http-level directive would be duplicated by
the second project.

**Behaviour change:** HSTS no longer carries `includeSubDomains`, in either
deployment mode. The proxied block derived it from the label count, which cannot
tell an apex from a subdomain — `example.co.uk` and `bbc.co.uk` are apexes with
three labels and got it — and the standalone template hard-coded it while
shipping `example.com`, an apex, as its placeholder. Guessing wrong commits every
subdomain of the zone to HTTPS for two years with no server-side way back, so the
header now ships without it in both and is opted into by hand.

Two smaller corrections in the same area: `DEPLOY.md` recommended setting
`X-Accel-Buffering: no` on SSE responses, which does nothing — nginx consumes
`X-Accel-*` instead of forwarding it, so it never reaches the hop that would act
on it, and the location serving the app already runs unbuffered. And
`prod.sh restart` now waits for health like `prod.sh up` does, instead of
reporting success for a container that comes back up and immediately dies.
