# ADR-015: Tenant Provisioning Orchestration Pattern

> Architectural Decision Record documenting the orchestration strategy for
> multi-step tenant provisioning with retry, backoff, and rollback.
> Created by the `forge-architect` agent via `/forge-adr`.

| Field    | Value                                                    |
| -------- | -------------------------------------------------------- |
| Status   | Accepted                                                 |
| Author   | forge-architect                                          |
| Date     | 2026-02-22                                               |
| Deciders | Backend Team, Architecture                               |
| Spec Ref | `.forge/specs/001-multi-tenancy/spec.md` (NFR-006, EC-1) |

---

## Context

Tenant provisioning in Plexica creates resources across four independent
external systems — PostgreSQL (schema), Keycloak (realm + clients + roles +
admin user), MinIO (bucket), and an email service (admin invitation). These
steps are **not transactional** — each is an independent side-effect that
cannot be wrapped in a single database transaction.

The current implementation (`apps/core-api/src/services/tenant.service.ts`)
executes provisioning steps sequentially with a single try/catch. On failure
it attempts a basic rollback (delete Keycloak realm only) but does not:

- Retry failed steps before giving up
- Roll back MinIO buckets, admin users, or Redis keys
- Track which step failed or how far provisioning progressed
- Expose step-level progress to the frontend

The spec mandates (NFR-006): "Retry failed step 3× with exponential backoff,
then rollback all created resources. Max provisioning time including retries:
< 90 seconds."

We need an orchestration pattern that handles:

1. Ordered step execution with dependency awareness
2. Per-step retry with exponential backoff (1s, 2s, 4s)
3. Reverse-order rollback of all previously completed steps on terminal failure
4. Step-level progress tracking for real-time UI feedback
5. Graceful handling of rollback failures (log + alert, no crash)
6. Total timeout enforcement (90 seconds)

## Options Considered

### Option A: Simple Sequential with Try/Catch (Current)

- **Description**: Execute steps in order inside a single try/catch block.
  On failure, attempt to clean up in the catch block. No retry logic.
- **Pros**:
  - Simple to understand and implement
  - Already partially implemented
- **Cons**:
  - No retry capability — transient failures cause immediate abort
  - Rollback is incomplete (only Keycloak realm, not MinIO/Redis/admin user)
  - No step-level progress tracking
  - No timeout enforcement
  - Violates NFR-006 (retry requirement)
- **Effort**: Low (already exists, but non-compliant)

### Option B: State Machine with Explicit Step Tracking (Chosen)

- **Description**: Define provisioning as an ordered array of step objects,
  each with `execute()` and `rollback()` methods. A `ProvisioningOrchestrator`
  walks the steps sequentially, retrying each failed step up to 3× with
  exponential backoff (1s, 2s, 4s). On terminal failure, it rolls back all
  completed steps in reverse order. Step status is persisted in the tenant's
  `settings.provisioningState` JSONB field for progress tracking.
- **Pros**:
  - Clean separation of concerns (each step is self-contained)
  - Deterministic retry and rollback behavior
  - Step-level progress enables real-time UI feedback
  - Timeout enforcement at orchestrator level
  - Rollback failures are isolated (one step's rollback failure doesn't
    prevent other rollbacks)
  - Testable — each step can be unit-tested independently
- **Cons**:
  - More code than Option A (~200 additional lines)
  - Step status polling adds minor API overhead
  - State machine adds conceptual complexity for new developers
- **Effort**: Medium

### Option C: Event-Driven Saga with Message Queue

- **Description**: Use the existing KafkaJS event bus to orchestrate
  provisioning as a distributed saga. Each step publishes a completion event;
  the next step subscribes to it. Compensating transactions handle rollback.
- **Pros**:
  - Fully decoupled steps
  - Natural fit for microservices architecture
  - Automatic retry via message redelivery
  - Scales horizontally
- **Cons**:
  - Significant complexity increase for a synchronous workflow
  - KafkaJS adds latency (message serialization, consumer group rebalancing)
  - Harder to enforce total timeout (90s)
  - Harder to track step-level progress in real-time
  - Over-engineered for provisioning (~10,000 tenants max)
  - Debugging distributed sagas is significantly harder
- **Effort**: High

## Decision

**Chosen option**: Option B — State Machine with Explicit Step Tracking

**Rationale**:

The state machine pattern provides the best balance of reliability,
observability, and implementation complexity for our use case. Provisioning
is inherently a sequential, synchronous workflow (each step depends on the
previous one's output — e.g., the admin user step needs the Keycloak realm
to exist). A state machine models this naturally.

The event-driven saga (Option C) is over-engineered for a workflow that
runs at most a few times per day and must complete within 90 seconds. The
current simple approach (Option A) violates NFR-006 and provides no
progress visibility.

### Implementation Details

**Step Definition Interface**:

```typescript
interface ProvisioningStep {
  name: string;
  label: string; // Human-readable for UI
  execute(context: ProvisioningContext): Promise<StepResult>;
  rollback(context: ProvisioningContext): Promise<void>;
}
```

**Step Execution Order**:

```
schema_created → keycloak_realm → keycloak_clients → keycloak_roles
    → minio_bucket → admin_user → invitation_sent → ACTIVE
```

**Retry Policy**:

- Max retries per step: 3
- Backoff schedule: 1000ms, 2000ms, 4000ms (exponential)
- Total timeout: 90 seconds (enforced via AbortController)
- Non-retryable errors: validation errors, duplicate slug (409)

**Rollback Policy**:

- On terminal failure: roll back all completed steps in reverse order
- Each rollback is attempted independently (one failure doesn't block others)
- Rollback failures are logged with full context and stored in
  `settings.provisioningError`
- Tenant status remains PROVISIONING with error details for manual cleanup

**Progress Tracking**:

- `settings.provisioningState` JSONB field stores:
  ```json
  {
    "steps": [
      { "name": "schema_created", "status": "complete" },
      { "name": "keycloak_realm", "status": "in-progress", "retryAttempt": 2 },
      { "name": "minio_bucket", "status": "pending" }
    ],
    "startedAt": "2026-02-22T10:00:00Z",
    "overallProgress": 25
  }
  ```
- Frontend polls `GET /api/v1/admin/tenants/:id` every 2 seconds during
  provisioning to read step status

**Invitation Email**:

- Per spec edge case #10: invitation email failure is **non-blocking**
- If email fails after 3 retries, provisioning still succeeds (status → ACTIVE)
- Warning logged; Super Admin can resend via UI

## Consequences

### Positive

- Full compliance with NFR-006 (retry + backoff + rollback + 90s timeout)
- Real-time provisioning progress in UI (per step status)
- Each step is independently unit-testable
- Rollback is comprehensive (all external systems cleaned up)
- Graceful degradation on rollback failure (log + alert, no crash)
- Clear error reporting for manual cleanup scenarios

### Negative

- ~200 lines of new orchestrator code + step implementations
- Polling-based progress adds minor API load (mitigated: 2s interval, single tenant)
- Step interface adds abstraction layer new developers must learn

### Neutral

- Invitation email remains non-blocking regardless of pattern choice
- Step order is fixed (no parallel execution needed at current scale)
- Existing Keycloak service methods can be reused; only wrapping changes

## Constitution Alignment

| Article | Alignment | Notes                                                                       |
| ------- | --------- | --------------------------------------------------------------------------- |
| Art. 1  | Supports  | Security-first: complete rollback prevents orphaned resources               |
| Art. 2  | Compliant | Uses approved stack only (PostgreSQL, Keycloak, MinIO, Redis)               |
| Art. 3  | Supports  | Layered architecture: orchestrator is a service-layer component             |
| Art. 4  | Supports  | Each step is independently testable; coverage target achievable             |
| Art. 5  | Supports  | Tenant isolation maintained during provisioning; rollback prevents leaks    |
| Art. 6  | Supports  | Errors classified (operational vs programmer); actionable error in settings |
| Art. 8  | Supports  | Step interface enables focused unit tests; orchestrator enables integration |
| Art. 9  | Supports  | 90s timeout + rollback supports zero-downtime; no orphaned partial tenants  |

## Follow-Up Actions

- [ ] Implement `ProvisioningOrchestrator` class in `apps/core-api/src/services/`
- [ ] Implement step classes (schema, keycloak, minio, admin-user, invitation)
- [ ] Add `provisioningState` type to tenant settings schema
- [ ] Update `createTenant` to use orchestrator instead of inline steps
- [ ] Add polling endpoint or extend GET tenant detail for progress
- [ ] Unit test each step's execute + rollback independently
- [ ] Integration test full provisioning flow (success + failure + rollback)

## Related Decisions

- ADR-002: Database Multi-Tenancy (schema-per-tenant pattern provisioned by this orchestrator)
- ADR-007: Prisma ORM (used for tenant record updates during provisioning)
- ADR-006: Fastify Framework (API layer exposing provisioning progress)

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
```
