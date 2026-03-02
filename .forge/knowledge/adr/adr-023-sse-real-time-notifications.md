# ADR-023: Server-Sent Events (SSE) for Real-Time Notification Delivery

> Architectural Decision Record documenting the choice of Server-Sent Events
> (SSE) over WebSocket and HTTP polling for real-time notification badge
> updates and job status counters in Spec 007 (Core Services).

| Field    | Value                                            |
| -------- | ------------------------------------------------ |
| Status   | Accepted                                         |
| Author   | forge-architect                                  |
| Date     | 2026-02-28                                       |
| Deciders | FORGE orchestrator, design-spec Open Question #2 |

---

## Context

Spec 007 (Core Services) introduces a **Notification Service** with in-app
notification delivery (FR-004, FR-005). The design spec for Spec 007 requires
the following real-time UI behaviors:

1. **Notification bell badge**: Badge count increments in real-time when a
   new in-app notification arrives (no page refresh).
2. **Notification dropdown**: When the dropdown is open and a new notification
   arrives via SSE, the new item slides in at the top.
3. **Job Status Dashboard** (FR-007): Running/Queued/Failed/Completed stat
   cards update live; table row status badges update when a job transitions
   state.

All three use cases involve **unidirectional data flow: server → client only**.
The client never needs to send data over the real-time channel — it reads
state. Mutations (mark as read, retry job) use the existing REST API.

### Constraints

- **Constitution Art. 2.1**: Approved stack is Fastify + Node.js + React.
  New dependencies require ADR approval and must have >1000 weekly downloads.
- **DD-002 (Deferred Decision)**: Real-time collaboration via WebSocket is
  explicitly deferred to Q2 2026 due to core platform stability priority.
  This ADR must not introduce WebSocket infrastructure ahead of that decision.
- **Redis is already in the stack** (Art. 2.1): Redis pub/sub can be used for
  broadcasting notifications from any service instance to the SSE handler.
- **Multi-instance deployment**: The notification service may run on multiple
  Node.js instances. The chosen approach must work in a horizontally-scaled
  environment.

---

## Options Considered

### Option A: Server-Sent Events (SSE)

- **Description**: The client opens a persistent HTTP connection to
  `GET /api/v1/notifications/stream`. The server pushes `text/event-stream`
  messages whenever a new notification is emitted. The `EventSource` browser
  API handles connection, auto-reconnect, and event parsing natively.
  Redis pub/sub broadcasts notification events from any service instance to
  the SSE handler, enabling multi-instance support.

- **Pros**:
  - **No new library needed**: `EventSource` is a native browser API.
    Server-side, Fastify can stream raw responses without any plugin.
  - **Unidirectional fit**: Exactly matches our use case (server → client
    notifications only). No bidirectional overhead.
  - **Auto-reconnect**: Browser `EventSource` automatically reconnects with
    exponential backoff on disconnect.
  - **HTTP/2 compatible**: HTTP/2 multiplexes SSE over a single TCP connection,
    avoiding the HTTP/1.1 6-connection-per-domain limit.
  - **Constitution compliant**: No new dependency required. Uses existing Fastify
    - Redis.
  - **Does not conflict with DD-002**: SSE is for push-only delivery.
    WebSocket (for collaboration) remains deferred to Q2 2026 as planned.
  - **Simple implementation**: ~50 lines of Fastify route handler + Redis
    subscriber.

- **Cons**:
  - Unidirectional only — client cannot send data over the SSE channel.
    (This is not a constraint for our use case; REST handles mutations.)
  - HTTP/1.1 clients are limited to 6 open SSE connections per domain.
    (Mitigated by HTTP/2 in production and by sharing one SSE connection
    per authenticated user session.)
  - Text-only (UTF-8). Binary payloads require base64 encoding.
    (Not needed for notification JSON payloads.)

- **Effort**: Low — native APIs on both sides; no new dependencies.
- **Risk**: Low — well-understood browser technology, widely deployed.

---

### Option B: WebSocket

- **Description**: Upgrade the HTTP connection to a WebSocket connection.
  Use the `ws` npm package (or `@fastify/websocket`) for the server-side
  handler. Client uses the native `WebSocket` browser API. Supports
  full-duplex bidirectional communication.

- **Pros**:
  - Bidirectional — allows server-push and client-send over the same channel.
  - Lower latency per message than SSE (no HTTP headers per message).
  - Good fit for future real-time collaboration (DD-002).

- **Cons**:
  - **Overkill for notifications**: Our use case is server → client only.
    Bidirectional capability is not needed and adds complexity.
  - **New dependency required**: `ws` or `@fastify/websocket` must be added
    and approved per Constitution Art. 2.2.
  - **Conflicts with DD-002**: Introducing WebSocket infrastructure now
    pre-empts the deliberate decision to defer WebSocket to Q2 2026.
    DD-002 deferred WebSocket precisely because of "core platform stability
    priority" — adding it for notifications contradicts that reasoning.
  - Manual reconnection logic required (no auto-reconnect in native
    `WebSocket` API; requires custom heartbeat + retry).
  - More complex connection lifecycle management (ping/pong, close codes).
  - Load balancer must support sticky sessions or WS-aware routing.

- **Effort**: Medium — new dependency, WS upgrade handling, reconnect logic.
- **Risk**: Medium — conflicts with DD-002; increases complexity before
  WebSocket architecture is formally decided for the platform.

---

### Option C: HTTP Short Polling

- **Description**: The client polls `GET /api/v1/notifications/unread-count`
  on a fixed interval (e.g., every 5–10 seconds) to check for new
  notifications. The badge count updates when the response changes.

- **Pros**:
  - **Simplest to implement**: Standard REST endpoint, no persistent connection.
  - Works through all proxies, firewalls, and load balancers without
    configuration.
  - No persistent server resources consumed per connected client.
  - Compatible with all HTTP/1.1 environments.

- **Cons**:
  - **High latency**: Notification delivery latency equals the polling interval
    (up to 10 seconds). The design spec requires near-real-time badge updates
    on notification arrival — this violates the UX requirement.
  - **Wasted requests**: 100% of poll requests return unchanged data in normal
    operation. At 1000 concurrent users polling every 5s = 200 requests/second
    of "nothing changed" traffic.
  - **No push semantics**: User sees a 0–10s lag before notification appears.
    For time-sensitive events (deal moved to Closed Won, job failed overnight),
    this degrades the UX significantly.
  - Poor fit for the Job Status Dashboard which shows live counters.

- **Effort**: Low — standard REST endpoint.
- **Risk**: Low technically, but **high UX risk** due to polling latency
  degrading the near-real-time experience required by the design spec.

---

### Option D: HTTP Long Polling

- **Description**: The client sends `GET /api/v1/notifications/poll` and
  the server holds the connection open until a notification arrives (or a
  timeout of 30s), then responds. The client immediately issues a new
  long-poll request.

- **Pros**:
  - Lower latency than short polling (notification delivered immediately
    when it arrives).
  - No persistent TCP connection (works through proxies without WS support).

- **Cons**:
  - **Ties up a Fastify worker thread** per connected client for up to 30s.
    With 1000 concurrent users, this exhausts the Node.js event loop quickly
    without special async handling.
  - **Complex server implementation**: Requires suspending the request handler,
    storing a promise/callback per pending connection, and cleanup on timeout.
  - Effectively re-implements SSE with higher complexity and worse DX.
  - Not meaningfully simpler than SSE while being inferior on every axis.

- **Effort**: High — complex async handling; not worth the cost vs. SSE.
- **Risk**: High — connection exhaustion at scale; not battle-tested in Fastify.

---

## Decision

**Chosen option**: **Option A — Server-Sent Events (SSE)**

### Rationale

SSE is the exact right tool for unidirectional server-push notification
delivery:

1. **Perfect use-case fit**: All three real-time requirements (notification
   badge, notification dropdown, job status counters) are server → client.
   SSE was designed precisely for this pattern.

2. **Zero new dependencies**: The browser `EventSource` API is native (no
   npm package needed). Fastify streams SSE via `reply.raw` (standard Node.js
   `http.ServerResponse` stream). Redis pub/sub — already in the approved
   stack — handles fan-out across service instances.

3. **DD-002 compliance**: WebSocket infrastructure for real-time
   collaboration is deliberately deferred to Q2 2026. SSE does not pre-empt
   or conflict with that decision; it serves a different concern (push
   notifications vs. collaboration).

4. **Constitution compliance**: No new dependency → no ADR amendment needed
   under Art. 2.2. Fastify + Redis are both approved (Art. 2.1).

5. **Auto-reconnect included**: `EventSource` reconnects automatically on
   disconnect. No custom heartbeat logic required on the client.

6. **HTTP/2 ready**: The production Plexica deployment will use HTTP/2 (Nginx
   or a load balancer in front of Fastify), which multiplexes SSE streams and
   eliminates the HTTP/1.1 6-connection limit.

### Implementation Architecture

```
Browser (EventSource)
  │
  │  GET /api/v1/notifications/stream
  │  Authorization: Bearer <token>
  │
  ▼
Fastify SSE Handler
  │  Validates JWT, extracts userId + tenantId
  │  Subscribes to Redis channel: notifications:{tenantId}:{userId}
  │  Keeps reply.raw stream open
  │
  ▼
Redis Pub/Sub
  │  Channel: notifications:{tenantId}:{userId}
  │  Published by: NotificationService.inApp() after DB insert
  │
  ▼
Any Fastify instance
  NotificationService.inApp(userId, message)
    1. Insert into notifications DB table
    2. PUBLISH notifications:{tenantId}:{userId} <json>
```

**SSE Event format**:

```
event: notification
data: {"id":"notif-123","type":"deal_update","title":"Deal moved to Closed Won","plugin":"crm","unreadCount":3,"timestamp":"2026-02-28T10:15:00Z"}

event: job_status
data: {"jobId":"job-abc","name":"crm.export-contacts","status":"FAILED","tenantId":"acme-corp"}

event: ping
data: {}
```

- Ping events sent every 30s to keep the connection alive through proxies.
- On reconnect, `EventSource` sends `Last-Event-ID` header; server replays
  any missed events from the last 5 minutes (Redis sorted set cache).

---

## Consequences

### Positive

- Near-real-time notification delivery (< 1s latency vs. 5–10s for polling).
- Zero new npm dependencies added to the project.
- Client-side auto-reconnect is free — no custom reconnection logic needed.
- Redis pub/sub fan-out enables horizontal scaling with no WS-specific
  infrastructure changes.
- Simple server implementation (~50 lines per endpoint handler).
- HTTP/2 eliminates connection limit concerns in production.

### Negative

- SSE connections are **long-lived HTTP connections**. Fastify must be
  configured with an appropriate `connectionTimeout` (or disabled) for SSE
  routes to prevent premature closure by the framework.
- Nginx/load balancer must set `proxy_read_timeout` to a value higher than
  the SSE ping interval (use ≥ 60s).
- HTTP/1.1 environments (older browsers, certain proxies) are limited to
  6 concurrent EventSource connections per domain. Mitigated by HTTP/2
  in production, but requires documentation for dev environments.

### Neutral

- When WebSocket is eventually implemented (DD-002, Q2 2026), SSE endpoints
  can remain for notification delivery (they serve different purposes). There
  is no need to migrate notification delivery to WebSocket.
- The `notifications:{tenantId}:{userId}` Redis channel naming convention
  becomes the standard for future real-time pub/sub patterns.

---

## Constitution Alignment

| Article                      | Alignment | Notes                                                                                                                                          |
| ---------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1.2 (Security)          | ✅        | SSE endpoint validates JWT + tenant context before subscribing to Redis channel. Tenant-scoped channel keys prevent cross-tenant data leakage. |
| Art. 2.1 (Tech Stack)        | ✅        | Fastify (approved), Redis/ioredis (approved). No new dependency. EventSource is a native browser API.                                          |
| Art. 2.2 (Dependency Policy) | ✅        | No new npm package added.                                                                                                                      |
| Art. 3.1 (Microservices)     | ✅        | SSE handler in core-api acts as gateway; Redis pub/sub decouples notification emission from delivery.                                          |
| Art. 3.4 (API Standards)     | ✅        | SSE endpoint follows REST naming (`/api/v1/notifications/stream`). Versioned. Requires Bearer auth.                                            |
| Art. 5.1 (Auth)              | ✅        | All SSE endpoints require authentication. Tenant context validated before channel subscription.                                                |
| Art. 5.2 (Tenant Isolation)  | ✅        | Redis channels scoped to `{tenantId}:{userId}` — cross-tenant delivery is architecturally impossible.                                          |

---

## Follow-Up Actions

- [ ] Add `GET /api/v1/notifications/stream` to Spec 007 API Requirements table (FR-004)
- [ ] Configure Fastify `connectionTimeout: 0` for SSE routes in `apps/core-api/src/modules/notification/`
- [ ] Set `proxy_read_timeout 65s` in Nginx config documentation
- [ ] Add Redis channel naming convention (`notifications:{tenantId}:{userId}`) to architecture docs
- [ ] Implement 5-minute replay window using Redis sorted set (missed events on reconnect)
- [ ] Update design-spec.md Open Question #2 — resolved by ADR-023

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
```

## Related ADRs

- **DD-002**: Real-time collaboration (WebSocket) deferred to Q2 2026 —
  SSE does not conflict with this deferred decision.
- **ADR-019** (Pluggable Container Adapter): Establishes pattern of pluggable
  adapters; future SSE adapters could follow the same pattern.
