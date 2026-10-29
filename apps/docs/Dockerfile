# Build from the repository root: docker build -f apps/docs/Dockerfile .
ARG NODE_VERSION=24-slim

FROM node:${NODE_VERSION} AS builder

ENV TURBO_TELEMETRY_DISABLED=1

WORKDIR /app
RUN corepack enable pnpm

COPY . .
RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm \
  pnpm install --frozen-lockfile --store-dir /var/cache/pnpm --filter @next-suite/docs...
RUN pnpm turbo run build --filter=@next-suite/docs

FROM nginxinc/nginx-unprivileged:1.29-alpine AS runner

COPY apps/docs/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/docs/out /usr/share/nginx/html
