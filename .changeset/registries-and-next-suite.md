---
"create-next-suite": minor
---

Add registries and the `next-suite` command. A registry is a directory, repository or tarball with a `registry.json` listing its plugins; `--plugin @acme/mail` loads a plugin of the registry `@acme`. `next-suite registry add|list|remove` manages registries (`--trust` trusts all of a registry's plugins), `next-suite trust add|list|remove` the trusted source patterns, and `next-suite plugin validate <directory>` checks a plugin and its templates. The JSON schema of `registry.json` ships as `create-next-suite/schemas/registry.json`.
