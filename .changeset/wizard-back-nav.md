---
"create-next-suite": patch
---

Fix wizard back-navigation discarding the previous answer. Revisiting a step now
restores the value you had chosen instead of resetting to its default, so
pressing Enter after going back no longer silently overwrites it.
