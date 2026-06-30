FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json vite.config.ts manifest.json ./
COPY src/ ./src/

RUN npm run build

FROM node:22-alpine

RUN addgroup -S plexica && adduser -S plexica -G plexica

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/manifest.json ./

RUN npm install --production

USER plexica

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/_plexica/health || exit 1

CMD ["node", "dist/index.js"]
