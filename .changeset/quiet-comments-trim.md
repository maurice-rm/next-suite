---
"create-next-suite": patch
---

Drop explanatory and placeholder comments from the generated code and the
Dockerfile; the health route validates the environment through a side-effect
import instead of `void env`.
