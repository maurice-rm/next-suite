---
"create-next-suite": minor
---

Handle errors and logging in generated server code as one system: mask internal error messages from tRPC clients, map `DomainError` kinds to API error codes in one middleware, answer OpenAPI errors as Problem Details, log unexpected errors at `error` (including Server Component and Server Action errors through `onRequestError`) and rejected requests and failed sign-ins at `warn` with the client IP, route Better-Auth's logs and the Drizzle migration script through pino, pass the Better-Auth secret from `src/env.ts`, mark every module holding a server secret `server-only`, and redact access, refresh and ID tokens, secrets and the `authorization` header.
