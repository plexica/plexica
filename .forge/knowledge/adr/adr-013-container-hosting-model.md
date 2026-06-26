# ADR-013: Plugin Container Hosting Model

**Status**: Proposed
**Date**: 2026-06-26
**Deciders**: (pending team review)
**Driver**: DR-13 from Spec 004 (Plugin System) — Plugin Packaging & Hosting Model

## Context

Plexica v2's plugin system requires plugin backends (TypeScript, Rust, or Python) to run as isolated runtime environments alongside the core Fastify monolith. Each plugin installation for a tenant needs a dedicated backend process that:

- Receives proxied API calls from the core (`/api/v1/plugins/:installId/proxy/*`)
- Consumes Kafka events via a dedicated consumer group
- Maintains persistent database connections to tenant-scoped tables
- Supports health checks and circuit breaker monitoring
- Is isolated from other plugin backends and core infrastructure

The plugin package format is a **Docker container image** (per DR-13). The core platform must manage the full lifecycle: pull image, start container/process, health monitoring, stop, and remove — across two fundamentally different environments:

1. **Production**: Multi-node, multi-tenant, security-hardened — requires resource limits, health probes, self-healing, and namespace isolation.
2. **Development**: Single-developer local workstation — requires sub-second code-change feedback loops where container build/push/pull is impractical.

The core tension: containers provide necessary isolation for production but introduce a 1-5 minute build-push-pull cycle that destroys developer productivity. This ADR resolves the tension by defining two distinct hosting paths — containers for production/CI, local processes for rapid development — behind a unified `ContainerManager` abstraction.

## Decision

### 1. Strategy Pattern: `ContainerManager` Interface

A unified interface abstracts container lifecycle across all environments. Two implementations co-exist:

```typescript
interface ContainerManager {
  startContainer(installId: string, manifest: Manifest): Promise<ContainerInfo>;
  stopContainer(installId: string): Promise<void>;
  getContainerStatus(installId: string): Promise<ContainerStatus>;
  restartContainer(installId: string): Promise<void>;
}
```

| Environment | Implementation | Library | Mechanism |
|-------------|---------------|---------|-----------|
| Dev / CI    | `DockerContainerManager` | `dockerode` | `docker run --network plexica-dev_default -p 0:3000 {image}` |
| Production  | `KubernetesContainerManager` | `@kubernetes/client-node` | Create `Deployment` + `Service` in `plexica-plugins` namespace |

The active strategy is determined by `hosting.type` in the plugin's `manifest.json`:
- `"sidecar"` → `DockerContainerManager`
- `"kubernetes"` → `KubernetesContainerManager`

### 2. Docker Sidecar (Dev / Single-Node CI)

Used for local development, single-node CI, and small-scale deployments.

**Container lifecycle**:

| Operation | Command |
|-----------|---------|
| Start | `docker run -d --name plexica-plugin-{installId} --restart unless-stopped --network plexica-dev_default -p 0:3000 {image}:{tag}` |
| Stop | `docker stop plexica-plugin-{installId}` |
| Remove | `docker rm -f plexica-plugin-{installId}` |
| Status | `docker inspect plexica-plugin-{installId}` — exit code & health |

**Port allocation**: OS-assigned random port via `-p 0:3000`. The assigned port is stored in `plugin_container_config` immediately after container start. Reserved port range: `40000-40100` (configurable via `PLUGIN_PORT_RANGE`).

**Container naming**: `plexica-plugin-{installId}` — `installId` is a UUID, guaranteeing uniqueness even if two tenants run the same plugin slug.

**Network**: Joins `plexica-dev_default` bridge network (the same network as core-api in docker-compose), enabling container-to-container communication without port exposure to host.

### 3. Kubernetes Pods (Production)

Used for production multi-node deployments. The core platform manages plugin backends via the Kubernetes API — no Docker socket access in production.

```yaml
# Created by KubernetesContainerManager per plugin installation
apiVersion: apps/v1
kind: Deployment
metadata:
  name: plexica-plugin-{installId}
  namespace: plexica-plugins
  labels:
    plugin-install-id: "{installId}"
    tenant-slug: "{tenantSlug}"
spec:
  replicas: 1
  selector:
    matchLabels:
      plugin-install-id: "{installId}"
  template:
    metadata:
      labels:
        plugin-install-id: "{installId}"
    spec:
      containers:
      - name: plugin
        image: "{image}:{tag}"
        ports:
        - containerPort: {port}
        resources:
          limits: {cpu, memory}  # from manifest.hosting.resources
        env:
        - name: KAFKA_BROKERS
          valueFrom: ...
        - name: DATABASE_URL
          valueFrom: ...  # encrypted, per-installation
        livenessProbe:
          httpGet: { path: /_plexica/health, port: {port} }
        readinessProbe:
          httpGet: { path: /_plexica/ready, port: {port} }
---
apiVersion: v1
kind: Service
metadata:
  name: plugin-{installId}
  namespace: plexica-plugins
spec:
  type: ClusterIP
  selector:
    plugin-install-id: "{installId}"
  ports:
  - port: 80
    targetPort: {port}
```

Core API proxy routes to `http://plugin-{installId}:{port}/` (in-cluster DNS).

### 4. Plugin Rapid Development Mode (No Containers)

**For `NODE_ENV=development` only**: Plugin backend runs as a **local process**, not a container. This eliminates the entire container build → push → pull → start cycle.

**Why containers are wrong for development**: A plugin developer changes code every 30-60 seconds during active development. The 11-step plugin install flow (pull container, run migrations, start container, create consumer group, register actions, etc.) assumes a built container image in a registry. Running that cycle on every code change would make the feedback loop 1-5 minutes instead of < 500ms.

**Dev mode flow**:

1. **Start**: `pnpm dev` (generated by CLI) concurrently runs:
   - Vite dev server (port 4001) — UI hot reload via Module Federation HMR
   - `tsx watch backend/src/index.ts` (port 4002) — backend process auto-restart on file change (< 500ms)

2. **Register**: Plugin sends `POST /api/v1/dev/plugins/register` with:
   ```json
   {
     "slug": "my-plugin",
     "backendUrl": "http://localhost:4002",
     "uiUrl": "http://localhost:4001/remoteEntry.js",
     "extensionPoints": ["sidebar:admin"],
     "actions": [{ "key": "crm:contact:create", "defaultRole": "member" }],
     "events": { "subscribes": ["plexica.workspace.*"] },
     "declaredTables": ["crm_contacts", "crm_deals"]
   }
   ```

3. **Core processes registration**:
   - Validates slug uniqueness against installed plugins
   - Registers proxy route: `/api/v1/plugins/{slug}/proxy/*` → `http://localhost:4002`
   - Registers MF remote entry point in shell's dev watcher
   - Creates dev Kafka consumer group: `plugin-{slug}-dev`
   - Registers actions temporarily for dev ABAC evaluation

4. **Teardown** (Ctrl+C):
   - Plugin CLI sends `POST /api/v1/dev/plugins/unregister`
   - Core removes proxy route and MF remote
   - Core deletes dev Kafka consumer group
   - Core cleans up temporary action registrations
   - **Data tables are preserved** (no data loss on stop/restart)

| Aspect | Dev Mode | Production Install |
|--------|----------|-------------------|
| Backend runtime | Local process (`tsx watch`) | Docker container |
| UI delivery | Vite dev server (HMR) | MinIO static assets |
| Proxy target | `localhost:4002` | Container IP / K8s ClusterIP |
| DB setup | Manual (`pnpm migration:apply`) | Automatic (11-step flow) |
| DB credentials | Developer's local env | Encrypted per-plugin PostgreSQL role |
| Kafka consumer | `plugin-{slug}-dev` (shared) | `plugin-{installId}-{tenant}` (isolated) |
| Container build | **Never** | Required |
| Feedback loop | **< 500ms** (file change → restart) | **minutes** (build → push → pull → start) |
| State persistence | Tables survive stop/restart | Managed by lifecycle |

**Dev mode security constraints**:

- Dev registration endpoint returns **404 in production** (`NODE_ENV !== 'development'`)
- Accepts connections **from `localhost` only** (Fastify `loopback` host restriction)
- Dev Kafka consumer group uses `plexica-dev-` prefix to avoid collisions
- No persistent secrets created (no encrypted DB credentials, no registry credential storage)
- Plugin data tables use the developer's own DB credentials (not a restricted PostgreSQL role)
- **Single-developer only**: Not suitable for multi-tenant or shared dev environments

### 5. Additional Infrastructure

**New environment variables** (added to `services/core-api/src/lib/config.ts`):

| Variable | Default | Purpose |
|----------|---------|---------|
| `PLUGIN_CONTAINER_NETWORK` | `plexica-dev_default` | Docker network for plugin containers |
| `PLUGIN_PORT_RANGE_START` | `40000` | Start of reserved port range |
| `PLUGIN_PORT_RANGE_END` | `40100` | End of reserved port range |
| `PLUGIN_MAX_CONTAINERS_PER_HOST` | `50` | Cap on concurrent plugin containers |
| `PLUGIN_HEALTH_CHECK_INTERVAL_MS` | `30000` | Health check polling interval |
| `PLUGIN_CIRCUIT_BREAKER_THRESHOLD` | `3` | Consecutive failures before open |
| `PLUGIN_CIRCUIT_BREAKER_RESET_MS` | `30000` | Time before half-open probe |

**Docker Compose changes**: Port range `40000-40100` reserved for plugin sidecar containers. No new core services (plugin containers start dynamically on demand).

## Consequences

### Positive

- **Production isolation**: Kubernetes namespaces, resource limits, liveness/readiness probes, and self-healing ensure plugin backends cannot destabilize core or each other.
- **Single abstraction**: The `ContainerManager` interface allows the lifecycle service, proxy, health check, and event dispatcher to operate uniformly regardless of hosting strategy.
- **Developer productivity**: Dev mode sub-second feedback loop makes plugin development practical. Without it, developers would wait 1-5 minutes per code change — a non-starter for active development.
- **Graduated complexity**: Simple dev/CI setups use only Docker sidecar; production Kubernetes can be introduced when the deployment grows — no architecture change needed.
- **Deterministic port allocation**: OS-assigned random ports (`-p 0:3000`) eliminate port conflict risk entirely.

### Negative

- **Two code paths to maintain**: Both `DockerContainerManager` and `KubernetesContainerManager` must be kept in sync. Mitigated by the shared interface contract and unit tests that verify both implementations against the same lifecycle test suite.
- **Docker socket exposure in dev**: `DockerContainerManager` requires access to the Docker daemon. Mitigated by: (1) dev only — never used in production, (2) localhost-only access, (3) TCP with TLS in CI environments.
- **Dev mode diverges from production**: Local process mode runs without container isolation, resource limits, or restricted DB roles. Mitigated by: (1) explicit `NODE_ENV=development` gate, (2) documented limitations, (3) E2E tests in CI use container mode only.
- **Port management complexity**: The core must track assigned ports per container, handle cleanup on crashes, and detect stale port assignments. Mitigated by storing port in `plugin_container_config` and running periodic GC.
- **Dev DB credentials**: Local process mode uses the developer's own DB credentials rather than restricted PostgreSQL roles. This means dev mode has broader DB access than production, acceptable for single-developer workstations but not for shared environments.

### Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| R-13 Docker socket exposure | CRITICAL | LOW | Localhost-only in dev; TCP+TLS in CI; K8s API only in prod |
| R-14 Container port conflicts | MEDIUM | MEDIUM | OS-assigned random ports (`-p 0:3000`); port stored in config on start |
| R-11 Dev mode KB leak | MEDIUM | LOW | Dev data tables preserved; dev Kafka consumer uses isolated prefix |
| R-05 Plugin backend unavailable | MEDIUM | MEDIUM | Circuit breaker (3 failures → open → 30s → half-open); degraded UI |

## Alternatives Considered

### Lambda / Serverless Function Runtimes

Plugin backends are fundamentally stateful — they maintain database connection pools, Kafka consumer group state, and long-lived event subscriptions. Lambda cold starts would break the < 1s Kafka delivery latency requirement (NFR-03). Database connection pooling would need re-establishment per invocation. Additionally, Lambda's max execution timeout (15 minutes) conflicts with long-lived plugin operations.

**Rejected**: Wrong paradigm for stateful, connection-oriented plugin backends.

### Sidecar Always (Container in Dev Too)

Always using Docker containers, even in development, with volume mounts and `nodemon` for file watching inside the container. This avoids the two-code-path maintenance cost.

**Rejected** because:
- Still requires a Docker image build (even with caching, 15-30s minimum)
- Volume-mount-based hot reload is unreliable across macOS (osxfs), Linux (overlayfs), and Windows
- `nodemon` inside a container adds a second process layer on top of `tsx watch`
- Developers must manage Docker networking, volume mounts, and environment variables manually
- The feedback loop remains 15-60s vs < 500ms with local process

### Dev Mode with `docker run -v` + `tsx watch` in Container

Run the container with the source directory mounted as a volume and `tsx watch` as the entrypoint instead of the compiled image. This avoids the image build step while keeping containers.

**Rejected** because:
- Requires the container image to have all dev dependencies installed (TypeScript, tsx, node_modules)
- Container file system performance for volume mounts on macOS is significantly slower than native
- Debugging (breakpoints, VSCode attach) is more complex inside a container
- Still requires Docker running on the developer's machine (added requirement for plugin devs)
- The CLI-generated `dev-entry.ts` orchestrator is simpler and works without Docker CLI dependency

### Python/Rust-Specific Runtime Managers

Creating language-specific runtime managers (e.g., `PoetryRunManager`, `CargoRunManager`) for dev mode instead of the generic local process approach.

**Rejected** because: The local process approach (`tsx watch` for TypeScript, `uvicorn --reload` for Python, `cargo watch` for Rust) is already language-agnostic — the plugin developer chooses their own run command. The core API only needs a URL and health check endpoint. The SDK's OpenAPI contract ensures interoperability without language-specific runtimes.

## Related Decisions

| ADR | Relationship |
|-----|-------------|
| **ADR-003: ABAC Tree-Walk** | Plugin actions (DR-12) extend the ABAC engine with 3-part keys. The proxy injects `X-Plexica-User-Role` headers that the ABAC engine evaluates before routing to the plugin container. |
| **ADR-005: Module Federation Plugin UI** | Plugin UI is delivered via Module Federation (MinIO static assets), NOT from the plugin container. The container handles only API/event traffic. This separation means UI is unaffected by container restarts. |
| **ADR-006: Plugin Tables in Tenant Schema** | Plugin data tables live in tenant schemas, not in plugin containers. Containers access data via encrypted `DATABASE_URL` env vars with restricted PostgreSQL roles. |
| **ADR-014: Hybrid UI Delivery Model** (proposed) | UI assets are uploaded to MinIO at registration time, not served from containers. This ADR's container lifecycle is independent of UI delivery. |

### Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| Rule 5: ADR for Infrastructure | **COMPLIANT** | This ADR documents the container hosting model, which is an infrastructure change. |
| Security §1: Tenant Isolation | **COMPLIANT** | Plugin containers never share DB credentials. Dev mode uses developer's own credentials (single-user). |
| Security §2: Authentication | **COMPLIANT** | Dev registration endpoint gated by `NODE_ENV=development` and `localhost` only. Production uses K8s API. |
| Architecture: Plugins | **COMPLIANT** | Plugin backends communicate via HTTP contract. Docker containers are the packaging format. Consistent with constitution Art. 85. |
| Technology Stack | **COMPLIANT** | Docker and Kubernetes are within stack assumptions. `dockerode` and `@kubernetes/client-node` are new dependencies requiring this ADR. |

### References

| Document | Section | Reference |
|----------|---------|-----------|
| Spec 004 | §DR-13: Plugin Packaging & Hosting Model | Manifest `hosting.type`, sidecar vs K8s determination |
| Plan 004 | §10.1: Container Lifecycle Manager Strategy | Strategy pattern, Docker sidecar, K8s deployment |
| Plan 004 | §10.7: Plugin Rapid Development Mode | Dev mode flow, registration, teardown, comparison table |
| Plan 004 | §7.2 R-13: Docker socket exposure | Risk mitigation: localhost only in dev, K8s API in prod |
| Plan 004 | §7.2 R-14: Container port conflicts | Risk mitigation: OS-assigned random ports |
| Constitution | Rule 5 | Infrastructure changes require ADR |
