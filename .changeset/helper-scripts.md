---
"create-next-suite": minor
---

Generate shell helper scripts in scaffolded projects. `scripts/setup.sh` takes a
fresh clone to a running app (creates `.env` with generated secrets, installs
dependencies, optionally starts the database). Production projects also get
`scripts/prod.sh` (bootstrap `.env` + Docker Compose control) and a `DEPLOY.md`
server checklist; the auto-deploy now ships the scripts and fails clearly when no
`.env` exists on the server.
