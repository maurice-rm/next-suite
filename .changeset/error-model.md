---
"create-next-suite": minor
---

Give generated projects one error model: `AppError` with `defineErrors`, one mapping per API on the base procedure, field errors for forms, English client messages and error toasts. `/api/v1` error bodies now carry invalid-input details under `data` instead of `errors`.
