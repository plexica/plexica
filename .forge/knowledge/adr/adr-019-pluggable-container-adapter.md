# ADR-019: Pluggable Container Adapter

> Architectural Decision Record documenting the design of a `ContainerAdapter`
> interface that abstracts container lifecycle operations (start, stop, health
> check, remove) behind a swappable implementation. Enables Docker for local
> development and single-host deployments, with a no-op adapter for testing,
> and a clear extension path toward Kubernetes. Created for Spec 004 Plugin
> System, Plan 004 §4.2.

| Field    | Value             |
| -------- | ----------------- |
| Status   | Accepted          |
| Author   | forge-architect   |
| Date     | 2026-02-24        |
| Deciders | Architecture Team |

---

## Context

Spec 004 (FR-001) requires each plugin to run in a **separate container**
with process isolation. The `PluginLifecycleService` must start, stop, and
health-check these containers as part of lifecycle transitions
(INSTALLED→ACTIVE on enable; ACTIVE→DISABLED on disable).

Currently, `PluginLifecycleService.runLifecycleHook()` is a **TODO stub**:
it updates the database status but performs no actual container operation.
This means no plugin isolation exists in practice.

The key design question is: **how should the lifecycle service interact
with container infrastructure?** Plexica targets three deployment
environments:

1. **Local development** — Docker Desktop / Docker Engine on a single host
2. **Staging/production (near-term)** — Docker Compose or Docker Swarm on
   managed VM clusters
3. **Production (future)** — Kubernetes (deferred per `planning/ROADMAP.md`
   Phase 5)

Hardcoding Docker API calls into `PluginLifecycleService` would make it
impossible to swap infrastructure later without invasive refactoring, and
would make unit testing require a live Docker daemon.

### Requirements Driving This Decision

| Req     | Summary                                                                   |
| ------- | ------------------------------------------------------------------------- |
| FR-001  | Each plugin runs in a separate container with process isolation           |
| FR-003  | Lifecycle transitions: INSTALLED→ACTIVE requires container start + health |
| NFR-004 | Plugin failure must not crash core platform (container isolation)         |
| NFR-005 | Plugins cannot bypass core security controls (network policies)           |
| NFR-007 | Support ≥20 plugins per deployment (independent container scaling)        |
| NFR-008 | Zero-downtime install/update (rolling updates, hot-swap)                  |
| Art. 8  | Unit tests must not require live Docker daemon (test isolation)           |

---

## Options Considered

### Option A: `ContainerAdapter` interface with pluggable implementations (chosen)

Define a TypeScript interface `ContainerAdapter` and inject it into
`PluginLifecycleService` via constructor. Provide two initial
implementations: `DockerContainerAdapter` (using `dockerode`) and
`NullContainerAdapter` (no-op for testing). Future adapters (e.g.,
`K8sContainerAdapter`) can be added without changing the service.

- **Pros**:
  - **Testable**: Unit tests inject `NullContainerAdapter` — no Docker
    daemon required. Test suite remains fast and deterministic.
  - **Swappable**: Docker → K8s migration is a single adapter swap
    behind the interface; `PluginLifecycleService` is unchanged.
  - **Constitution Art. 2.2 compliant**: `dockerode` is a single new
    dependency with >1k weekly downloads, TS types, no critical CVEs.
  - **Separation of concerns**: Lifecycle business logic stays in the
    service; infrastructure specifics stay in the adapter.
  - **Network policies enforceable per-adapter**: `DockerContainerAdapter`
    attaches containers to an isolated network; K8s adapter can apply
    NetworkPolicy manifests.
- **Cons**:
  - Introduces `dockerode` as a new dependency (requires ADR per Art.
    2.2 — this ADR serves that purpose).
  - Developers must understand which adapter is active in which
    environment; mitigated by environment-variable-driven selection at
    startup.

### Option B: Direct Docker SDK calls in `PluginLifecycleService`

Call `dockerode` directly inside `PluginLifecycleService` without an
interface layer.

- **Pros**:
  - Simpler — fewer abstractions
- **Cons**:
  - **Untestable without Docker**: Every unit test for lifecycle
    transitions would require a live Docker daemon or complex manual
    mocking. Violates Constitution Art. 8 (deterministic tests).
  - **K8s migration is invasive**: Swapping Docker for K8s would require
    modifying the lifecycle service itself, touching tested business
    logic.
  - **No test seam**: Cannot simulate `ContainerNotFound`, OOM kill, or
    health check timeout scenarios in unit tests.

### Option C: Shell out to Docker CLI (`child_process.exec`)

Invoke `docker run`, `docker stop`, `docker inspect` via Node.js
`child_process.exec`.

- **Pros**:
  - No new npm dependency (Docker CLI is already present in the host
    environment)
  - Shell commands are readable and debuggable
- **Cons**:
  - **Security risk**: Shell injection if plugin IDs or image names
    contain special characters. Would require strict sanitization.
  - **Brittle**: Parses CLI text output; breaks on Docker CLI version
    updates or locale changes.
  - **Async complexity**: Spawning child processes for every lifecycle
    event adds significant async complexity and error handling surface.
  - **Not testable**: Still requires Docker CLI in PATH during tests.
  - **No type safety**: No TypeScript types for CLI output; all
    parsing is string manipulation.

### Option D: Kubernetes API directly (skip Docker)

Use `@kubernetes/client-node` as the primary infrastructure layer,
deploying plugins as `Deployment` resources from day one.

- **Pros**:
  - Future-proof: K8s is the target production environment
  - Rich primitives: health probes, rolling updates, resource limits
    are native K8s concepts
- **Cons**:
  - **Overengineered for current scope**: Local development does not
    use Kubernetes. Setting up a local K8s cluster (minikube, kind) for
    plugin development adds significant friction.
  - **New dependency** (`@kubernetes/client-node`) that requires a
    running cluster for any test involving container operations.
  - **Constitution Art. 2**: K8s client is not in the approved stack and
    would require a constitutional amendment.
  - **Premature**: `planning/ROADMAP.md` defers K8s to Phase 5+.

---

## Decision

**Chosen option**: Option A — `ContainerAdapter` interface with
`DockerContainerAdapter` and `NullContainerAdapter` implementations.

### Interface Definition

```typescript
// File: apps/core-api/src/lib/container-adapter.ts

export interface ContainerConfig {
  image: string; // Docker image URL (from plugin manifest)
  pluginId: string; // Used as container name prefix
  env: Record<string, string>; // Environment variables (secrets injected here)
  resources: {
    cpu: string; // e.g. "0.5" (50% of one CPU core)
    memory: string; // e.g. "512m"
  };
  networkName: string; // Docker network for plugin isolation
}

export type ContainerHealth = 'healthy' | 'unhealthy' | 'starting' | 'not_found';

export interface ContainerAdapter {
  /**
   * Start a container for the given plugin.
   * Resolves when the container has started (not necessarily healthy).
   * Rejects if the image cannot be pulled or the container fails to start.
   */
  start(pluginId: string, config: ContainerConfig): Promise<void>;

  /**
   * Stop and remove the container for the given plugin.
   * Resolves when the container has fully stopped.
   * Does NOT delete plugin data — only the container process.
   */
  stop(pluginId: string): Promise<void>;

  /**
   * Check the health of a running plugin container.
   * Uses the container's built-in Docker health check if configured,
   * otherwise falls back to probing the plugin's /health endpoint.
   */
  health(pluginId: string): Promise<ContainerHealth>;

  /**
   * Remove the container image and associated resources.
   * Called during UNINSTALLING → UNINSTALLED transition.
   */
  remove(pluginId: string): Promise<void>;
}
```

### `NullContainerAdapter` (Testing & CI)

```typescript
// File: apps/core-api/src/lib/container-adapter.ts (same file)

export class NullContainerAdapter implements ContainerAdapter {
  async start(_pluginId: string, _config: ContainerConfig): Promise<void> {}
  async stop(_pluginId: string): Promise<void> {}
  async health(_pluginId: string): Promise<ContainerHealth> {
    return 'healthy';
  }
  async remove(_pluginId: string): Promise<void> {}
}
```

### `DockerContainerAdapter`

```typescript
// File: apps/core-api/src/lib/docker-container-adapter.ts

import Dockerode from 'dockerode';

export class DockerContainerAdapter implements ContainerAdapter {
  private docker: Dockerode;
  private readonly networkName: string;

  constructor(socketPath = '/var/run/docker.sock') {
    this.docker = new Dockerode({ socketPath });
    this.networkName = process.env.PLUGIN_NETWORK_NAME ?? 'plexica-plugins';
  }

  async start(pluginId: string, config: ContainerConfig): Promise<void> {
    // Pull image if not present
    await this.pullImage(config.image);
    // Create and start container with resource limits + network isolation
    const container = await this.docker.createContainer({
      name: `plexica-plugin-${pluginId}`,
      Image: config.image,
      Env: Object.entries(config.env).map(([k, v]) => `${k}=${v}`),
      HostConfig: {
        Memory: this.parseMemory(config.resources.memory),
        NanoCpus: Math.floor(parseFloat(config.resources.cpu) * 1e9),
        NetworkMode: config.networkName,
        RestartPolicy: { Name: 'on-failure', MaximumRetryCount: 3 },
      },
    });
    await container.start();
  }

  // ... stop(), health(), remove() implementations
}
```

### Dependency: `dockerode`

| Criterion             | Status                                   |
| --------------------- | ---------------------------------------- |
| Weekly downloads      | ~1.2M (npm, Feb 2026)                    |
| TypeScript types      | `@types/dockerode` (official)            |
| Known CVEs            | None critical or high (audited Feb 2026) |
| Constitution Art. 2.2 | ✅ Compliant                             |

`dockerode` is added to `apps/core-api/package.json` as a production
dependency. `@types/dockerode` is added as a dev dependency.

### Adapter Selection at Runtime

The active adapter is selected via environment variable at application
startup:

```typescript
// File: apps/core-api/src/lib/container-adapter.factory.ts

export function createContainerAdapter(): ContainerAdapter {
  const backend = process.env.CONTAINER_ADAPTER ?? 'null';
  switch (backend) {
    case 'docker':
      return new DockerContainerAdapter();
    case 'null':
    default:
      return new NullContainerAdapter();
  }
}
```

| `CONTAINER_ADAPTER` value | Usage                                          |
| ------------------------- | ---------------------------------------------- |
| `docker`                  | Local development with Docker Desktop; staging |
| `null` (default)          | CI, unit tests, environments without Docker    |

### `PluginLifecycleService` Integration

`PluginLifecycleService` receives the adapter via constructor injection:

```typescript
export class PluginLifecycleService {
  constructor(
    private readonly containerAdapter: ContainerAdapter = createContainerAdapter()
    // ... other dependencies
  ) {}

  async activatePlugin(pluginId: string): Promise<Plugin> {
    const plugin = await this.getPlugin(pluginId); // must be INSTALLED
    await this.transitionState(plugin, 'ACTIVE'); // validates transition

    const config = this.buildContainerConfig(plugin);
    await this.containerAdapter.start(pluginId, config);

    // Wait for health with timeout
    await this.waitForHealth(pluginId, { timeoutMs: 30_000 });

    // Register in service discovery
    await this.serviceRegistry.registerService(/* ... */);

    return this.updateLifecycleStatus(pluginId, 'ACTIVE');
  }
}
```

### Network Isolation

`DockerContainerAdapter` creates and manages a dedicated Docker bridge
network `plexica-plugins`. Plugin containers are attached to this network
and cannot reach the host network or core API services directly.
Plugin-to-core communication goes exclusively through the API gateway
endpoints exposed on the Docker network (FR-010).

---

## Consequences

### Positive

- **Unit tests are Docker-free**: `NullContainerAdapter` makes
  lifecycle tests fast, deterministic, and runnable in CI without a
  Docker daemon. Constitution Art. 8 test isolation is fully satisfied.
- **K8s migration is non-invasive**: A future `K8sContainerAdapter`
  implements the same interface. `PluginLifecycleService` is
  unchanged; only the factory function and environment variable change.
- **Security boundary enforced per adapter**: Network isolation is the
  adapter's responsibility. The `DockerContainerAdapter` attaches
  containers to an isolated bridge network by default. Centralized
  enforcement prevents plugins from accidentally reaching internal
  services.
- **Resource limits enforced per adapter**: CPU and memory limits from
  `ContainerConfig` are applied by the adapter (NFR-007, FR-017).
  The service layer passes manifest-declared limits; the adapter
  enforces them via Docker/K8s primitives.

### Negative

- **`dockerode` dependency**: Adds ~1.2MB to the production bundle.
  `@types/dockerode` adds to dev dependencies. Mitigated by the broad
  community usage and TypeScript support.
- **`NullContainerAdapter` hides real failures in development**: If a
  developer runs without `CONTAINER_ADAPTER=docker`, plugin containers
  are never actually started. The plugin will appear `ACTIVE` but
  invocations will fail. Mitigated by logging a startup warning when
  the null adapter is active in a non-test environment.
- **Docker socket security**: Mounting `/var/run/docker.sock` gives
  the core API process root-equivalent access to the Docker daemon.
  This is a known Docker-in-Docker security concern. Mitigated by:
  (1) running core API in a dedicated container with minimal other
  permissions; (2) restricting socket access to the core API service
  only via Docker socket proxy (e.g., Tecnativa/docker-socket-proxy)
  in production.

### Neutral

- **`K8sContainerAdapter` deferred**: Per `planning/ROADMAP.md`, K8s
  is a Phase 5 concern. The interface is designed to accommodate K8s
  semantics (async start, health probes, graceful stop) without
  requiring them now. When implemented, the K8s adapter will use
  `Deployment` + `Service` + `NetworkPolicy` resources.
- **Hot-swap during update**: NFR-008 (zero-downtime update) requires
  starting the new container before stopping the old. This is handled
  at the `PluginLifecycleService` level (start new → health check new
  → stop old), not in the adapter. The adapter's `start()` and
  `stop()` methods are atomic per container.

---

## Constitution Alignment

| Article | Alignment | Notes                                                                                                                                                                                                                                                         |
| ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1  | COMPLIANT | **Security First** (Art. 1.2.1): network isolation enforced in `DockerContainerAdapter`; plugins cannot bypass core controls (NFR-005). **Plugin System Integrity** (Art. 1.2.4): adapter enforces resource limits (FR-017) and container isolation (FR-001). |
| Art. 2  | COMPLIANT | **Dependency policy** (Art. 2.2): `dockerode` >1k weekly downloads, TS types, no critical CVEs; this ADR serves as the required approval record. `K8sContainerAdapter` deferred — would require a future ADR.                                                 |
| Art. 3  | COMPLIANT | **Service registry** (Art. 3.2): adapter integrates with `ServiceRegistryService` post-start. **Architecture type** (Art. 3.1): independent container per plugin aligns with microservices architecture.                                                      |
| Art. 4  | COMPLIANT | **Test coverage** (Art. 4.1): `NullContainerAdapter` enables ≥85% coverage of `PluginLifecycleService` without Docker. `DockerContainerAdapter` covered by integration tests in test-infrastructure.                                                          |
| Art. 5  | COMPLIANT | **No secrets in manifests** (NFR-006, Art. 5.3): secrets injected as `ContainerConfig.env` from secure vault/env vars, not from manifest JSONB.                                                                                                               |
| Art. 8  | COMPLIANT | **Deterministic tests** (Art. 8.2.1): `NullContainerAdapter` is synchronous and state-free — fully deterministic. **Independent tests** (Art. 8.2.2): no shared Docker state between tests.                                                                   |
| Art. 9  | COMPLIANT | **Fast rollback** (Art. 9.1.2): `stop()` + revert `lifecycleStatus` provides 5-minute rollback capability. **Health checks** (Art. 9.2.1): `health()` method proxies plugin `/health` endpoint.                                                               |

---

## Follow-Up Actions

- [ ] Add `dockerode` and `@types/dockerode` to `apps/core-api/package.json` (T004-06)
- [ ] Implement `ContainerAdapter` interface and `NullContainerAdapter` (T004-06)
- [ ] Implement `DockerContainerAdapter` with network isolation and resource limits (T004-07)
- [ ] Implement `createContainerAdapter()` factory function (T004-07)
- [ ] Wire adapter into `PluginLifecycleService` replacing `runLifecycleHook` stub (T004-08)
- [ ] Add `CONTAINER_ADAPTER` to `.env.example` with documentation
- [ ] Add startup warning log when `NullContainerAdapter` is active outside test environment
- [ ] Document Docker socket security in `docs/SECURITY.md` (Docker socket proxy recommendation)
- [ ] Update ADR README index with ADR-019 entry
- [ ] Add `K8sContainerAdapter` to technical debt backlog for Phase 5

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
```

## Related Decisions

- [ADR-003: Plugin Language Support](adr-003-plugin-language-support.md) —
  TypeScript plugins run in Docker containers; `ContainerConfig.image` is
  a TypeScript plugin image
- [ADR-005: Event System (Redpanda)](adr-005-event-system-redpanda.md) —
  plugin containers connect to Redpanda via the `plexica-plugins` Docker
  network
- [ADR-018: Plugin Lifecycle Status](adr-018-plugin-lifecycle-status.md) —
  adapter `start()`/`stop()`/`health()` drive the INSTALLED→ACTIVE and
  ACTIVE→DISABLED transitions defined in ADR-018
- Spec 004 FR-001, NFR-004, NFR-005: `.forge/specs/004-plugin-system/spec.md`
- Plan 004 §4.2: `.forge/specs/004-plugin-system/plan.md`
- Constitution Articles 1.2.1, 1.2.4, 2.2, 3.1, 4.1, 5.3, 8.2, 9.1

## References

- [`dockerode` on npm](https://www.npmjs.com/package/dockerode) — Docker
  Remote API client for Node.js
- [Docker Remote API](https://docs.docker.com/engine/api/) — underlying API
  used by `dockerode`
- [Tecnativa/docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) —
  recommended Docker socket security proxy for production
- [Kubernetes Node.js client](https://github.com/kubernetes-client/javascript) —
  reference for future `K8sContainerAdapter`
- `apps/core-api/src/services/plugin.service.ts` — `PluginLifecycleService`
  with `runLifecycleHook` stub (T004-08 target)
- `planning/ROADMAP.md` Phase 5 — Kubernetes migration timeline
