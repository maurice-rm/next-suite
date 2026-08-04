---
"create-next-suite": patch
---

Guard the database credentials in `docker-compose.prod.yml` the same way
`APP_PORT` already was. Without them Postgres started with an empty user and
password and failed inside the image with a message that pointed nowhere near
the `.env`; compose now refuses to interpolate and names the missing key.
