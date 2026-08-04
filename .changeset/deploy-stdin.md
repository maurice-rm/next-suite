---
"create-next-suite": patch
---

Fix a deploy that stopped after the migration and still reported success.

The deploy script reaches the server on stdin (`bash -s` with a heredoc), and
`docker compose run` attaches stdin — so it consumed the rest of the script.
Everything after the migration, including `up -d --wait`, never ran, and the
step exited 0 because bash simply reached end of input. On a first deploy the
result was a project with only its database container running and a green
workflow. `-T` does not prevent this; the command now reads from `/dev/null`.
