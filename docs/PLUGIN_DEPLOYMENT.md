# Plugin Deployment Guide

**Last Updated**: February 16, 2026  
**Status**: Active  
**Owner**: Engineering Team  
**Spec Reference**: [`.forge/specs/004-plugin-system/spec.md`](../.forge/specs/004-plugin-system/spec.md)

---

## ⚠️ Implementation Status

| Component                    | Status      | Notes                                                 |
| ---------------------------- | ----------- | ----------------------------------------------------- |
| Plugin Manifest Schema       | ✅ Complete | Full schema with runtime, resources, health endpoints |
| Lifecycle State Machine      | ✅ Complete | REGISTERED → INSTALLING → INSTALLED → ACTIVE          |
| Service Registry             | ✅ Complete | Plugin-to-plugin communication via service discovery  |
| Health Check Endpoints       | ⚠️ Partial  | `/health`, `/ready` routes defined but not in gateway |
| Container Deployment         | ❌ Manual   | No orchestration automation (Docker/K8s)              |
| Resource Limits (CPU/Memory) | ❌ Planned  | Not yet enforced                                      |
| Hot-Swap Updates             | ❌ Planned  | Manual stop/start required                            |
| Rollback on Failure          | ❌ Planned  | Manual intervention required                          |

**Current Deployment Method**: ⚠️ **Manual** - Plugins must be deployed manually using Docker Compose or Kubernetes manifests. Automated orchestration planned for Phase 2.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Plugin Manifest](#plugin-manifest)
4. [Health Check Endpoints](#health-check-endpoints)
5. [Manual Deployment Methods](#manual-deployment-methods)
   - [Docker Compose Deployment](#docker-compose-deployment)
   - [Kubernetes Deployment](#kubernetes-deployment)
6. [Resource Limits](#resource-limits)
7. [Network Configuration](#network-configuration)
8. [Lifecycle States](#lifecycle-states)
9. [Monitoring & Observability](#monitoring--observability)
10. [Troubleshooting](#troubleshooting)
11. [Planned Automation](#planned-automation)
12. [FAQ](#faq)

---

## Overview

Plexica plugins run as **isolated containers** with process separation from the core platform. Each plugin:

- Exposes standardized REST APIs at `/api/plugins/{pluginId}/`
- Implements health check endpoints (`/health/live`, `/health/ready`)
- Registers with the service discovery registry
- Communicates via events (Redpanda) or direct REST calls
- Manages its own data schema within tenant databases

**Key Principles**:

- **Process Isolation**: Plugin failures cannot crash the core platform (Constitution Article 1.2.4)
- **Resource Limits**: CPU and memory limits enforced per container (planned)
- **Zero Downtime**: Plugins can be deployed and updated without platform downtime (planned)
- **Standardized APIs**: All plugins follow the same API contracts

---

## Architecture

### Plugin Deployment Model

```mermaid
graph TB
    subgraph "Core Platform"
        A[API Gateway :4000]
        B[Plugin Registry Service]
        C[Service Discovery]
        D[Event Bus - Redpanda]
    end

    subgraph "Plugin Container 1"
        E1[Plugin Runtime]
        F1[Health Endpoints]
        G1[REST API]
    end

    subgraph "Plugin Container 2"
        E2[Plugin Runtime]
        F2[Health Endpoints]
        G2[REST API]
    end

    A -->|Proxy /api/plugins/*| G1
    A -->|Proxy /api/plugins/*| G2
    B -->|Register| C
    E1 -->|Register Services| C
    E2 -->|Register Services| C
    E1 <-->|Pub/Sub| D
    E2 <-->|Pub/Sub| D
    A -->|Health Check| F1
    A -->|Health Check| F2
```

### Deployment Flow

```mermaid
sequenceDiagram
    participant Admin as Super Admin
    participant API as Core API
    participant Registry as Plugin Registry
    participant Docker as Container Runtime
    participant Plugin as Plugin Container

    Admin->>API: POST /api/v1/plugins/:id/install
    API->>Registry: validateManifest()
    Registry->>API: ✅ Valid
    API->>Docker: Pull image (manifest.runtime.image)
    Docker->>Docker: docker pull registry/plugin:1.0.0
    Docker-->>API: Image pulled
    API->>Docker: Create container with resource limits
    Docker->>Plugin: Start container
    Plugin->>Plugin: Run migrations
    Plugin->>API: POST /api/v1/service-registry (register)
    API->>Plugin: GET /health/live
    Plugin-->>API: 200 OK
    API->>Plugin: GET /health/ready
    Plugin-->>API: 200 OK (dependencies ready)
    API->>Registry: Update status → ACTIVE
    API-->>Admin: Installation complete
```

---

## Plugin Manifest

Every plugin declares its deployment configuration in the **plugin manifest** (`plugin.json`):

### Runtime Configuration

```json
{
  "id": "crm",
  "name": "CRM Plugin",
  "version": "1.2.0",
  "runtime": {
    "type": "typescript",
    "image": "registry.plexica.io/plugins/crm:1.2.0",
    "resources": {
      "cpu": "500m",
      "memory": "512Mi"
    }
  },
  "api": {
    "basePath": "/api/plugins/crm",
    "healthCheck": "/health",
    "readiness": "/health/ready",
    "liveness": "/health/live",
    "openapi": "/openapi.json"
  }
}
```

### Manifest Fields

| Field                      | Type   | Required | Description                                  |
| -------------------------- | ------ | -------- | -------------------------------------------- |
| `runtime.type`             | string | Yes      | Runtime environment (`typescript`, `node`)   |
| `runtime.image`            | string | Yes      | Docker image URL with tag                    |
| `runtime.resources.cpu`    | string | No       | CPU limit (e.g., `500m`, `1`, `2000m`)       |
| `runtime.resources.memory` | string | No       | Memory limit (e.g., `512Mi`, `1Gi`)          |
| `api.basePath`             | string | Yes      | Base path for plugin API                     |
| `api.healthCheck`          | string | Yes      | Health check endpoint path                   |
| `api.readiness`            | string | No       | Readiness probe endpoint (default: `/ready`) |
| `api.liveness`             | string | No       | Liveness probe endpoint (default: `/live`)   |
| `api.openapi`              | string | No       | OpenAPI spec endpoint                        |

---

## Health Check Endpoints

All plugins **MUST** implement standardized health check endpoints:

### 1. Liveness Probe (`/health/live`)

**Purpose**: Check if the plugin process is running

**Requirements**:

- Must respond within **100ms** (P95) per Constitution Article 9.2
- Returns HTTP 200 if the process is alive
- Does **NOT** check dependencies (database, Redis, etc.)

**Example Implementation** (Fastify):

```typescript
// File: src/routes/health.ts
import { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (server) => {
  server.get('/health/live', async (_request, _reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  });
};
```

**Response Format**:

```json
{
  "status": "ok",
  "timestamp": "2026-02-16T10:30:00.000Z"
}
```

---

### 2. Readiness Probe (`/health/ready`)

**Purpose**: Check if the plugin is ready to accept traffic

**Requirements**:

- Must respond within **200ms** (P95)
- Checks dependencies: database, Redis, external APIs
- Returns HTTP 200 if ready, HTTP 503 if not ready
- Should include detailed status of dependencies

**Example Implementation**:

```typescript
server.get('/health/ready', async (_request, reply) => {
  const checks: Record<string, string> = {};

  // Check database connection
  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch (error) {
    checks.database = 'error';
  }

  // Check Redis connection
  try {
    await redis.ping();
    checks.redis = 'ok';
  } catch (error) {
    checks.redis = 'error';
  }

  // Check external API (if applicable)
  try {
    const response = await fetch('https://external-api.example.com/health');
    checks.externalApi = response.ok ? 'ok' : 'error';
  } catch (error) {
    checks.externalApi = 'error';
  }

  const allOk = Object.values(checks).every((status) => status === 'ok');

  if (!allOk) {
    reply.status(503);
  }

  return {
    status: allOk ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks,
  };
});
```

**Response Format (Ready)**:

```json
{
  "status": "ready",
  "timestamp": "2026-02-16T10:30:00.000Z",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "externalApi": "ok"
  }
}
```

**Response Format (Not Ready)** - HTTP 503:

```json
{
  "status": "not_ready",
  "timestamp": "2026-02-16T10:30:00.000Z",
  "checks": {
    "database": "ok",
    "redis": "error",
    "externalApi": "ok"
  }
}
```

---

### 3. Full Health Check (`/health`)

**Purpose**: Detailed health information including version, uptime, metrics

**Example Implementation**:

```typescript
server.get('/health', async (_request, reply) => {
  const checks: Record<string, string> = {};

  // Database check
  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  // Redis check
  try {
    await redis.ping();
    checks.redis = 'ok';
  } catch {
    checks.redis = 'error';
  }

  const allOk = Object.values(checks).every((status) => status === 'ok');

  if (!allOk) {
    reply.status(503);
  }

  return {
    status: allOk ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    version: process.env.PLUGIN_VERSION || '1.0.0',
    uptime: process.uptime(),
    checks,
  };
});
```

**Response Format**:

```json
{
  "status": "healthy",
  "timestamp": "2026-02-16T10:30:00.000Z",
  "version": "1.2.0",
  "uptime": 3600.5,
  "checks": {
    "database": "ok",
    "redis": "ok"
  }
}
```

---

## Manual Deployment Methods

⚠️ **Current Status**: Plugin deployment is **manual**. Automated orchestration (auto-deploy on install, resource limits, hot-swap) is planned for Phase 2.

### Docker Compose Deployment

#### Step 1: Create Plugin Dockerfile

```dockerfile
# File: plugins/crm/Dockerfile
FROM node:20-alpine AS base
RUN corepack enable pnpm
WORKDIR /app

# Install dependencies
FROM base AS dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Build stage
FROM base AS build
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Production stage
FROM node:20-alpine AS production
RUN corepack enable pnpm
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy dependencies and build
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3100

ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3100/health/live || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
```

#### Step 2: Add to Docker Compose

```yaml
# File: docker-compose.plugins.yml
services:
  # CRM Plugin
  plugin-crm:
    build:
      context: ./plugins/crm
      dockerfile: Dockerfile
    container_name: plexica-plugin-crm
    environment:
      # Plugin configuration
      PLUGIN_ID: crm
      PLUGIN_VERSION: 1.2.0

      # Database connection
      DATABASE_URL: postgresql://plexica:plexica_password@postgres:5432/plexica

      # Redis connection
      REDIS_URL: redis://redis:6379

      # Core API connection
      CORE_API_URL: http://core-api:3000

      # Event bus connection
      KAFKA_BROKERS: redpanda-1:29092,redpanda-2:29092,redpanda-3:29092

      # Security
      JWT_SECRET: ${JWT_SECRET}

      # Logging
      LOG_LEVEL: info
      NODE_ENV: production
    ports:
      - '3100:3100'
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      core-api:
        condition: service_started
    healthcheck:
      test:
        [
          'CMD',
          'wget',
          '--no-verbose',
          '--tries=1',
          '--spider',
          'http://localhost:3100/health/live',
        ]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - plexica-network
    restart: unless-stopped
    # Resource limits (planned - not enforced yet)
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M

  # Analytics Plugin
  plugin-analytics:
    build:
      context: ./plugins/analytics
      dockerfile: Dockerfile
    container_name: plexica-plugin-analytics
    environment:
      PLUGIN_ID: analytics
      PLUGIN_VERSION: 1.0.0
      DATABASE_URL: postgresql://plexica:plexica_password@postgres:5432/plexica
      REDIS_URL: redis://redis:6379
      CORE_API_URL: http://core-api:3000
      KAFKA_BROKERS: redpanda-1:29092,redpanda-2:29092,redpanda-3:29092
      JWT_SECRET: ${JWT_SECRET}
      LOG_LEVEL: info
      NODE_ENV: production
    ports:
      - '3200:3200'
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      core-api:
        condition: service_started
      plugin-crm:
        condition: service_healthy
    healthcheck:
      test:
        [
          'CMD',
          'wget',
          '--no-verbose',
          '--tries=1',
          '--spider',
          'http://localhost:3200/health/live',
        ]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - plexica-network
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1024M
        reservations:
          cpus: '0.5'
          memory: 512M

networks:
  plexica-network:
    external: true
```

#### Step 3: Deploy Plugins

```bash
# Start core infrastructure first (if not running)
docker-compose up -d

# Deploy plugins
docker-compose -f docker-compose.plugins.yml up -d

# Verify plugin health
docker-compose -f docker-compose.plugins.yml ps
docker logs plexica-plugin-crm
docker logs plexica-plugin-analytics

# Check health endpoints
curl http://localhost:3100/health/live
curl http://localhost:3100/health/ready
curl http://localhost:3100/health
```

#### Step 4: Register Plugin with Core API

```bash
# Register plugin in service registry
curl -X POST http://localhost:3000/api/v1/plugins \
  -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d @plugins/crm/plugin.json

# Install plugin (creates database records)
curl -X POST http://localhost:3000/api/v1/plugins/crm/install \
  -H "Authorization: Bearer $SUPER_ADMIN_TOKEN"

# Enable plugin globally
curl -X POST http://localhost:3000/api/v1/plugins/crm/enable \
  -H "Authorization: Bearer $SUPER_ADMIN_TOKEN"
```

---

### Kubernetes Deployment

#### Step 1: Create Kubernetes Deployment Manifest

```yaml
# File: k8s/plugin-crm-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: plugin-crm
  namespace: plexica
  labels:
    app: plexica
    component: plugin
    plugin: crm
spec:
  replicas: 2
  selector:
    matchLabels:
      app: plexica
      component: plugin
      plugin: crm
  template:
    metadata:
      labels:
        app: plexica
        component: plugin
        plugin: crm
    spec:
      containers:
        - name: plugin-crm
          image: registry.plexica.io/plugins/crm:1.2.0
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 3100
              name: http
              protocol: TCP
          env:
            - name: PLUGIN_ID
              value: 'crm'
            - name: PLUGIN_VERSION
              value: '1.2.0'
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: plexica-database
                  key: connection-string
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: plexica-redis
                  key: connection-string
            - name: CORE_API_URL
              value: 'http://core-api.plexica.svc.cluster.local:3000'
            - name: KAFKA_BROKERS
              value: 'redpanda-0.redpanda.plexica.svc.cluster.local:29092,redpanda-1.redpanda.plexica.svc.cluster.local:29092,redpanda-2.redpanda.plexica.svc.cluster.local:29092'
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: plexica-secrets
                  key: jwt-secret
            - name: LOG_LEVEL
              value: 'info'
            - name: NODE_ENV
              value: 'production'
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
          livenessProbe:
            httpGet:
              path: /health/live
              port: http
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health/ready
              port: http
            initialDelaySeconds: 10
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3
          securityContext:
            runAsNonRoot: true
            runAsUser: 1001
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL
      restartPolicy: Always
      securityContext:
        fsGroup: 1001
---
apiVersion: v1
kind: Service
metadata:
  name: plugin-crm
  namespace: plexica
  labels:
    app: plexica
    component: plugin
    plugin: crm
spec:
  type: ClusterIP
  ports:
    - port: 3100
      targetPort: http
      protocol: TCP
      name: http
  selector:
    app: plexica
    component: plugin
    plugin: crm
```

#### Step 2: Create ConfigMaps and Secrets

```bash
# Create namespace
kubectl create namespace plexica

# Create database secret
kubectl create secret generic plexica-database \
  --from-literal=connection-string="postgresql://plexica:password@postgres.plexica.svc.cluster.local:5432/plexica" \
  -n plexica

# Create Redis secret
kubectl create secret generic plexica-redis \
  --from-literal=connection-string="redis://redis.plexica.svc.cluster.local:6379" \
  -n plexica

# Create JWT secret
kubectl create secret generic plexica-secrets \
  --from-literal=jwt-secret="your-jwt-secret-here" \
  -n plexica
```

#### Step 3: Deploy to Kubernetes

```bash
# Apply deployment
kubectl apply -f k8s/plugin-crm-deployment.yaml

# Verify deployment
kubectl get deployments -n plexica
kubectl get pods -n plexica -l plugin=crm
kubectl get services -n plexica -l plugin=crm

# Check logs
kubectl logs -n plexica -l plugin=crm --tail=100 -f

# Check health
kubectl port-forward -n plexica svc/plugin-crm 3100:3100
curl http://localhost:3100/health/live
curl http://localhost:3100/health/ready
```

#### Step 4: Register with Core API

Same as Docker Compose Step 4 above.

---

## Resource Limits

⚠️ **Status**: Resource limits are declared in the manifest but **not yet enforced** by the platform.

### Planned Enforcement

When automated orchestration is implemented, the platform will:

1. **Read resource limits** from `manifest.runtime.resources`
2. **Apply limits** at container runtime (Docker/K8s)
3. **Monitor usage** via Prometheus/Grafana
4. **Throttle or kill** containers exceeding limits

### Manifest Declaration

```json
{
  "runtime": {
    "resources": {
      "cpu": "500m", // 0.5 CPU cores
      "memory": "512Mi" // 512 MiB RAM
    }
  }
}
```

### CPU Limit Formats

| Format  | Meaning                  | Example |
| ------- | ------------------------ | ------- |
| `m`     | Millicores (1/1000 core) | `500m`  |
| Integer | Full cores               | `2`     |
| Decimal | Fractional cores         | `1.5`   |

### Memory Limit Formats

| Format | Meaning   | Example |
| ------ | --------- | ------- |
| `Mi`   | Mebibytes | `512Mi` |
| `Gi`   | Gibibytes | `2Gi`   |
| `M`    | Megabytes | `500M`  |
| `G`    | Gigabytes | `2G`    |

### Recommended Limits

| Plugin Type     | CPU  | Memory | Notes                               |
| --------------- | ---- | ------ | ----------------------------------- |
| Simple CRUD     | 250m | 256Mi  | Basic REST API, minimal processing  |
| Complex Logic   | 500m | 512Mi  | Data processing, external API calls |
| Analytics       | 1-2  | 1-2Gi  | Heavy computation, large datasets   |
| Background Jobs | 500m | 512Mi  | Queue workers, cron tasks           |

---

## Network Configuration

### Required Network Access

Plugins must be able to communicate with:

1. **Core API** (`http://core-api:3000`)
   - Service registration
   - Cross-plugin communication via API gateway
   - Shared data service

2. **PostgreSQL** (`postgres:5432`)
   - Tenant-scoped database access
   - Plugin data migrations

3. **Redis** (`redis:6379`)
   - Caching
   - Session storage
   - Rate limiting

4. **Redpanda/Kafka** (`redpanda:29092`)
   - Event publishing
   - Event consumption

5. **Other Plugins** (via Service Discovery)
   - Plugin-to-plugin REST calls
   - Resolved via Core API service registry

### Network Policies (Kubernetes)

```yaml
# File: k8s/plugin-network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: plugin-crm-network-policy
  namespace: plexica
spec:
  podSelector:
    matchLabels:
      plugin: crm
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # Allow traffic from API gateway
    - from:
        - podSelector:
            matchLabels:
              component: api-gateway
      ports:
        - protocol: TCP
          port: 3100
  egress:
    # Allow DNS
    - to:
        - namespaceSelector:
            matchLabels:
              name: kube-system
      ports:
        - protocol: UDP
          port: 53
    # Allow PostgreSQL
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - protocol: TCP
          port: 5432
    # Allow Redis
    - to:
        - podSelector:
            matchLabels:
              app: redis
      ports:
        - protocol: TCP
          port: 6379
    # Allow Core API
    - to:
        - podSelector:
            matchLabels:
              component: core-api
      ports:
        - protocol: TCP
          port: 3000
    # Allow Redpanda
    - to:
        - podSelector:
            matchLabels:
              app: redpanda
      ports:
        - protocol: TCP
          port: 29092
```

---

## Lifecycle States

Plugins transition through lifecycle states during deployment:

```mermaid
stateDiagram-v2
    [*] --> REGISTERED: POST /api/v1/plugins
    REGISTERED --> INSTALLING: POST /api/v1/plugins/:id/install
    INSTALLING --> INSTALLED: Container healthy + migrations complete
    INSTALLING --> REGISTERED: Installation failed
    INSTALLED --> ACTIVE: POST /api/v1/plugins/:id/enable
    ACTIVE --> DISABLED: POST /api/v1/plugins/:id/disable
    DISABLED --> ACTIVE: POST /api/v1/plugins/:id/enable
    DISABLED --> UNINSTALLING: DELETE /api/v1/plugins/:id
    UNINSTALLING --> UNINSTALLED: Container removed + cleanup complete
    UNINSTALLED --> [*]
```

### State Definitions

| State        | Description                                                   | Container Status |
| ------------ | ------------------------------------------------------------- | ---------------- |
| REGISTERED   | Manifest validated and stored; plugin not yet deployed        | None             |
| INSTALLING   | Container being pulled, started, migrations running           | Starting         |
| INSTALLED    | Container running, health checks passing, not serving traffic | Running          |
| ACTIVE       | Plugin serving traffic, routes registered in API gateway      | Running          |
| DISABLED     | Plugin not serving traffic, container stopped                 | Stopped          |
| UNINSTALLING | Container being removed, routes deregistered, cleanup running | Stopping         |
| UNINSTALLED  | Plugin completely removed from system                         | None             |

---

## Monitoring & Observability

### Metrics Endpoints

Plugins should expose a `/metrics` endpoint for Prometheus scraping:

```typescript
// File: src/routes/metrics.ts
import { FastifyPluginAsync } from 'fastify';
import promClient from 'prom-client';

export const metricsRoutes: FastifyPluginAsync = async (server) => {
  // Create metrics registry
  const register = new promClient.Registry();
  promClient.collectDefaultMetrics({ register });

  // Custom metrics
  const httpRequestDuration = new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
  });

  server.get('/metrics', async (_request, reply) => {
    reply.type('text/plain');
    return register.metrics();
  });
};
```

### Prometheus Configuration

```yaml
# File: prometheus/prometheus.yml
scrape_configs:
  # Core API
  - job_name: 'core-api'
    static_configs:
      - targets: ['core-api:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s

  # CRM Plugin
  - job_name: 'plugin-crm'
    static_configs:
      - targets: ['plugin-crm:3100']
    metrics_path: '/metrics'
    scrape_interval: 15s

  # Analytics Plugin
  - job_name: 'plugin-analytics'
    static_configs:
      - targets: ['plugin-analytics:3200']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

### Logging Standards

**Constitution Article 6.3**: All plugins must use structured JSON logging with Pino.

**Required Log Fields**:

- `timestamp` - ISO 8601 timestamp
- `level` - Log level (error, warn, info, debug)
- `message` - Log message
- `requestId` - Request trace ID (propagated via `X-Trace-ID` header)
- `userId` - User ID (from `X-User-ID` header)
- `tenantId` - Tenant ID (from `X-Tenant-ID` header)

**Example**:

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
});

// Usage in request handler
server.get('/api/contacts', async (request, reply) => {
  logger.info(
    {
      requestId: request.headers['x-trace-id'],
      userId: request.headers['x-user-id'],
      tenantId: request.headers['x-tenant-id'],
      method: request.method,
      url: request.url,
    },
    'Fetching contacts'
  );
});
```

---

## Troubleshooting

### Plugin Container Won't Start

**Symptoms**: Container exits immediately or enters restart loop

**Common Causes**:

1. **Database connection failure**

   ```bash
   # Check database connectivity from plugin container
   docker exec plexica-plugin-crm sh -c "nc -zv postgres 5432"

   # Check DATABASE_URL environment variable
   docker exec plexica-plugin-crm env | grep DATABASE_URL
   ```

2. **Missing environment variables**

   ```bash
   # Check all required env vars are set
   docker exec plexica-plugin-crm env
   ```

3. **Port conflicts**
   ```bash
   # Check if port is already in use
   docker ps | grep 3100
   netstat -an | grep 3100
   ```

**Solution**:

```bash
# Check container logs
docker logs plexica-plugin-crm --tail=100

# Inspect container
docker inspect plexica-plugin-crm

# Restart with fresh state
docker-compose -f docker-compose.plugins.yml down plugin-crm
docker-compose -f docker-compose.plugins.yml up -d plugin-crm
```

---

### Health Checks Failing

**Symptoms**: Container running but health checks return 503

**Common Causes**:

1. **Database not ready**

   ```bash
   # Test database connection
   docker exec plexica-plugin-crm node -e "
     const { PrismaClient } = require('@prisma/client');
     const prisma = new PrismaClient();
     prisma.\$queryRaw\`SELECT 1\`.then(() => console.log('DB OK')).catch(console.error);
   "
   ```

2. **Redis not ready**

   ```bash
   # Test Redis connection
   docker exec plexica-plugin-crm node -e "
     const redis = require('ioredis');
     const client = new redis(process.env.REDIS_URL);
     client.ping().then(() => console.log('Redis OK')).catch(console.error);
   "
   ```

3. **External API dependency unavailable**
   ```bash
   # Test external API from container
   docker exec plexica-plugin-crm curl -v https://external-api.example.com/health
   ```

**Solution**:

```bash
# Check health endpoint directly
curl -v http://localhost:3100/health/ready

# Verify dependencies are running
docker-compose ps postgres redis

# Increase health check timeout
# Edit docker-compose.plugins.yml:
healthcheck:
  start_period: 60s  # Increase from 40s
  timeout: 15s       # Increase from 10s
```

---

### Plugin Not Receiving Traffic

**Symptoms**: Plugin healthy but API requests return 404

**Common Causes**:

1. **Plugin not registered in service registry**

   ```bash
   # Check service registry
   curl http://localhost:3000/api/v1/service-registry/services \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```

2. **Plugin status not ACTIVE**

   ```bash
   # Check plugin status
   curl http://localhost:3000/api/v1/plugins/crm \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```

3. **API Gateway routing misconfigured**
   ```bash
   # Check gateway routes
   curl http://localhost:3000/api/v1/plugins \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```

**Solution**:

```bash
# Re-register plugin
curl -X POST http://localhost:3000/api/v1/plugins/crm/install \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Enable plugin
curl -X POST http://localhost:3000/api/v1/plugins/crm/enable \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Verify routing
curl http://localhost:3000/api/plugins/crm/health/live
```

---

### High Memory Usage

**Symptoms**: Container killed by OOM (Out of Memory)

**Diagnosis**:

```bash
# Check container memory usage
docker stats plexica-plugin-crm

# Check Kubernetes pod memory
kubectl top pod -n plexica -l plugin=crm

# Inspect Node.js heap
docker exec plexica-plugin-crm node -e "console.log(process.memoryUsage())"
```

**Common Causes**:

1. **Memory leaks** - Unreleased database connections, event listeners
2. **Large data sets** - Loading too much data into memory
3. **Insufficient limits** - Memory limit too low for workload

**Solution**:

```bash
# Increase memory limit in docker-compose.plugins.yml
deploy:
  resources:
    limits:
      memory: 1024M  # Increase from 512M

# Or in Kubernetes manifest
resources:
  limits:
    memory: 1Gi

# Restart container
docker-compose -f docker-compose.plugins.yml restart plugin-crm

# Profile memory usage (development)
node --inspect=0.0.0.0:9229 dist/index.js
# Connect Chrome DevTools → Memory tab
```

---

### Event Consumption Not Working

**Symptoms**: Plugin not receiving events from Redpanda

**Diagnosis**:

```bash
# Check Redpanda connection
docker exec plexica-plugin-crm node -e "
  const { Kafka } = require('kafkajs');
  const kafka = new Kafka({ brokers: process.env.KAFKA_BROKERS.split(',') });
  kafka.admin().listTopics().then(console.log).catch(console.error);
"

# Check consumer group status
docker exec plexica-redpanda-1 rpk group describe plugin-crm-consumer
```

**Common Causes**:

1. **Topic not created**
2. **Consumer not subscribed**
3. **Consumer group lag**

**Solution**:

```bash
# Create topic manually
docker exec plexica-redpanda-1 rpk topic create crm.deal.won

# Check consumer subscription in plugin code
# File: src/events/consumer.ts
await consumer.subscribe({ topic: 'crm.deal.won', fromBeginning: true });

# Reset consumer group offset (development only)
docker exec plexica-redpanda-1 rpk group seek plugin-crm-consumer --to start
```

---

## Planned Automation

⚠️ The following features are **planned** for Phase 2 (Q2 2026):

### 1. Automated Container Orchestration

**Goal**: Plugins automatically deployed when installed via Core API

**Implementation Plan**:

```typescript
// File: apps/core-api/src/services/plugin-orchestration.service.ts

export class PluginOrchestrationService {
  async deployPlugin(pluginId: string, manifest: PluginManifest): Promise<void> {
    // 1. Pull Docker image
    await this.docker.pullImage(manifest.runtime.image);

    // 2. Create container with resource limits
    const container = await this.docker.createContainer({
      Image: manifest.runtime.image,
      name: `plexica-plugin-${pluginId}`,
      Env: [
        `PLUGIN_ID=${pluginId}`,
        `DATABASE_URL=${process.env.DATABASE_URL}`,
        `REDIS_URL=${process.env.REDIS_URL}`,
        // ... other env vars
      ],
      HostConfig: {
        RestartPolicy: { Name: 'unless-stopped' },
        Resources: {
          CpuQuota: this.parseCpuLimit(manifest.runtime.resources.cpu),
          Memory: this.parseMemoryLimit(manifest.runtime.resources.memory),
        },
        NetworkMode: 'plexica-network',
      },
    });

    // 3. Start container
    await container.start();

    // 4. Wait for health check
    await this.waitForHealthy(container, manifest.api.healthCheck);

    // 5. Register in service discovery
    await this.serviceRegistry.registerPlugin(pluginId, container.id);
  }

  async undeployPlugin(pluginId: string): Promise<void> {
    // 1. Deregister from service discovery
    await this.serviceRegistry.deregisterPlugin(pluginId);

    // 2. Stop container gracefully (30s timeout)
    const container = this.docker.getContainer(`plexica-plugin-${pluginId}`);
    await container.stop({ t: 30 });

    // 3. Remove container
    await container.remove();
  }
}
```

**API Integration**:

```bash
# Install plugin → auto-deploy container
POST /api/v1/plugins/crm/install
→ Core API calls PluginOrchestrationService.deployPlugin()
→ Container starts automatically

# Uninstall plugin → auto-remove container
DELETE /api/v1/plugins/crm
→ Core API calls PluginOrchestrationService.undeployPlugin()
→ Container removed automatically
```

---

### 2. Hot-Swap Updates

**Goal**: Update plugins without downtime

**Strategy**: Blue-Green Deployment

```mermaid
sequenceDiagram
    participant Admin
    participant API as Core API
    participant Gateway as API Gateway
    participant Blue as Plugin v1.0 (Blue)
    participant Green as Plugin v1.1 (Green)

    Admin->>API: POST /plugins/crm/update (v1.1)
    API->>API: Pull new image
    API->>Green: Start new container (v1.1)
    Green->>API: Health check OK
    API->>API: Run migrations
    API->>Gateway: Update routing → Green
    Gateway->>Green: Route traffic to v1.1
    API->>Blue: Graceful shutdown (30s)
    Blue->>Blue: Finish in-flight requests
    API->>Blue: Stop and remove
    API-->>Admin: Update complete
```

**Implementation**:

```typescript
async updatePlugin(pluginId: string, newVersion: string): Promise<void> {
  const manifest = await this.getPluginManifest(pluginId, newVersion);

  // 1. Start new container (Green)
  const greenContainer = await this.deployPlugin(`${pluginId}-green`, manifest);

  try {
    // 2. Run migrations
    await this.runMigrations(greenContainer, manifest);

    // 3. Switch traffic to Green
    await this.apiGateway.updateRouting(pluginId, greenContainer.id);

    // 4. Graceful shutdown of Blue
    const blueContainer = this.docker.getContainer(`plexica-plugin-${pluginId}`);
    await blueContainer.stop({ t: 30 });

    // 5. Rename Green → Blue
    await this.docker.renameContainer(greenContainer.id, `plexica-plugin-${pluginId}`);

    // 6. Remove old Blue
    await blueContainer.remove();

  } catch (error) {
    // Rollback: remove Green, keep Blue
    await greenContainer.stop();
    await greenContainer.remove();
    throw error;
  }
}
```

---

### 3. Auto-Scaling

**Goal**: Scale plugin containers based on load

**Metrics**:

- CPU usage > 80% for 5 minutes → scale up
- Memory usage > 85% → scale up
- Request rate > 100 req/s → scale up
- CPU usage < 20% for 10 minutes → scale down

**Kubernetes HorizontalPodAutoscaler**:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: plugin-crm-hpa
  namespace: plexica
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: plugin-crm
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 80
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 85
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 100
          periodSeconds: 30
```

---

### 4. Rollback on Failure

**Goal**: Automatically rollback failed deployments

**Triggers**:

- Health checks fail after 3 retries
- Migration fails
- Container crashes within 60 seconds

**Implementation**:

```typescript
async deployPluginWithRollback(pluginId: string, manifest: PluginManifest): Promise<void> {
  // Backup current state
  const backup = await this.backupPluginState(pluginId);

  try {
    await this.deployPlugin(pluginId, manifest);
  } catch (error) {
    logger.error({ pluginId, error }, 'Plugin deployment failed, rolling back');

    // Rollback steps
    await this.restorePluginState(pluginId, backup);

    throw new Error(`Plugin deployment failed and rolled back: ${error.message}`);
  }
}
```

---

## FAQ

### Q: Can I deploy plugins outside of Docker?

**A**: No. Plexica requires plugin process isolation via containers (Constitution Article 1.2.4). Plugins must run in separate containers to prevent failures from affecting the core platform.

---

### Q: Do I need to restart the core platform to deploy a plugin?

**A**: No. Plugins are deployed independently as separate containers. The core platform remains running.

---

### Q: How do I update a plugin without downtime?

**A**: Currently, updating plugins requires manual stop/start. Hot-swap blue-green deployment is **planned** for Phase 2. For now:

```bash
# Manual update process
docker-compose -f docker-compose.plugins.yml stop plugin-crm
docker pull registry.plexica.io/plugins/crm:1.3.0
docker-compose -f docker-compose.plugins.yml up -d plugin-crm
```

---

### Q: What happens if a plugin crashes?

**A**: The container orchestrator (Docker Compose or Kubernetes) will automatically restart the plugin container based on the `restart: unless-stopped` policy. The core platform is **not affected** due to process isolation.

---

### Q: Can plugins share data?

**A**: Yes, via two methods:

1. **Shared Data Service** - Core API provides a shared data API for cross-plugin critical data
2. **Direct REST Calls** - Plugins can call each other via service discovery

See [`docs/CORE_SERVICES.md`](./CORE_SERVICES.md) for details.

---

### Q: How do I monitor plugin health in production?

**A**: Use Prometheus + Grafana:

1. Expose `/metrics` endpoint in your plugin
2. Configure Prometheus to scrape the endpoint
3. Create Grafana dashboards for plugin metrics
4. Set up alerts for health check failures, high CPU/memory, error rates

---

### Q: What's the difference between liveness and readiness probes?

**A**:

- **Liveness** (`/health/live`): Is the process running? If this fails, restart the container.
- **Readiness** (`/health/ready`): Is the plugin ready to accept traffic? If this fails, stop sending requests but don't restart.

---

### Q: Can I run multiple instances of the same plugin?

**A**: Yes, for high availability and load balancing. Deploy multiple containers with the same plugin ID but different container names:

```yaml
services:
  plugin-crm-1:
    image: registry.plexica.io/plugins/crm:1.2.0
    container_name: plexica-plugin-crm-1
    # ...

  plugin-crm-2:
    image: registry.plexica.io/plugins/crm:1.2.0
    container_name: plexica-plugin-crm-2
    # ...
```

The API Gateway will load-balance requests across instances.

---

### Q: How do I handle database migrations during deployment?

**A**: Migrations run automatically when the plugin container starts:

```typescript
// File: src/index.ts
async function start() {
  // 1. Run migrations first
  await runMigrations();

  // 2. Start server
  const server = fastify();
  await server.listen({ port: 3100, host: '0.0.0.0' });
}

start();
```

**Multi-tenant note**: Migrations must run for **all active tenant schemas**. See plugin migration guide for details.

---

### Q: What if my plugin needs persistent storage?

**A**: Use one of these options:

1. **Database** (recommended) - Store data in tenant-scoped PostgreSQL schemas
2. **MinIO/S3** - Store files via the Core Storage Service
3. **Volume mounts** (not recommended) - Only for development; does not scale

---

### Q: Can I use environment variables for configuration?

**A**: Yes. Required environment variables:

- `PLUGIN_ID` - Plugin identifier
- `PLUGIN_VERSION` - Plugin version
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `CORE_API_URL` - Core API base URL
- `KAFKA_BROKERS` - Redpanda broker list
- `JWT_SECRET` - JWT signing secret
- `NODE_ENV` - Environment (production, development)

Additional plugin-specific env vars can be defined in the manifest and injected at deployment.

---

### Q: What ports should my plugin listen on?

**A**: Use the port defined in your manifest (`api.basePath`). Standard convention:

- Core API: 3000
- Super Admin: 3001
- Web App: 3002
- Plugins: 3100+

Example: CRM plugin → 3100, Analytics plugin → 3200, etc.

---

### Q: How do I debug a failing plugin deployment?

**A**:

```bash
# 1. Check container logs
docker logs plexica-plugin-crm --tail=100 -f

# 2. Exec into container
docker exec -it plexica-plugin-crm sh

# 3. Test database connection manually
docker exec plexica-plugin-crm node -e "
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  prisma.\$queryRaw\`SELECT 1\`.then(() => console.log('OK')).catch(console.error);
"

# 4. Check health endpoints
curl http://localhost:3100/health/live
curl http://localhost:3100/health/ready

# 5. Check service registration
curl http://localhost:3000/api/v1/service-registry/services
```

---

## Next Steps

1. **Create your plugin Dockerfile** - Use the template above
2. **Implement health check endpoints** - `/health/live`, `/health/ready`, `/health`
3. **Test locally** - Deploy with Docker Compose
4. **Register with Core API** - Submit manifest and install
5. **Monitor in production** - Set up Prometheus metrics and Grafana dashboards

For more information:

- [Plugin Development Guide](./PLUGIN_DEVELOPMENT.md) - How to build plugins
- [Core Services Guide](./CORE_SERVICES.md) - Using platform services
- [Spec 004: Plugin System](../.forge/specs/004-plugin-system/spec.md) - Full specification

---

_Last updated: February 16, 2026_
_Status: Manual deployment only; orchestration automation planned for Phase 2 (Q2 2026)_
