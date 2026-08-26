# Build from the monorepo root so pnpm workspace dependencies resolve exactly as in CI.
FROM node:26.7.0-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019 AS builder

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
# pnpm-lock.yaml references patched deps: the patch files must exist at
# install time or `pnpm install --frozen-lockfile` fails with ENOENT.
COPY patches/ patches/
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
    # The root workspace declares patchedDependencies (kafkajs, a core-api
    # dependency) that are outside the CRM deploy subtree; `pnpm deploy`
    # validates them strictly and aborts with ERR_PNPM_UNUSED_PATCH. Strip the
    # unused patch declaration for this builder-scoped deploy only.
    node -e "const fs = require('node:fs'); const f = 'package.json'; const pkg = JSON.parse(fs.readFileSync(f, 'utf8')); delete pkg.pnpm.patchedDependencies; fs.writeFileSync(f, JSON.stringify(pkg, null, 2));" && \
    pnpm --filter @plexica/plugin-crm deploy --legacy --prod /app

FROM node:26.7.0-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019

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
