---
"create-next-suite": patch
---

Tidy the generated server code: the API endpoints are named once and shared between route handler and client, the tRPC client's server-side requests to the app's own API time out after ten seconds, Resend is created on first use through `getResend()` instead of a proxy, the health procedures drop a needless `as const`, and the Server Actions body limit is raised only in projects without an API layer.
