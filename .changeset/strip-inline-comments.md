---
"create-next-suite": patch
---

Remove inline comments from the CLI sources and from the scaffolded output.

Comments now sit above declarations or not at all — trailing labels and
step-body comments are gone from the templates, the CD workflow and the
production entrypoint, so generated projects start out clean. ESLint
directives and the placeholder hints that tell you where to add your own
schema, models and `NEXT_PUBLIC_*` variables are untouched.
