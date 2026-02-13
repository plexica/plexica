# Deployment Architecture

**Version**: 1.0
**Last Updated**: February 13, 2026
**Status**: Active
**Owner**: Platform Engineering Team
**FORGE Track**: Feature

---

## Overview

This document defines Plexica's deployment architecture across all environments — from local development (Docker Compose) through production (Kubernetes with Helm). It covers infrastructure topology, CI/CD pipeline design, container strategy, and operational requirements.

Per **Constitution Article 9.1**, all deployments must support feature flags, fast rollback (< 5 minutes), and backward-compatible database migrations.

---

## Deployment Environments

| Environment | Infrastructure   | Purpose                           | Access             |
| ----------- | ---------------- | --------------------------------- | ------------------ |
| Local Dev   | Docker Compose   | Individual developer workstations | Developer machines |
| CI          | GitHub Actions   | Automated testing and build       | GitHub runners     |
| Staging     | Kubernetes       | Pre-production validation         | Internal team      |
| Production  | Kubernetes (EKS) | Live multi-tenant SaaS            | End users          |

---

## Infrastructure Components

### Component Topology

```mermaid
graph TB
    subgraph "Edge Layer"
        LB[Load Balancer / Ingress]
        GW[API Gateway<br/>Kong / Traefik]
    end

    subgraph "Application Layer"
        CORE[Core API<br/>3 replicas]
        FE[Frontend Shell<br/>Nginx / CDN]
        P1[Plugin: CRM<br/>2 replicas]
        P2[Plugin: Billing<br/>2 replicas]
    end

    subgraph "Data Layer"
        PG[(PostgreSQL<br/>StatefulSet / Managed)]
        RD[(Redis Cluster<br/>StatefulSet / Managed)]
        RP[(Redpanda<br/>StatefulSet)]
        KC[Keycloak<br/>2 replicas]
        MN[(MinIO<br/>StatefulSet / S3)]
    end

    LB --> GW
    GW --> CORE
    GW --> P1
    GW --> P2
    LB --> FE
    CORE --> PG
    CORE --> RD
    CORE --> RP
    CORE --> KC
    CORE --> MN
    P1 --> PG
    P1 --> RD
    P1 --> RP
    P2 --> PG
    P2 --> RD
    P2 --> RP
```

### Service Inventory

| Service        | Image                            | Replicas (Prod) | Resources (Request / Limit)    | Health Check          |
| -------------- | -------------------------------- | --------------- | ------------------------------ | --------------------- |
| Core API       | `plexica/core-api`               | 3               | 500m CPU / 1 CPU, 512Mi / 1Gi  | `/health`, `/ready`   |
| Frontend       | `plexica/frontend`               | 2               | 100m CPU / 250m, 128Mi / 256Mi | HTTP 200 on `/`       |
| Plugin CRM     | `plexica/plugin-crm`             | 2               | 250m CPU / 500m, 256Mi / 512Mi | `/health`             |
| Plugin Billing | `plexica/plugin-billing`         | 2               | 250m CPU / 500m, 256Mi / 512Mi | `/health`             |
| PostgreSQL     | `postgres:18.1-alpine`           | 1 (StatefulSet) | 1 CPU / 2 CPU, 2Gi / 4Gi       | `pg_isready`          |
| Redis          | `redis:8.4-alpine`               | 3 (Cluster)     | 250m CPU / 500m, 256Mi / 512Mi | `redis-cli ping`      |
| Redpanda       | `redpandadata/redpanda`          | 3               | 500m CPU / 1 CPU, 1Gi / 2Gi    | Admin API `/v1/node`  |
| Keycloak       | `quay.io/keycloak/keycloak:26.5` | 2               | 500m CPU / 1 CPU, 512Mi / 1Gi  | HTTP 200 on `/health` |
| MinIO          | `minio/minio`                    | 1               | 250m CPU / 500m, 512Mi / 1Gi   | `/minio/health/live`  |
| API Gateway    | `kong:3.4-alpine`                | 2               | 250m CPU / 500m, 256Mi / 512Mi | Admin API `/status`   |

---

## Kubernetes Deployment

### Namespace Structure

```
plexica-namespace/
├── core-api          (Deployment + Service)
├── plugin-crm        (Deployment + Service)
├── plugin-billing    (Deployment + Service)
├── api-gateway       (Kong/Traefik Ingress)
├── postgresql        (StatefulSet or managed)
├── redis             (StatefulSet or managed)
├── redpanda          (StatefulSet or managed)
├── keycloak          (Deployment or managed)
└── minio             (StatefulSet, only if not S3)
```

### Core API Deployment

```yaml
# k8s/core-api/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: core-api
  namespace: plexica
spec:
  replicas: 3
  selector:
    matchLabels:
      app: core-api
  template:
    metadata:
      labels:
        app: core-api
    spec:
      containers:
        - name: core-api
          image: plexica/core-api:1.0.0
          ports:
            - containerPort: 3000
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: plexica-secrets
                  key: database-url
            - name: REDIS_URL
              value: 'redis://redis-cluster:6379'
            - name: KAFKA_BROKERS
              value: 'redpanda-0.redpanda:9092,redpanda-1.redpanda:9092'
            - name: KEYCLOAK_URL
              value: 'http://keycloak:8080'
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
            limits:
              cpu: 1000m
              memory: 1Gi
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: core-api
  namespace: plexica
spec:
  selector:
    app: core-api
  ports:
    - port: 3000
      targetPort: 3000
  type: ClusterIP
```

### Plugin Deployment Template

Each plugin follows the same deployment pattern with its own resource limits:

```yaml
# k8s/plugins/crm/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: plugin-crm
  namespace: plexica
  labels:
    plugin: crm
spec:
  replicas: 2
  selector:
    matchLabels:
      app: plugin-crm
  template:
    metadata:
      labels:
        app: plugin-crm
        plugin: crm
    spec:
      containers:
        - name: crm
          image: plexica/plugin-crm:1.2.0
          ports:
            - containerPort: 3000
          env:
            - name: CORE_API_URL
              value: 'http://core-api:3000'
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: plexica-secrets
                  key: database-url
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
```

### Helm Chart Structure

```
plexica-helm/
├── Chart.yaml
├── values.yaml
├── templates/
│   ├── core/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── configmap.yaml
│   │   └── secret.yaml
│   ├── gateway/
│   │   ├── kong.yaml
│   │   └── ingress.yaml
│   ├── database/
│   │   ├── postgresql.yaml
│   │   └── pgbouncer.yaml
│   ├── cache/
│   │   └── redis-cluster.yaml
│   ├── messaging/
│   │   └── redpanda.yaml
│   └── plugins/
│       └── _plugin-template.yaml
```

### Helm Values (Production)

```yaml
# values.yaml
global:
  domain: plexica.example.com
  storageClass: standard

core:
  replicas: 3
  resources:
    cpu: 500m
    memory: 512Mi

postgresql:
  enabled: true
  persistence:
    size: 100Gi

redis:
  enabled: true
  cluster:
    enabled: true

redpanda:
  enabled: true
  replicas: 3

keycloak:
  enabled: true
  replicas: 2

plugins:
  crm:
    enabled: true
    version: 1.2.0
  billing:
    enabled: true
    version: 1.0.0
```

---

## API Gateway Configuration

### Kong Configuration

```yaml
# kong.yml
_format_version: '3.0'

services:
  - name: core-api
    url: http://core-api:3000
    routes:
      - name: core-routes
        paths:
          - /api/core
        strip_path: true
    plugins:
      - name: jwt
        config:
          uri_param_names: []
          cookie_names: []
          key_claim_name: kid
          secret_is_base64: false
      - name: rate-limiting
        config:
          minute: 100
          policy: redis
          redis_host: redis
      - name: correlation-id
        config:
          header_name: X-Trace-ID
          generator: uuid
      - name: request-transformer
        config:
          add:
            headers:
              - 'X-Tenant-ID: $(jwt.tenant_id)'
              - 'X-User-ID: $(jwt.sub)'

  - name: plugin-crm
    url: http://plugin-crm:3000
    routes:
      - name: crm-routes
        paths:
          - /api/plugins/crm
        strip_path: true
    plugins:
      - name: jwt
      - name: rate-limiting
        config:
          minute: 100
```

### Traefik Configuration (Alternative)

```yaml
# traefik.yml
http:
  routers:
    core-api:
      rule: 'PathPrefix(`/api/core`)'
      service: core-api
      middlewares:
        - auth
        - tenant-context
        - rate-limit
    plugin-crm:
      rule: 'PathPrefix(`/api/plugins/crm`)'
      service: plugin-crm
      middlewares:
        - auth
        - tenant-context
        - rate-limit

  services:
    core-api:
      loadBalancer:
        servers:
          - url: 'http://core-api:3000'
    plugin-crm:
      loadBalancer:
        servers:
          - url: 'http://plugin-crm:3000'

  middlewares:
    auth:
      plugin:
        jwt:
          jwksUrl: 'http://keycloak:8080/realms/{realm}/protocol/openid-connect/certs'
    tenant-context:
      headers:
        customRequestHeaders:
          X-Tenant-ID: '{{ .JWT.tenant_id }}'
          X-User-ID: '{{ .JWT.sub }}'
    rate-limit:
      rateLimit:
        average: 100
        period: 1m
```

---

## Docker Compose (Development)

The development environment mirrors production topology using Docker Compose:

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  postgres:
    image: postgres:18.1-alpine
    environment:
      POSTGRES_DB: plexica
      POSTGRES_USER: plexica
      POSTGRES_PASSWORD: dev_password
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U plexica']
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:8.4-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  redpanda:
    image: docker.redpanda.com/redpandadata/redpanda:latest
    command:
      - redpanda
      - start
      - --kafka-addr internal://0.0.0.0:9092,external://0.0.0.0:19092
      - --advertise-kafka-addr internal://redpanda:9092,external://localhost:19092
      - --smp 1
      - --memory 1G
    ports:
      - '19092:19092'
    volumes:
      - redpanda_data:/var/lib/redpanda/data

  keycloak:
    image: quay.io/keycloak/keycloak:26.5
    environment:
      KC_BOOTSTRAP_ADMIN_USERNAME: admin
      KC_BOOTSTRAP_ADMIN_PASSWORD: admin
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/plexica
      KC_DB_USERNAME: plexica
      KC_DB_PASSWORD: dev_password
    ports:
      - '8080:8080'
    depends_on:
      postgres:
        condition: service_healthy
    command: start-dev

  minio:
    image: minio/minio:latest
    environment:
      MINIO_ROOT_USER: plexica
      MINIO_ROOT_PASSWORD: plexica123
    ports:
      - '9000:9000'
      - '9001:9001'
    volumes:
      - minio_data:/data
    command: server /data --console-address ":9001"

  core-api:
    build:
      context: ./apps/core-api
      dockerfile: Dockerfile.dev
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://plexica:dev_password@postgres:5432/plexica
      REDIS_URL: redis://redis:6379
      KAFKA_BROKERS: redpanda:9092
      KEYCLOAK_URL: http://keycloak:8080
      STORAGE_ENDPOINT: http://minio:9000
      STORAGE_ACCESS_KEY: plexica
      STORAGE_SECRET_KEY: plexica123
    ports:
      - '3000:3000'
    volumes:
      - ./apps/core-api:/app
      - /app/node_modules
    depends_on:
      - postgres
      - redis
      - redpanda
      - keycloak
      - minio
    command: npm run dev

  kong:
    image: kong:3.4-alpine
    environment:
      KONG_DATABASE: 'off'
      KONG_DECLARATIVE_CONFIG: /kong/kong.yml
    ports:
      - '8000:8000'
      - '8443:8443'
    volumes:
      - ./config/kong.yml:/kong/kong.yml
    depends_on:
      - core-api

  frontend:
    build:
      context: ./apps/web
      dockerfile: Dockerfile.dev
    environment:
      VITE_API_URL: http://localhost:8000
      VITE_KEYCLOAK_URL: http://localhost:8080
    ports:
      - '5173:5173'
    volumes:
      - ./apps/web:/app
      - /app/node_modules
    command: npm run dev

volumes:
  postgres_data:
  redis_data:
  redpanda_data:
  minio_data:
```

---

## CI/CD Pipeline

### Pipeline Flow

```mermaid
graph LR
    subgraph "CI (All Branches)"
        LINT[Lint & Type Check] --> UNIT[Unit Tests]
        UNIT --> INT[Integration Tests]
        INT --> COV[Coverage Check<br/>≥ 80%]
    end

    subgraph "Build (main only)"
        COV --> BUILD_CORE[Build Core API Image]
        COV --> BUILD_FE[Build Frontend Image]
        BUILD_CORE --> PUSH_CORE[Push to GHCR]
        BUILD_FE --> PUSH_FE[Push to GHCR]
    end

    subgraph "Deploy (main only)"
        PUSH_CORE --> HELM[Helm Upgrade]
        PUSH_FE --> HELM
        HELM --> VERIFY[Verify Rollout]
    end
```

### GitHub Actions Workflow

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:18.1
        env:
          POSTGRES_DB: plexica_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:8.4
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Run linter
        run: npm run lint
      - name: Run type check
        run: npm run type-check
      - name: Run unit tests
        run: npm run test:unit
      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/plexica_test
          REDIS_URL: redis://localhost:6379
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
      - name: Login to Container Registry
        uses: docker/login-action@v2
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build and push Core API
        uses: docker/build-push-action@v4
        with:
          context: ./apps/core-api
          push: true
          tags: ghcr.io/plexica/core-api:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      - name: Build and push Frontend
        uses: docker/build-push-action@v4
        with:
          context: ./apps/web
          push: true
          tags: ghcr.io/plexica/frontend:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - name: Configure kubectl
        uses: azure/k8s-set-context@v3
        with:
          method: kubeconfig
          kubeconfig: ${{ secrets.KUBE_CONFIG }}
      - name: Deploy to Kubernetes
        run: |
          helm upgrade --install plexica ./plexica-helm \
            --set image.tag=${{ github.sha }} \
            --namespace plexica \
            --create-namespace
      - name: Verify deployment
        run: |
          kubectl rollout status deployment/core-api -n plexica
          kubectl rollout status deployment/frontend -n plexica
```

---

## Rollback Strategy

Per **Constitution Article 9.1**, rollback must be possible within 5 minutes:

| Strategy             | Method                                    | Time     |
| -------------------- | ----------------------------------------- | -------- |
| Helm Rollback        | `helm rollback plexica <revision>`        | < 2 min  |
| Image Tag Revert     | `kubectl set image deployment/core-api …` | < 1 min  |
| Feature Flag Disable | Toggle flag in configuration service      | < 30 sec |
| Database Rollback    | Backward-compatible migrations only       | N/A      |

### Rollback Procedure

1. **Detect**: Monitoring alerts trigger (error rate > 1%, P95 > 500ms)
2. **Decide**: On-call engineer evaluates impact and decides rollback vs. hotfix
3. **Execute**: `helm rollback plexica <previous-revision> --namespace plexica`
4. **Verify**: Confirm health checks pass and error rates normalize
5. **Post-mortem**: Document incident per Constitution Article 9.3

---

## Pre-Production Checklist

Per Technical Specifications Section 16:

- [ ] Database migrations tested and backward compatible
- [ ] Automated backups configured (PostgreSQL, MinIO)
- [ ] Monitoring and alerting active (Prometheus, Grafana)
- [ ] Rate limiting configured (Kong/Traefik + application-level)
- [ ] HTTPS/TLS enabled on all external endpoints
- [ ] Secrets managed via vault / AWS SSM Parameter Store
- [ ] Structured logging active (Pino JSON format)
- [ ] Health checks implemented (`/health`, `/ready`)
- [ ] Disaster recovery plan documented
- [ ] Security audit completed
- [ ] Load testing executed
- [ ] Documentation updated

---

## Target Operational Metrics

| Metric                    | Target   | Measurement Tool  |
| ------------------------- | -------- | ----------------- |
| API Response Time (P95)   | < 200ms  | Prometheus        |
| API Response Time (P99)   | < 1000ms | Prometheus        |
| Database Query Time (P95) | < 50ms   | Prometheus        |
| Availability              | 99.9%    | Uptime monitoring |
| Error Rate                | < 0.1%   | Log aggregation   |
| Tenant Provisioning Time  | < 30s    | Custom metric     |
| Plugin Install Time       | < 60s    | Custom metric     |
| Rollback Time             | < 5 min  | Runbook SLA       |

---

## Constitution Compliance

| Article  | Requirement                           | How Addressed                                       |
| -------- | ------------------------------------- | --------------------------------------------------- |
| Art. 5.2 | TLS required for data in transit      | Ingress TLS termination, internal mTLS planned      |
| Art. 5.2 | No secrets in Git                     | K8s Secrets + AWS SSM Parameter Store               |
| Art. 9.1 | Feature flags for user-facing changes | Feature flag service integrated with deployments    |
| Art. 9.1 | Rollback within 5 minutes             | Helm rollback + image tag revert                    |
| Art. 9.1 | Backward-compatible migrations        | Migration testing in CI, no breaking schema changes |
| Art. 9.2 | Health check endpoint at `/health`    | Liveness + readiness probes on all services         |
| Art. 9.2 | Structured JSON logging               | Pino JSON logger with tenant/trace context          |
| Art. 9.2 | Error rate > 1% triggers alert        | Prometheus alerting rules                           |
| Art. 9.3 | Post-incident review for P1/P2        | Incident response runbooks documented               |

---

## Related Documents

- [System Architecture](.forge/architecture/system-architecture.md) — Component overview, layer architecture, request flow
- [Security Architecture](.forge/architecture/security-architecture.md) — Authentication, authorization, tenant isolation security
- [ADR-001: Monorepo Strategy](.forge/knowledge/adr/adr-001-monorepo-strategy.md) — Turborepo + pnpm workspace decision
- [ADR-005: Event System](.forge/knowledge/adr/adr-005-event-system-redpanda.md) — Redpanda deployment rationale
- [ADR-006: Fastify Framework](.forge/knowledge/adr/adr-006-fastify-framework.md) — Backend framework choice
- [Spec 001: Multi-Tenancy](.forge/specs/001-multi-tenancy/spec.md) — Tenant isolation requirements
- [Product Roadmap](.forge/product/roadmap.md) — Phase timeline and deployment milestones
- [Constitution](.forge/constitution.md) — Articles 5 (Security), 9 (Operations)
- Source: `specs/FUNCTIONAL_SPECIFICATIONS.md` Section 13, `specs/TECHNICAL_SPECIFICATIONS.md` Sections 10, 15

---

_Converted to FORGE format from `specs/FUNCTIONAL_SPECIFICATIONS.md` (Section 13),
`specs/TECHNICAL_SPECIFICATIONS.md` (Sections 10, 15), and `docs/SECURITY.md`._
