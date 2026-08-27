# Build from the monorepo root so pnpm workspace dependencies resolve exactly as in CI.
FROM node:24.19.0-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS builder

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY examples/plugins/crm/package.json examples/plugins/crm/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/vite-plugin/package.json packages/vite-plugin/package.json
RUN pnpm install --frozen-lockfile --filter @plexica/plugin-crm... --filter @plexica/vite-plugin...

COPY examples/plugins/crm examples/plugins/crm
COPY packages/sdk packages/sdk
COPY packages/ui packages/ui
COPY packages/vite-plugin packages/vite-plugin
RUN pnpm --filter @plexica/sdk build && \
    pnpm --filter @plexica/plugin-crm build:backend && \
    pnpm --filter @plexica/plugin-crm deploy --legacy --prod /app

FROM node:24.19.0-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43

RUN addgroup -S plexica && adduser -S plexica -G plexica
WORKDIR /app
COPY --from=builder --chown=plexica:plexica /app ./
COPY --from=builder --chown=plexica:plexica /workspace/examples/plugins/crm/dist ./dist

USER plexica
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=6 \
  # 127.0.0.1, not localhost: localhost resolves to [::1] here while the
  # Node server listens on IPv4 only, so a localhost probe never connects.
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/_plexica/health || exit 1
CMD ["node", "dist/index.js"]
