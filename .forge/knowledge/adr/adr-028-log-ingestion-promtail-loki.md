# ADR-028: Log Ingestion via Promtail Sidecar to Loki

> Architectural Decision Record documenting the log aggregation topology
> for the Plexica platform. Resolves Spec 012 Open Question OQ-002: how
> plugin container logs reach the Loki log aggregation backend.

| Field    | Value                                              |
| -------- | -------------------------------------------------- |
| Status   | Accepted                                           |
| Author   | forge-architect                                    |
| Date     | 2026-03-07                                         |
| Deciders | FORGE orchestrator, Spec 012 architecture planning |

---

## Context

Spec 012 (Plugin Observability) FR-016 through FR-019 require structured
JSON logs from all plugin containers and the core API to be forwarded to
Loki for centralised log aggregation, search, and log-trace correlation.

### Current State

- All Plexica services (core API, plugin containers) emit **Pino JSON logs**
  to stdout (Constitution Art. 6.3).
- Docker captures stdout/stderr via its default `json-file` logging driver
  and stores them at `/var/lib/docker/containers/<id>/<id>-json.log`.
- There is **no** log aggregation infrastructure — logs are only accessible
  via `docker logs <container>`.
- `docker-compose.yml` has no Loki, Promtail, or Fluentd services.

### Forces

1. **No host-level Docker config changes**: The solution must work with
   `docker-compose up` alone — operators should not need to install Docker
   plugins or modify the Docker daemon configuration.
2. **Label extraction**: Loki requires labels (`service`, `level`, `tenant_id`)
   for efficient querying. These must be extracted from Pino JSON fields.
3. **Log-trace correlation**: Log entries must include `traceId` for joining
   logs with distributed traces in Grafana (FR-019).
4. **Reliability**: Logs are diagnostic data. It is acceptable to drop logs
   under extreme back-pressure rather than impacting container performance.
5. **Docker-compose scope**: Kubernetes DaemonSet patterns are out of scope.

---

## Options Considered

### Option A: Promtail Sidecar in Docker Compose (Chosen)

Run Promtail as a Docker Compose service that reads container log files from
a volume-mounted Docker log directory.

```
┌────────────┐  stdout  ┌──────────────────┐  volume mount  ┌───────────┐  HTTP push  ┌──────┐
│ Plugin     │─────────▶│ Docker json-file  │◄──────────────│ Promtail  │────────────▶│ Loki │
│ Container  │          │ logging driver    │               │ sidecar   │             │      │
└────────────┘          └──────────────────┘               └───────────┘             └──────┘
                         /var/lib/docker/containers/        Reads JSON logs
                         (default Docker behavior)          Extracts labels
```

**Configuration**:

```yaml
# docker-compose.yml (service definition)
promtail:
  image: grafana/promtail:3.3.0
  volumes:
    - /var/lib/docker/containers:/var/lib/docker/containers:ro
    - /var/run/docker.sock:/var/run/docker.sock:ro
    - ./infrastructure/observability/promtail/promtail.yml:/etc/promtail/config.yml:ro
  depends_on:
    - loki
```

**Promtail config** (`infrastructure/observability/promtail/promtail.yml`):

```yaml
server:
  http_listen_port: 9080

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        target_label: 'container'
      - source_labels: ['__meta_docker_container_label_com_docker_compose_service']
        target_label: 'service'
    pipeline_stages:
      - docker: {}
      - json:
          expressions:
            level: level
            msg: msg
            traceId: traceId
            tenantId: tenantId
      - labels:
          level:
          service:
      - tenant:
          source: tenantId
```

- **Pros**:
  - Zero host-level Docker config changes — works with default `json-file` driver
  - `docker_sd_configs` auto-discovers all containers in the Docker daemon
  - Pipeline stages parse Pino JSON and extract labels (`level`, `service`, `tenantId`)
  - Promtail handles back-pressure, retries, and position tracking (no log re-reading after restart)
  - Well-documented, widely deployed pattern in Grafana ecosystem
  - Docker socket access provides container metadata (names, labels) for enrichment
  - Read-only volume mounts — Promtail cannot modify container logs

- **Cons**:
  - Requires Docker socket access (read-only) — slight security surface
  - Additional Docker service (~50 MB RAM)
  - Slight lag between log emission and Loki ingestion (~2-5 seconds)
  - Position file must persist across Promtail restarts to avoid re-ingesting

- **Effort**: Low (standard Promtail config)
- **Risk**: Low — well-established pattern

---

### Option B: Loki Docker Logging Driver (Rejected)

Install the Loki Docker logging driver plugin and configure each container
to use it.

```yaml
# Per-container logging config
logging:
  driver: loki
  options:
    loki-url: 'http://loki:3100/loki/api/v1/push'
    loki-external-labels: 'service={{.Name}}'
```

- **Pros**:
  - Direct push from Docker daemon to Loki — no intermediate process
  - Lower latency (logs sent as they're generated)
  - No volume mounts needed

- **Cons**:
  - **Requires host-level Docker plugin installation**: `docker plugin install grafana/loki-docker-driver:3.3.0 --alias loki --grant-all-permissions`. This is NOT possible with `docker-compose up` alone.
  - Known issues with log ordering (Docker daemon batches logs, may reorder)
  - Known issues with container startup delays when Loki is unavailable
  - `docker logs` command no longer works (logs are sent to Loki, not stored locally)
  - Logging driver failures can block container stdout (unless `mode=non-blocking` configured)
  - Cannot parse Pino JSON fields for label extraction — only container-level labels

- **Effort**: Medium (requires operator action outside docker-compose)
- **Risk**: Medium — host-level changes, log ordering issues

**Rejected** because it requires Docker plugin installation outside
`docker-compose up`, which violates the self-contained development
environment principle.

---

### Option C: Fluentd / Fluent Bit Forwarder (Rejected)

Use Fluent Bit as a lightweight log forwarder, reading Docker logs and
pushing to Loki via the Loki output plugin.

- **Pros**:
  - Extremely lightweight (~15 MB RAM)
  - Rich filter/parser pipeline
  - Can also forward to Elasticsearch, S3, etc.

- **Cons**:
  - New dependency not in Grafana ecosystem — Promtail is purpose-built for Loki
  - Loki output plugin requires separate installation
  - More complex configuration than Promtail for Loki-specific use case
  - Label extraction for Loki is less ergonomic than Promtail's pipeline stages

- **Effort**: Medium
- **Risk**: Low, but unnecessary complexity when Promtail exists

**Rejected** because Promtail is purpose-built for Loki and simpler to
configure for this exact use case.

---

## Decision

**Use Promtail as a Docker Compose sidecar service that reads container JSON
log files via volume mount and pushes to Loki.** Docker socket access
(read-only) enables automatic container discovery via `docker_sd_configs`.

### Label Extraction Strategy

Pino JSON logs from Plexica services include these fields:

```json
{
  "level": 30,
  "time": 1709827200000,
  "msg": "Request completed",
  "traceId": "abc123",
  "tenantId": "acme-corp",
  "requestId": "req-456"
}
```

Promtail's `json` pipeline stage extracts `level`, `traceId`, and `tenantId`
from the JSON body. Only `level` and `service` (from Docker Compose service
label) are promoted to Loki index labels — all other fields remain in the
log line for full-text search.

**Why not promote `tenantId` to a label?** High-cardinality labels
(potentially thousands of tenants) degrade Loki performance. Instead,
`tenantId` is extracted as a structured field and queried via
`{service="core-api"} | json | tenantId="acme-corp"`.

### Log-Trace Correlation

The Pino logger is enriched with `traceId` and `spanId` from the
OpenTelemetry context (via the trace-context middleware, FR-019). Grafana's
"Derived Fields" configuration in the Loki data source links `traceId` to
Tempo traces, enabling one-click navigation from log line to trace waterfall.

---

## Consequences

### Positive

- **Self-contained**: `docker-compose up` brings up the entire log pipeline —
  no operator action needed.
- **Standard pattern**: Promtail + Loki is Grafana's recommended log stack,
  with extensive documentation and community support.
- **`docker logs` still works**: The default `json-file` driver is preserved,
  so `docker logs <container>` continues to work for quick debugging.
- **Auto-discovery**: New plugin containers are automatically discovered and
  their logs ingested — no config changes needed per plugin.

### Negative

- **Docker socket access**: Promtail needs read-only access to
  `/var/run/docker.sock` for container discovery. This is a standard pattern
  but grants Promtail visibility into all Docker API operations. Mitigated
  by read-only mount.
- **Log ingestion latency**: ~2-5 seconds between log emission and Loki
  queryability (NFR-007 target: <10s). Acceptable for diagnostic use.
- **Disk space**: Docker's `json-file` driver stores logs locally AND
  Promtail pushes to Loki — logs are temporarily stored twice. Mitigated
  by Docker's default log rotation (`max-size: 10m`, `max-file: 3`).

### Neutral

- Promtail's position file (`/tmp/positions.yaml`) should use a Docker volume
  for persistence across restarts. Without it, Promtail re-reads recent logs
  on restart (safe but wastes Loki ingestion bandwidth).

---

## Constitution Alignment

| Article                      | Alignment | Notes                                                                                                                     |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------- |
| Art. 6.3 (Logging Standards) | ✅        | Pino JSON logs with required fields (timestamp, level, message, requestId, userId, tenantId) are preserved and forwarded. |
| Art. 5.2 (No PII in Logs)    | ✅        | Promtail does not add PII. Log content is determined by Pino configuration (Art. 6.3 §4 already prohibits PII).           |
| Art. 9.2 (Centralized Logs)  | ✅        | Delivers the "structured logging to centralized logging platform" requirement.                                            |
| Art. 2.2 (Dependency Policy) | ✅        | Promtail and Loki are Docker images (infrastructure), not npm packages. Art. 2.2 applies to npm packages only.            |

---

## Follow-Up Actions

- [ ] Add Loki service to `docker-compose.yml` (T012-03)
- [ ] Add Promtail service to `docker-compose.yml` (T012-03)
- [ ] Create Loki config at `infrastructure/observability/loki/loki.yml` (T012-03)
- [ ] Create Promtail config at `infrastructure/observability/promtail/promtail.yml` (T012-03)
- [ ] Enrich Pino logger with `traceId`/`spanId` (T012-14, depends on ADR-026)
- [ ] Configure Grafana Loki data source with Derived Fields for trace linking (T012-04)

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
```

## Related Decisions

- **ADR-026**: OpenTelemetry direct export — provides the `traceId` that
  Promtail extracts for log-trace correlation.
- **ADR-021**: Pino structured logging in frontend — establishes Pino as the
  logging standard. This ADR extends the pipeline to centralised aggregation.
- **Spec 012 OQ-002**: This ADR resolves the Open Question.
- **Constitution Art. 6.3**: Logging standards that define the JSON schema
  Promtail parses.
