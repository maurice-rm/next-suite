---
"create-next-suite": patch
---

Give `deprovision` a teardown command you can actually run.

The run already said that containers and volumes survive the teardown, but the
same run deletes `/srv/www/<project>` and with it the compose file you would
have needed to act on that. The note now names the Compose project instead —
`docker compose -p <project> down -v` finds the containers, network and volumes
by their labels and needs no compose file. Compose strips characters it
disallows when it derives the project name from the directory, so the note drops
the dot a project name may carry.
