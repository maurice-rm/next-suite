---
"create-next-suite": patch
---

Run the fix step after shadcn/ui set up the project with `--no-install` too — shadcn installs the dependencies itself, so the project no longer starts with unsorted imports and unformatted files.
