---
"create-next-suite": minor
---

Give template values one shape: an ordered map is a list of `{ key, value }` entries, or `{ key, values }` where the value is a list (`scripts`, `env.server`, `env.client`, `csp`, `lintStaged`, `tsconfig.paths`, `container.env`), and a plain list is an array (`agents`, `readme`, `lintIgnores`). `tsconfig.paths` lists its targets instead of a JSON string, `project.packageManagerVersion` is absent without a package manager plugin, and values only the core reads, such as the dependencies, are no longer in the template context. The templates documentation lists every value with its shape.
