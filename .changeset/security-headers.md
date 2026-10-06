---
"create-next-suite": minor
---

Set the security headers in `next.config.ts` on every route — a Content-Security-Policy following the Next.js guide, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy` and the cross-origin policies — so they apply in development and in both deployment modes, and validate the environment at build time by importing `src/env.ts` there. The standalone nginx no longer sets its own copies.
