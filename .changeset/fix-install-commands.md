---
"create-next-suite": patch
---

Fix the documented install/run commands, which were broken for real users: a
bare package name resolves to the semver range `*`, which excludes the
prerelease versions this beta publishes, so every scaffolder example now pins
`@latest`. `npx next-suite provision` also referenced a package that doesn't
exist — `next-suite` ships as the bin of `create-next-suite`, so the docs now
show installing it globally once (`npm i -g create-next-suite@latest`) before
running `next-suite provision`.
