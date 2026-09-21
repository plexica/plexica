# ADR-035: Real-Time Notification Delivery (SSE)

> Architectural Decision Record. Created by `forge-architect` via `/forge-adr`.

| Field    | Value                                                           |
| -------- | --------------------------------------------------------------- |
| Status   | Accepted                                                      |
| Author   | forge-architect                                                 |
| Date     | 2026-09-17                                                      |
| Deciders | Plexica Team and user                                           |
| Spec     | `.forge/specs/006-cross-cutting-features/spec.md` (006-01…006-05) |
| Plan     | `.forge/specs/006-cross-cutting-features/plan.md` §3.2, §4, §5.1–5.3, §6.1 |
| Related  | ADR-001 (schema-per-tenant), ADR-002 (Keycloak multi-realm), ADR-004 (Kafka event bus + envelope), ADR-012 (rate limiting), ADR-016 (two-tier DLQ), ADR-033 (plugin SDK/CLI publishing) |

---

## Context

Spec 006-01…006-05 require real-time in-app notifications delivered to tenant
users the moment relevant events happen (workspace invites, plugin emissions),
plus email delivery for the same events. Four forces shape this decision:

1. **NFR latency**: SSE connection establishment must be **< 1 s** and
   notification delivery (event → UI) must be **< 2 s** (spec §NFR). This rules
   out poll-based delivery at any reasonable interval.
2. **No-new-dependency rule**: Constitution Rule 5 and AGENTS.md require an ADR
   for new core dependencies. Story E06-S001 pre-decided manual SSE on Fastify
   `reply.raw` specifically to avoid a dependency (and its ADR). This ADR
   formalizes that decision.
3. **New core entities (the actual ADR trigger)**: the tenant-schema
   `notifications` table **does not exist today** (only
   `user_profile.notification_prefs` JSONB) — it is a **new core entity**, an
   explicit ADR trigger per AGENTS.md governance. `core.email_queue` is a new
   core (cross-tenant) table. Both are confirmed in architecture.md §3.2 and
   planned in plan.md §4.1.
4. **GDPR tenant isolation + plugin extensibility**: notifications are tenant
   data and must live in the tenant schema (ADR-001); cross-tenant delivery is a
   critical security incident (Security §1). Plugins must emit notifications
   (006-05) via the published SDK (ADR-033) without spamming users (spec risk
   table: max 10/min per plugin per user).

The eventing backbone is already decided and reused, not re-derived: outbox →
Kafka (ADR-004, transactional outbox + tenant-key-encrypted envelopes) with a
two-tier DLQ (ADR-016) and Redis rate limiting (ADR-012). The invitation service
currently emits **no** outbox event; it must gain one (`plexica.workspace.invite`)
to trigger the flow.

## Options Considered

### Option A: Manual SSE on Fastify `reply.raw` (chosen)

- **Description**: Hand-rolled SSE on the Fastify raw response — `Content-Type:
  text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`,
  `X-Accel-Buffering: no`; events framed `event: notification\ndata: {json}\n\n`;
  heartbeat comment `:ping\n\n` every 20 s. A `ConnectionManager` keeps
  per-tenant pools with a per-user cap (5, oldest evicted) and cleanup on
  `close`/abort. Client uses fetch-based streaming (`ReadableStream`) so the
  Bearer token rides the Authorization header (no query-string token).
- **Pros**: Zero new dependency (no Rule 5 dependency-triggered ADR needed);
  full control of framing, heartbeat, and connection lifecycle; works with the
  existing Keycloak auth middleware and tenant-context middleware; unidirectional
  push matches the requirement exactly; HTTP/2-friendly; no TLS-WebSocket
  upgrade complexity.
- **Cons**: We own the edge cases (half-open sockets, proxy buffering, eviction);
  client-side reconnection must be implemented (`sse-client.ts` with backoff);
  horizontal scaling requires sticky sessions or a fan-out layer later (single
  node in dev/CI unaffected).
- **Effort**: Medium

### Option B: `@fastify/sse` plugin (or similar SSE library)

- **Description**: Use a maintained Fastify SSE plugin that wraps framing and
  connection handling.
- **Pros**: Less boilerplate; battle-tested framing; official-ish Fastify
  ecosystem.
- **Cons**: **New core dependency** → requires an ADR on the dependency axis
  anyway; plugin still does not give us per-tenant connection pools, per-user
  caps, or eviction — the `ConnectionManager` is needed regardless; API surface
  and version drift are another trust boundary; the SSE plugin's activity is
  irregular, adding supply-chain risk for a core path.
- **Effort**: Low-Medium

### Option C: WebSocket via `ws`

- **Description**: Bidirectional WebSocket channel (upgrade route + `ws`
  library) for real-time notifications.
- **Pros**: Bidirectional if we ever need client→server push; mature library;
  binary frames available.
- **Cons**: **New core dependency** (Rule 5 ADR required); overkill for
  unidirectional push — SSE is a strict subset of what we need; adds upgrade
  handshake, ping/pong protocol handling, and proxy/load-balancer upgrade
  configuration; no benefit for the NFRs (both can achieve < 1 s connect).
- **Effort**: High

### Option D: Polling

- **Description**: `GET /notifications?since=` polled on an interval (5–10 s).
- **Pros**: Trivially simple; no persistent connections; no new dependency.
- **Cons**: **Violates the delivery NFR** (< 2 s) at any sane interval; multiplies
  request/rate-limit load linearly; pushes work to every client instead of one
  server push; notification bell "real-time" feel is lost.
- **Effort**: Low (but fails the requirement)

### Option E: Redis Pub/Sub fan-out across replicas

- **Description**: Publish SSE events to Redis; each replica's `ConnectionManager`
  subscribes and pushes to its local connections — enabling multiple core-api
  replicas without sticky sessions.
- **Pros**: Removes the future horizontal-scaling pin; reuses existing Redis
  (no new infra dependency).
- **Cons**: **New delivery pattern now** with no current need (single-node dev/CI);
  adds Redis pub/sub failure modes and ordering concerns; the plan explicitly
  defers this to a future "sticky session / Redis pub-sub" decision (plan §14
  risk table). Rejected for now, re-evaluated when a second replica is real.
- **Effort**: High (deferred)

### Email delivery (sub-decision): direct send vs durable queue

| Alternative | Pros | Cons | Verdict |
| ----------- | ---- | ---- | ------- |
| **Direct `sendMailNow`** (current `lib/email.ts` sync path) | No new table; minimal change | Failed sends are lost or retried only in-process; no durable retry across restarts; spec risk table demands retry + dead-letter for email | Rejected — fails the "Email delivery reliability" risk mitigation |
| **`core.email_queue` outbox table + worker** | Durable retry (**4 attempts = 1 send + 3 retries**, 1s/4s/16s backoff), `sent`/`failed`/`dead` statuses, dead-letter logging, `tenant_id` FK for GDPR purge (ADR-016 pattern), testable against Mailpit | New core table (this ADR covers it); worker lifecycle to manage in bootstrap | **Chosen** — matches spec risk mitigation and ADR-016 conventions |

## Decision

**Chosen option**: Option A — **manual SSE on Fastify `reply.raw`** — plus a new
tenant `notifications` table, a new `core.email_queue` table, and one
notification Kafka consumer topology. Concretely:

1. **Transport**: `GET /api/v1/notifications/stream` is a long-lived,
   authenticated SSE route registered inside `tenantScope` (authMiddleware +
   tenantContextMiddleware + userProfileResolver). Connection establishment is
   rate-limited with the existing global per-user limit (preset
   `SSE_CONNECT_RATE_LIMIT`, 10/min/user); sustained delivery is push-only.
   A `ConnectionManager` (per-tenant pools, per-user cap **5** with oldest
   eviction, **20 s** heartbeat `:ping\n\n`, cleanup on `close`/abort) owns all
   open connections. Client is `apps/web/src/services/sse-client.ts` — fetch
   streaming (ReadableStream) with the Bearer token in the Authorization header,
   exponential-backoff reconnect, heartbeat-timeout detection.
2. **`tenant_{slug}.notifications`** (new tenant entity, Prisma
   `notification-models.prisma`): `id UUID PK`, `user_id UUID FK →
   user_profile.user_id NOT NULL`, `type VARCHAR(63)` (`workspace.invite`,
   `workspace.invite_accepted`, `plugin.{slug}.{type}`), `title VARCHAR(255)`
   (i18n key), `body TEXT NULL`, `metadata JSONB DEFAULT '{}'` (no PII),
   `read BOOLEAN NOT NULL DEFAULT false`, `created_at TIMESTAMPTZ NOT NULL
   DEFAULT now()`; index `(user_id, read, created_at DESC)`. Shape matches
   architecture.md §3.2.
3. **`core.email_queue`** (new core table): `id UUID PK`, `tenant_id UUID NULL
   FK → core.tenants.id` (GDPR purge), `to_address VARCHAR(255)`, `subject
   VARCHAR(255)`, `html_body TEXT`, `email_type VARCHAR(63)` (`workspace.invite`,
   `notification`), `status VARCHAR(16)` CHECK IN
   (`pending`,`sending`,`sent`,`failed`,`dead`), `attempts INTEGER DEFAULT 0`,
   `next_attempt_at TIMESTAMPTZ`, `last_error VARCHAR(512)` (bounded, no
   stack/PII), `created_at`, `sent_at`; index `(status, next_attempt_at)`.
   An in-process worker claims batches (SKIP LOCKED), sends via the existing
   `nodemailer` (`lib/email.ts` gains an `enqueueEmail` path; invitation email
   reroutes through the queue), retries 3× (1s/4s/16s — 4 attempts total = 1
   send + 3 retries), and dead-letter logs on exhaustion. Mailpit in dev/test.
4. **Event flow**: the invitation service gains one outbox enqueue (in the
   existing `withTenantDb` transaction): `plexica.workspace.invite` →
   `core.event_outbox` → leased publisher → Kafka. Consumer group
   `plexica-notification-consumer` subscribes to `plexica.workspace.invite`
   (core) **and** `plexica.notification` (plugin emissions and future core
   notifications). Per event: resolve the target user (by `userId` or by
   `email` → profile), read `notification_prefs`, decide channels (in-app vs
   email), insert the `notifications` row, SSE-push to the user's open
   connections, and enqueue email when the email channel is on. Failures retry
   3× via existing consumer machinery then flow to the ADR-016 DLQ — the
   notification is never silently dropped. No PII in the event payload (target
   email is the minimal required field; envelope is tenant-key encrypted per
   ADR-004).
5. **Plugin emission (006-05)**: `POST /api/v1/notifications/emit` in the
   `eventScope` (plugin service identity, mirrors `/events/emit`, verifies the
   plugin is installed). Redis counter `notif-rl:{tenantId}:{pluginSlug}:{userId}`
   enforces **10/min per plugin per user** (429 `RATE_LIMIT_EXCEEDED`) with a
   defense-in-depth **100/min per user** consumer cap. SDK gains
   `emitNotification(...)` → `POST /api/v1/notifications/emit`. The endpoint
   returns **`202 { status: "accepted", notificationId }`** (notificationId
   generated at emission; persistence + delivery async via the consumer) —
   settling the plan's `202 vs 200 queued` open choice in favor of the plan
   default (202-async with SSE delivery).
6. **No WebSocket**: SSE chosen because push is unidirectional, SSE requires no
   new dependency, and the NFRs are met. Notification preferences reuse the
   existing `user_profile.notification_prefs` JSONB with legacy-shape
   normalization (no new table).

## Consequences

### Positive

- Zero new core dependencies — Constitution Rule 5 satisfied on the dependency
  axis; only `nodemailer` (already present) is used for email.
- Real-time delivery meets both NFRs (connect < 1 s, delivery < 2 s) with a
  single server push instead of client polling.
- Full tenant isolation by construction: connection pools and notification rows
  are tenant-scoped; cross-tenant delivery is integration-tested.
- Notifications are durable (persisted row + outbox → Kafka → DLQ path, ADR-004
  + ADR-016) even if the SSE connection is down — the row is the source of
  truth and the center list catches up.
- Email becomes reliable and observable (`core.email_queue` statuses + retry +
  dead-letter logging), with a GDPR purge hook via `tenant_id`.
- Plugins get a first-class, rate-limited notification channel through the
  published SDK (ADR-033) — extensibility without spam risk.

### Negative

- We own SSE edge cases: half-open connection detection, proxy buffering
  (mitigated by `X-Accel-Buffering: no` + heartbeat), eviction semantics,
  client reconnect behavior. Covered by dedicated unit + integration tests.
- At-least-once Kafka delivery (ADR-004) can redeliver an event after a crash
  between row-insert and offset-commit, producing a **duplicate notification
  row**. Consumers must implement `eventId`-based idempotency (per ADR-004
  amendment) — mechanism (dedupe table or unique constraint) is an implementation
  detail for the consumer task, flagged in Follow-Up Actions.
- Horizontal scaling of SSE connections requires sticky sessions or a Redis
  pub/sub fan-out (Option E) once more than one core-api replica exists; a
  future decision, per plan §14. Single-node dev/CI is unaffected.
- Manual framing means a new maintainer must understand the SSE wire format;
  mitigated by isolating all framing in `sse.ts` (one file, < 200 lines).

### Neutral

- New tables in the expected schemas: `notifications` in tenant schemas
  (ADR-001), `email_queue` in `core` (cross-tenant infrastructure, same pattern
  as `core.dead_letter_queue`, ADR-016).
- Existing topics, envelope format, and Kafka infrastructure are unchanged
  (ADR-004); the consumer group is new but uses the standard consumer machinery.
- Email stays out-of-app (SMTP via Mailpit in dev; no in-app UI needed).

## Constitution Alignment

| Article | Alignment | Notes |
| ------- | --------- | ----- |
| Rule 1: E2E per feature | **Compliant** | 5 new E2E specs: `notification-sse`, `notification-center`, `notification-email`, `notification-prefs`, `plugin-notification` (plan §7.7). Real stack, no mocks of core services. |
| Rule 2: Green CI | **Compliant** | Unit + integration + E2E all blocking; NFR assertions wired to CI (plan §10.4). |
| Rule 3: One pattern per operation | **Compliant** | One SSE client, one notification module, one notification-prefs schema, TanStack Query for all new data fetching. |
| Rule 4: No file above 200 lines | **Compliant** | Notification module decomposed into 14 files (plan §6.1); framing isolated in `sse.ts`. |
| Rule 5: ADR for significant decisions | **Satisfied by this ADR** | New core entity (`notifications`), new core table (`email_queue`), and the real-time delivery pattern are documented before implementation. Plan §13 gates Phase 1 on this ADR. |
| Rule 6: English commit messages | **Compliant** | Commit messages in English (Italian catalog strings are data, not commit text). |
| Technology stack | **Compliant** | No new dependency (manual SSE; `nodemailer` already present). |
| Architecture: schema-per-tenant / events | **Compliant** | `notifications` in tenant schema (ADR-001); delivery reuses outbox → Kafka → DLQ (ADR-004, ADR-016); no new eventing infrastructure. |
| Architecture: monolith / Keycloak | **Compliant** | New module inside the Fastify monolith; SSE authenticated by existing Keycloak middleware; sessions/avatar sourced from Keycloak (ADR-002). |
| Security §1: tenant isolation | **Improved** | Per-tenant connection pools + tenant-scoped rows; cross-tenant delivery integration-tested (two-tenant E2E). |
| Security §2: authentication | **Compliant** | SSE token validated once at connect via Bearer header (fetch streaming, not `EventSource` — no token in query string / logs). |
| Security §3: SQL injection | **Compliant** | All queries via Prisma / parameterized SQL. |
| Security §4: input validation | **Compliant** | Zod on every new endpoint (`notification/schema.ts`: list, read, prefs, emit). |
| Security §5: secrets | **Compliant** | New `NOTIFICATION_*` env vars only in `config.ts`/`.env.example`; no secret defaults. |
| Security §6: PII | **Compliant** | Notification titles are i18n keys (no PII in rows or SSE payloads); `email_queue.to_address` redacted in logs; invite event payload carries only the target email (tenant-key encrypted, ADR-004); `last_error` bounded, no stack/PII. |

## Follow-Up Actions

- [x] **Review + accept this ADR** (Proposed → Accepted) — **Accepted 2026-09-17** by user (Plexica Team). Open points confirmed: `202 { status: "accepted", notificationId }` emit response; idempotency mechanism deferred to consumer task (`/forge-tasks`).
- [x] **Decision-log entry** (orchestrator): record ADR-035 acceptance in `.forge/knowledge/decision-log.md` with date + summary.
- [ ] **Migration** `<ts>_notifications_and_email_queue` (plan §4.4): tenant schema `notifications` + core schema `email_queue` via the existing `multi-schema-migrate` path (`tenant:migrate` / `db:migrate`). Additive; no backfill.
- [ ] **Consumer idempotency** (negative-consequence mitigation): define and implement `eventId`-based dedupe for notification persistence in `consumer.ts` (ADR-004 amendment requirement).
- [ ] **E2E specs** per Rule 1: `notification-sse.spec.ts` (delivery < 2 s, tenant isolation), `notification-center.spec.ts`, `notification-email.spec.ts` (Mailpit, retry + dead-letter), `notification-prefs.spec.ts`, `plugin-notification.spec.ts`.
- [x] **Implementation gate**: Phase 1 of plan 006 may start — ADR **Accepted** 2026-09-17 (plan §13 flag cleared).
- [ ] **Future decision (deferred)**: multi-replica SSE — sticky sessions vs Redis pub/sub fan-out (Option E), opened when a second core-api replica is planned (plan §14).
- [ ] ADR-036 (`prom-client`) is a **separate** ADR — do not bundle the observability decision here.

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
```

<!-- Update Status as the ADR moves through lifecycle. -->
**Accepted** (user sign-off, 2026-09-17). Decision log entry recorded (orchestrator).
