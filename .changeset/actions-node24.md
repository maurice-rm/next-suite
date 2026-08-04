---
"create-next-suite": patch
---

Bump the actions in the generated workflows onto their current majors, which
run on Node 24. GitHub is deprecating Node 20 and already forces these onto 24,
so every run of a generated project logged a deprecation warning naming
`actions/checkout`, `docker/build-push-action`, `docker/login-action`,
`docker/metadata-action` and `docker/setup-buildx-action`.

`actions/checkout` v4 → v7, `actions/setup-node` v4 → v7, `pnpm/action-setup`
v4 → v6, `docker/setup-buildx-action` v3 → v4, `docker/login-action` v3 → v4,
`docker/metadata-action` v5 → v6, `docker/build-push-action` v6 → v7.
`oven-sh/setup-bun@v2` already runs on Node 24 and stays.

Nothing in the templates uses an input the new majors dropped, and the explicit
`cache:` in the setup action keeps precedence over the automatic package-manager
caching `setup-node` v5 introduced. The majors require Actions runner v2.327.1,
which GitHub-hosted runners exceed.
