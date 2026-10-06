---
"create-next-suite": patch
---

`next-suite provision` hides the app's own copies of the security headers it sets, so each header reaches the browser once and the cross-origin policies keep parsing.
