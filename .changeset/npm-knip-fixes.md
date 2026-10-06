---
"create-next-suite": patch
---

Let npm installs pass the strict install-script check when drizzle-kit pulls in `fsevents` (denied, as pnpm skips it), and keep Knip from flagging `@prisma/client`, which only the generated Prisma client imports.
