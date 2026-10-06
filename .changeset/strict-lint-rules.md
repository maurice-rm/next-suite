---
"create-next-suite": minor
---

Tighten the generated lint setup: boolean variables and parameters need a predicate prefix (`is`, `has`, `can`, …), numbers carry a name instead of appearing as magic values, the complexity cap drops to 15, and `lint` and `check` fail on warnings. The templates follow the new rules, and the health route's `@/env` import comes first, so a project scaffolded without the fix step lints clean there too.
