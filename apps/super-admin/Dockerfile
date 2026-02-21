# Multi-stage Dockerfile for Plexica Super Admin App

# Stage 1: Base - Setup base environment
FROM node:25-alpine AS base
WORKDIR /app
RUN corepack enable pnpm

# Stage 2: Dependencies - Install dependencies
FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/super-admin/package.json ./apps/super-admin/
RUN pnpm install --frozen-lockfile

# Stage 3: Build - Build the application
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/super-admin/package.json ./apps/super-admin/
RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/super-admin ./apps/super-admin
COPY turbo.json ./

# Build arguments for environment variables
ARG VITE_API_URL=http://localhost:3000
ARG VITE_APP_NAME="Plexica Super Admin"

# Set build-time environment variables
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_NAME=$VITE_APP_NAME

# Build the application
RUN cd apps/super-admin && pnpm build

# Stage 4: Production - Serve with nginx
FROM nginx:alpine AS production

# Install curl for health checks
RUN apk add --no-cache curl

# Copy custom nginx configuration
COPY apps/super-admin/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from build stage
COPY --from=build /app/apps/super-admin/dist /usr/share/nginx/html

# Create nginx user and set permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
