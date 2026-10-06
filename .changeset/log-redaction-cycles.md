---
"create-next-suite": patch
---

Keep the generated log redaction from throwing on self-referencing error fields and from flattening dates and buffers; it now walks only the serializer's own output.
