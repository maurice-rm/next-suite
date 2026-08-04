---
---

Dev tooling only (no change to the published CLI's behavior): add a `deps:check`
script that compares the pinned `VERSIONS` against the npm `latest` tag, and drop
the CI badge that can't render while the repo is private.
