---
"create-next-suite": minor
---

Load plugins from npm (integrity checked, no install scripts), GitHub, GitLab, any Git repository, tarball URLs and registry short names, cached per source and resolved commit or version; next-suite.json records what each source resolved to. Code from an untrusted source runs only after a question in the terminal, with `--trust <pattern>`, or when the user configuration trusts it; "always trust" remembers the source. A dry run needs the same trust, since it runs plugin code too.
