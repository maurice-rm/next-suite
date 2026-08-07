## What this changes

<!-- What the change does and why. If it fixes an issue, write "Closes #123". -->

## How it was verified

<!-- What you actually ran, and what it printed. "Tests pass" says less than the summary line. -->

---

- [ ] `pnpm check-types`, `pnpm build`, `pnpm test` and `pnpm lint` are green
- [ ] A changeset is included, or the change touches no package (`pnpm changeset`)
- [ ] Documentation under `docs/` matches, if this changes flags, wizard steps, generated output, or provisioning

<!--
The CI gate runs `changeset status` and fails a package change that arrives without one.
See CONTRIBUTING.md for the release mechanics.
-->
