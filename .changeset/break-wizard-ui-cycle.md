---
---

Internal refactor only: move `BRAND` and `SYMBOLS` into a new leaf module
`src/branding.ts` and relocate `sectionBadge` to `src/wizard.ts`, its only
consumer. This removes the `wizard` <-> `ui` import cycle and the one place
that reached past the UI layer's public surface into `@/ui/style`. Rendered
output is unchanged, so no release is needed.
