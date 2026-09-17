# Story: E06-S001 - Real-time notification infrastructure (SSE)

> User story for sprint implementation within an Epic.
> Created by the `forge-scrum` agent via `/forge-story`.

| Field    | Value             |
| -------- | ----------------- |
| Story ID | E06-S001          |
| Epic     | [E06 — Cross-Cutting](epic.md) |
| Sprint   | 6 (sprint story `006-01`) |
| Points   | 3                 |
| Priority | High              |
| Status   | Ready             |

---

## Description

**As a** tenant user,
**I want** to receive real-time in-app notifications over SSE the moment
relevant events happen (e.g. when I'm invited to a workspace),
**so that** I don't have to reload the page to see new activity.

This is the foundation story of Phase 1 — Notifications. Stories `006-02`
(notification center UI), `006-03` (email), `006-04` (preferences) and
`006-05` (plugin emission) all build on the SSE channel and the persisted
`notifications` model delivered here.

## Acceptance Criteria

- Given an authenticated tenant user, when they call `GET /api/v1/notifications/stream`,
  then an SSE connection is established in < 1 s and stays open with a heartbeat
  keepalive (spec 006-01 / NFR "SSE connection establishment < 1 s").
- Given a user with an open SSE connection, when a workspace invitation is created
  for them, then a notification event is delivered to the UI in < 2 s
  (spec 006-01 E2E scenario; NFR "Notification delivery event-to-UI < 2 s").
- Given two users in different tenants with open connections, when an event is
  emitted for one tenant, then only that tenant's user receives it — no
  cross-tenant delivery.
- Given a user who opens more than the per-user connection limit, when another
  connection is opened, then the oldest connection is closed and the cap is
  enforced (spec 006 risk mitigation: max connections per user).
- Given a delivered notification, when the SSE event is received, then the payload
  carries `notificationId`, `type`, `title`, `body`, `metadata`, `read`, `createdAt`
  matching the persisted row.
- Given a persisted notification, when it is delivered, then a row exists in
  `tenant_{slug}.notifications` with the correct `user_id` and `read = false`.

## Implementation Notes

- New feature module `services/core-api/src/modules/notification/` mirroring the
  existing module structure (`routes.ts`, `service.ts`, `repository.ts`, `schema.ts`,
  `types.ts`). Each file must stay under 200 lines (Constitution Rule 4).
- **No new core dependency**: implement SSE manually on Fastify `reply.raw` with
  `Content-Type: text/event-stream`. New core deps (`services/core-api/package.json`)
  require an ADR (Constitution Rule 5) and no SSE ADR exists — manual implementation
  avoids the ADR and a dependency.
- Connection manager with **per-tenant pools**, **per-user connection cap** (suggest 5),
  **heartbeat keepalive** (suggest 15-30 s comment), and cleanup on `close`/abort.
- Add the `notifications` model to the tenant Prisma schema
  (`services/core-api/prisma/tenant-schema/`), per architecture §3.2:
  `id UUID PK`, `user_id UUID FK → user_profile.user_id NOT NULL`, `type VARCHAR(63)`,
  `title VARCHAR(255)`, `body TEXT`, `metadata JSONB DEFAULT '{}'`, `read BOOLEAN
  DEFAULT false`, `created_at TIMESTAMPTZ DEFAULT now()`. Index per §3.3:
  `INDEX(user_id, read, created_at DESC)`. **The model does not exist yet** — only
  `notificationPrefs` on `user_profile` is present; migration required.
- Delivery path: reuse the existing outbox → Kafka pipeline
  (`lib/kafka.ts`, `events/outbox-publisher.ts`, `events/event-envelope.ts`).
  Domain events such as `workspace.invite` already flow through it (see
  `modules/invitation/`). Add a Kafka consumer in the notification module that
  (1) inserts into `notifications`, (2) pushes the SSE event to the user's open
  connections. Use the existing consumer machinery (`lib/kafka-consumer.ts`,
  `events/dlq-contract.ts`).
- Reuse `middleware/auth-middleware.ts` and `middleware/tenant-context.ts`. Guard
  the stream endpoint with the existing rate-limit config (`lib/rate-limit-config.ts`)
  to prevent connection spam.
- `title` may be an i18n key or resolved text (architecture §3.2) — persist
  key-based titles in this story; UI resolution lands with story `006-06`.
- No `console.log` — use the Pino logger (`lib/logger.ts`). No PII in logs or
  event payloads (AGENTS.md Security).
- **E2E (Constitution Rule 1)**: new spec `apps/web/e2e/notification-sse.spec.ts` —
  full-stack flow: invite user to workspace → user receives notification over SSE
  in < 2 s.
- Integration tests (Vitest) against the stream route with all middleware active,
  real Keycloak RS256 tokens, real DB — no mocks of core services (AGENTS.md
  testing rules).

## Tasks

1. `[M]` `[FR-006-01]` `[P]` Add `notifications` model + index to the tenant
   Prisma schema and generate the migration.
   - **Files**: `services/core-api/prisma/tenant-schema/core-models.prisma` (or new
     `notification-models.prisma`), migration under `services/core-api/prisma/tenant-schema/`
   - **Dependencies**: none
   - **Estimated**: 30 min - 2 h
2. `[M]` `[FR-006-01]` `[P]` Notification connection manager — per-tenant pools,
   per-user cap, heartbeat, cleanup on disconnect.
   - **Files**: `services/core-api/src/modules/notification/connection-manager.ts` (+ tests)
   - **Dependencies**: none (independent of schema)
   - **Estimated**: 30 min - 2 h
3. `[M]` `[FR-006-01]` SSE route `GET /api/v1/notifications/stream` with auth +
   tenant-context + rate limit, wired to the connection manager, registered in bootstrap.
   - **Files**: `services/core-api/src/modules/notification/{routes,service,schema,types}.ts`,
     module registration in `services/core-api/src/bootstrap.ts` (or equivalent)
   - **Dependencies**: task 2
   - **Estimated**: 30 min - 2 h
4. `[L]` `[FR-006-01]` Kafka consumer: subscribe to notification-relevant events,
   persist a `notifications` row, push the SSE event to the user's connections.
   - **Files**: `services/core-api/src/modules/notification/{consumer,repository}.ts`
   - **Dependencies**: tasks 1, 2, 3
   - **Estimated**: 2-4 h
5. `[M]` `[FR-006-01]` Integration tests: stream endpoint (connection < 1 s,
   unauthenticated → 401, tenant isolation), consumer persistence + delivery (< 2 s).
   - **Files**: `services/core-api/src/modules/notification/__tests__/`
   - **Dependencies**: task 4
   - **Estimated**: 30 min - 2 h
6. `[L]` `[FR-006-01]` E2E test `notification-sse.spec.ts` — invite flow delivers
   a notification over SSE in < 2 s (Constitution Rule 1).
   - **Files**: `apps/web/e2e/notification-sse.spec.ts`
   - **Dependencies**: task 4
   - **Estimated**: 2-4 h
7. `[S]` `[FR-006-01]` Unit tests for rate-limit guard and connection-cap eviction.
   - **Files**: alongside tasks 2-3 test files
   - **Dependencies**: tasks 2, 3
   - **Estimated**: < 30 min

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] Unit tests written and passing
- [ ] Integration tests written and passing
- [ ] Code passes `/forge-review` adversarial review
- [ ] No HIGH severity findings unresolved
- [ ] Code follows constitution conventions (Rule 4: no file > 200 lines)
- [ ] Documentation updated (if user-facing changes)
- [ ] PR created with spec/story reference (`006-01` / `E06-S001`)

## Dependencies

| Dependency           | Type              | Status            |
| -------------------- | ----------------- | ----------------- |
| E02 — Foundations (auth, tenant context) | Story | done |
| E03 — Core Features (workspace invite event source) | Story | done |
| E06-S002…S005 (notification center, email, prefs, plugin) | Story | depend on this story |

---

## Cross-References

| Document             | Path                                           |
| -------------------- | ---------------------------------------------- |
| Epic                 | `.forge/epics/epic-06-cross-cutting/epic.md`   |
| Architecture         | `.forge/architecture/architecture.md` (§2.2, §3.2, §3.3, §4.1, §5.2) |
| Product Brief        | `.forge/product-brief.md`                      |
| Sprint Status        | `.forge/sprints/active/sprint-006.yaml` (story `006-01`) |
| Spec                 | `.forge/specs/006-cross-cutting-features/spec.md` (§6.1, 006-01) |

> Note: `.forge/product/prd.md` does not exist in this repo; the product brief
> at `.forge/product-brief.md` is the product-level reference.