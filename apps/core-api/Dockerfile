# Base stage - install dependencies
FROM node:25-alpine AS base
RUN corepack enable pnpm
WORKDIR /app

# Dependencies stage - install production dependencies
FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/core-api/package.json ./apps/core-api/
COPY packages/database/package.json ./packages/database/
RUN pnpm install --frozen-lockfile --prod

# Build stage - build the application
FROM base AS build
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV DATABASE_URL=$DATABASE_URL
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/core-api/package.json ./apps/core-api/
COPY packages/database/package.json ./packages/database/
RUN pnpm install --frozen-lockfile

COPY apps/core-api ./apps/core-api
COPY packages/database ./packages/database
COPY turbo.json ./
COPY tsconfig.json ./

# Generate Prisma Client
RUN pnpm --filter @plexica/database db:generate

# Build the application
RUN pnpm --filter @plexica/core-api build

# Production stage - run the application
FROM node:25-alpine AS production
RUN corepack enable pnpm

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy package files
COPY package.json pnpm-workspace.yaml ./
COPY apps/core-api/package.json ./apps/core-api/
COPY packages/database/package.json ./packages/database/

# Copy production dependencies from dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy built application
COPY --from=build /app/apps/core-api/dist ./apps/core-api/dist
COPY --from=build /app/packages/database/prisma ./packages/database/prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "apps/core-api/dist/index.js"]
