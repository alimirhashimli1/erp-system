# syntax=docker/dockerfile:1.7
# Build context: repository root (see docker-compose.yml).

# ---------- build: compile shared + Vite bundle ----------
FROM node:24.11.1-bookworm-slim AS build
ENV HUSKY=0 PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN npm install -g pnpm@12.4.2
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@procurestack/web..."

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @procurestack/shared build && pnpm --filter @procurestack/web build

# ---------- runtime: static files + reverse proxy, non-root nginx on :8080 ----------
FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime
COPY apps/web/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY apps/web/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
