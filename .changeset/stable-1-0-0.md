---
"create-next-suite": major
---

`create-next-suite` 1.0.0 — the first stable release.

Everything the beta line shipped is in here; the entries below `1.0.0-beta.0`
in this changelog are the full record of how it got here. What changes with
this release is the promise, not the code: flags, wizard steps and the shape
of a generated project now follow semantic versioning. A breaking change to
any of them means a major release, so a pinned `create-next-suite@1` keeps
scaffolding the same way.

`next-suite provision` and `deprovision` stay marked beta. They rewrite a real
server over SSH, they are the youngest part of the package, and a stable
version number for the scaffolder is not a claim about them. Run `--dry-run`
first and read the warning in the README.
