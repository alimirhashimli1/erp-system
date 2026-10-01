# syntax=docker/dockerfile:1.7
# Build context: repository root (see docker-compose.yml).

ARG NODE_IMAGE=node:24.11.1-bookworm-slim

# ---------- build: full toolchain, compiles shared + api ----------
FROM ${NODE_IMAGE} AS build
ENV HUSKY=0 PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# openssl: required by Prisma's schema engine (migrations), not by the runtime image.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@12.4.2
WORKDIR /repo

# Manifests first so the dependency layer is cached until a lockfile/manifest changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@procurestack/api..."

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @procurestack/shared build \
    && pnpm --filter @procurestack/api build \
    && find apps/api/dist -name "*.map" -delete

# Self-contained production bundle: dist + prod-only node_modules (no dev deps, no src).
# --no-optional: @prisma/client's optional peer would otherwise drag the whole Prisma CLI
# (and its advisories) into the image; the generated client only needs its runtime.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @procurestack/api deploy --prod --no-optional /out

# ---------- migrator: one-shot job (migrate deploy + seed), keeps dev tools out of runtime ----------
FROM build AS migrator
WORKDIR /repo/apps/api
USER node
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm exec tsx prisma/seed.ts"]

# ---------- runtime: minimal, non-root ----------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
