# Changesets

Every pull request that changes what `create-next-suite` ships adds a changeset:

```bash
pnpm changeset
```

That includes a change to the manifest or the files of a built-in plugin or of the base project,
since it changes the projects create-next-suite generates. A change to the plugin contract names
the new contract version in its changeset.

The changeset names the bump (patch, minor, major) and one line for the changelog. On `main`,
the release workflow collects the changesets into a "Version Packages" pull request; merging it
publishes the new version after approval in the `npm` environment.
