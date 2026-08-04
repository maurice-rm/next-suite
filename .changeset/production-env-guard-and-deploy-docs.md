---
"create-next-suite": patch
---

Improve generated production projects:

- Only declare and consume `NEXT_PUBLIC_APP_URL` in the production compose file,
  Dockerfile, and CD workflow when the app actually uses it (an API layer or
  Better-Auth), avoiding an unset build-arg warning otherwise.
- Document the GitHub Actions deploy secrets and variables (`DEPLOY_SSH_KEY`,
  `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_PATH`) in the generated
  `DEPLOY.md`.
- The generated `README.md` stack table now reflects the chosen features
  (styling, database, ORM, API, auth, email, deployment).
