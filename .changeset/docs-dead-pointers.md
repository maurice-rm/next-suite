---
"create-next-suite": patch
---

Fix documentation that pointed nowhere, and close the gaps a first-time user
falls into on a fresh server.

Three preflight failure messages told the reader to see "'Host setup', step 1 /
4 / 5 in the CLI README". No such section existed in any file — and a test
asserted the strings, so the dead pointers stayed green. They now name the real
sections in `docs/server-requirements.md`, and the test resolves each reference
against that file's actual headings instead of matching the text.

`provision` needs `ssh`, `ssh-keygen` and an authenticated `gh`; none of them
appeared in either requirements list. `ssh-keygen` was not mentioned in the
published documentation at all.

Provisioning now opens with the DNS record, which was only ever mentioned as a
warning after the fact — a record that does not resolve yet costs a Let's
Encrypt rate-limit slot.

The generated `DEPLOY.md` for `standalone` now covers what has to happen before
the first deploy: the four `# TODO` placeholders in `nginx/nginx.conf`, the
`includeSubDomains` default that is wrong for an apex domain, and the first
certificate — which cannot come from the webroot, because the nginx that would
serve the challenge is the one that will not start without the certificate.
`scripts/prod.sh bootstrap` is documented in both modes; it existed but appeared
in no published file.

`docs/architecture.md` described a `wizard.ts` ↔ `ui/` module cycle that was
removed some releases ago. It documented a layering violation that no longer
exists, in the file that teaches contributors the layering rules.

Also corrected: the README said the deploy user joins the `docker` group,
omitting `deploy` — the group that takes SSH tunneling away from the deploy key
— and called the two TLS helper files "not shipped by any package", which
contradicts the guide, the troubleshooting page and the preflight message.
