---
"create-next-suite": patch
---

Bump the pinned `esbuild` to `^0.28.2`. The old `^0.27.3` range sits inside
GHSA advisory range `>= 0.27.3, < 0.28.1` and cannot reach 0.28 on its own.

`deps:check` now treats the minor as the breaking segment for `0.x` pins,
which is how `^` resolves them — it had been reporting `esbuild` as current.
