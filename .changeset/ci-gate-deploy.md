---
"create-next-suite": patch
---

Gate the generated `CD` workflow on `CI`. Both workflows triggered on a push to
`main` and ran in parallel, so a failing lint, type-check or build never stopped
the image from being built, pushed and deployed. `CI` is now a reusable workflow
(`workflow_call`) that `CD` runs as its first job, with the image job on
`needs: ci`; the deploy job already fell out through `!failure()`. A manual
`workflow_dispatch` run still skips `CI`, since it redeploys an already-published
tag.

`CI` drops its own `push: main` trigger whenever `CD` gates on it — otherwise the
two runs collide in the `ci-${{ github.ref }}` concurrency group and cancel each
other, which would have blocked the deploy. Pull requests are unaffected.

The `CI` build step now receives the repository variables (`env: ${{ vars }}`),
so `NEXT_PUBLIC_APP_URL` reaches `next build` the same way `CD` bakes it into the
image — without it the build died in `metadataBase: new URL(...)` while
collecting page data. `SKIP_ENV_VALIDATION` moved up to the job so the step-level
`vars` map cannot displace it, and the `NEXT_PUBLIC_APP_URL` guard from `CD` now
also runs before the `CI` build, where the variable is required.
