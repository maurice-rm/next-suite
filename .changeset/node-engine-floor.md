---
"create-next-suite": minor
---

Move to the Node 24 LTS line: the CLI and every generated project now require Node >= 24, with `.nvmrc`, the production Dockerfile, and the generated CI workflows updated to match.

Node 22 entered maintenance in October 2025 and reaches end of life in April 2027, so scaffolding new projects onto it would hand users a migration right after `create`. Node 24 is supported until April 2028. The previous floor was also below what the dependency trees actually require (`lint-staged` needs >= 22.22.1, `@commitlint/*` >= 22.12, `prisma` ^22.12), which made `npm install` print a wall of `EBADENGINE` warnings — both for the CLI and in every scaffolded project.
