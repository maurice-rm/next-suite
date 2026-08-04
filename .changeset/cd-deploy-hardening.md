---
"create-next-suite": patch
---

Fix the generated CD deploy step, which could break a repository outright and
left no way back from a bad release.

The image was pushed under a lowercased name — `docker/metadata-action`
lowercases it — but pulled with the repository's original spelling. Any owner or
repository containing a capital letter built and pushed green, then failed the
deploy with `repository name must be lowercase`. The name is now folded on both
sides.

A rollout that never becomes healthy no longer takes the site with it. The step
records the running image, waits for health with `up -d --wait`, and on failure
puts the previous image back and brings the stack up again — then still exits
non-zero, so the run goes red. Previously the old container was already gone by
the time the new one failed.

`docker image prune -f` ran daemon-wide after every deploy. The image it deleted
first was the one the deploy could have rolled back to — freshly untagged by the
pull — and on a host with several provisioned projects it took their images too.
It is now limited to images unused for a week.

Appending `DOCKER_IMAGE` to a `.env` without a trailing newline glued it onto the
last line, silently corrupting whatever it held — `BETTER_AUTH_SECRET` in a
default project. The file gets its newline first. `provision`-written files were
never affected; hand-written ones, which `DEPLOY.md` asks for, were.

The GHCR token was interpolated into the remote command line, so it sat in
`/proc/<pid>/cmdline` for the length of the deploy, readable by any local user.
It now travels on stdin, and the session logs out afterwards.

Also: `rsync` is documented as a server requirement. The deploy has always
needed it on both ends, and nothing said so — preflight passes without it and
the first deploy is what fails.
