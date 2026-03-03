# ADR-024: Application-Level Team Member Roles vs Keycloak RBAC

> Architectural Decision Record documenting the relationship between the
> application-level `team_members.role` column (OWNER | ADMIN | MEMBER |
> VIEWER) and Keycloak realm roles. Resolves CRITICAL finding C-201 from
> `/forge-analyze` of Spec 008 (Admin Interfaces) identifying dual role
> system confusion risk.

| Field    | Value                                                    |
| -------- | -------------------------------------------------------- |
| Status   | Accepted                                                 |
| Author   | forge-architect                                          |
| Date     | 2026-03-02                                               |
| Deciders | FORGE orchestrator, forge-analyze C-201 critical finding |

---

## Context

Spec 008 (Admin Interfaces), plan.md §5.7, introduces a `team_members`
table in each tenant schema with a `role` column using an application-level
enum: `OWNER | ADMIN | MEMBER | VIEWER`. This table enables team management
within a tenant (FR-010: "Team management: CRUD teams, member management,
role assignment").

The spec itself (FR-010, FR-011) does not explicitly define the relationship
between this application-level role and the Keycloak realm roles that govern
platform authentication and authorization. This gap was flagged as **C-201
(CRITICAL)** during `/forge-analyze` because:

1. **Dual role systems create authorization confusion**: Developers and
   administrators must understand which role system governs which access
   decision. Without clear documentation, service methods may check the
   wrong role source, creating privilege escalation vectors.

2. **Privilege escalation risk**: If a user has `team_members.role = ADMIN`
   but their Keycloak realm role is `TENANT_MEMBER`, which authority wins?
   Without an explicit subordination rule, the more permissive role could
   be used, bypassing Keycloak's security boundary.

3. **Synchronization burden**: If a Keycloak administrator demotes a user's
   realm role (e.g., from `TENANT_ADMIN` to `TENANT_MEMBER`), the
   `team_members.role` rows are not automatically updated. Stale elevated
   app-level roles create a window of unintended privilege.

### Constitutional Constraints

- **Article 5.1.1**: "Keycloak for all authentication and identity
  management" — Keycloak is the sole authentication authority.
- **Article 5.1.3**: "RBAC: Role-based access control for all protected
  resources" — Keycloak RBAC controls endpoint access.
- **Article 5.1.5**: "Tenant context validated on every request" — tenant
  isolation is enforced at the middleware level via Keycloak token.
- **Article 1.2.1**: "Security First — No feature ships without security
  review" — dual role systems require explicit security architecture.

### Relationship to Existing Authorization Architecture

- **ADR-002** (Database Multi-Tenancy): Schema-per-tenant isolation means
  `team_members` rows exist only within a tenant schema. Cross-tenant team
  role confusion is architecturally impossible at the data layer.
- **ADR-017** (ABAC Engine): The ABAC engine operates on `user.*` attributes
  extracted from the JWT (i.e., Keycloak claims). If `team_members.role` is
  used as a `resource.*` attribute in ABAC policies, its subordination to
  Keycloak realm roles must be documented and enforced.

---

## Options Considered

### Option A: Keycloak-Only Roles (No Application-Level Roles)

- **Description**: Remove `team_members.role` entirely. All role-based
  access decisions use only Keycloak realm roles (`SUPER_ADMIN`,
  `TENANT_ADMIN`, `TENANT_MEMBER`). Team membership is a boolean
  relationship (user is in team or not), with no granularity.

- **Pros**:
  - Single source of truth for all roles — no dual-system confusion
  - No synchronization burden
  - Keycloak admin console provides full visibility into user roles

- **Cons**:
  - **Keycloak realm roles are too coarse**: They control platform-level
    access (which endpoints can be called), not within-tenant
    organizational hierarchy. There is no Keycloak concept of "team owner
    who can rename the team" vs. "team viewer who can only list members."
  - **Keycloak role explosion**: Modeling per-team granularity in Keycloak
    would require creating realm roles like `team_{teamId}_admin` for
    every team — this does not scale and violates Keycloak's intended
    usage pattern for realm roles.
  - **Violates FR-010**: The spec requires "role assignment" within team
    management. Boolean membership does not satisfy this requirement.

- **Effort**: Low (remove column), but breaks spec compliance.
- **Risk**: High — cannot satisfy FR-010 without team-level role granularity.

---

### Option B: Application-Only Roles (No Keycloak Gating)

- **Description**: All authorization decisions (both platform-level and
  team-level) are handled by the application's `team_members.role` column
  and custom middleware. Keycloak is used only for authentication (JWT
  issuance), not for RBAC decisions.

- **Pros**:
  - Single role system — the application owns all authorization logic
  - Maximum flexibility in role definition and hierarchy
  - No Keycloak role management complexity

- **Cons**:
  - **Violates Constitution Art. 5.1**: Keycloak is mandated for RBAC, not
    just authentication. Removing Keycloak RBAC requires a constitutional
    amendment.
  - **Bypassable**: If Keycloak middleware does not enforce endpoint-level
    RBAC, any authenticated user could call any endpoint. The app-level
    role check is a second layer that can be forgotten or miscoded in new
    routes.
  - **Security regression**: Keycloak provides battle-tested RBAC
    enforcement, token expiry, and session management. Replicating this in
    application code is error-prone.
  - **Contradicts ADR-017**: The ABAC engine assumes Keycloak RBAC runs
    first as a prerequisite (`RBAC ALLOW → ABAC evaluation`). Removing
    Keycloak RBAC breaks the ABAC flow.

- **Effort**: High — rewrites authorization architecture.
- **Risk**: Critical — constitutional violation; security regression.

---

### Option C: Hybrid — Application Roles Subordinate to Keycloak (Chosen)

- **Description**: `team_members.role` is an **application-level
  organizational role** that is **subordinate to and bounded by** the user's
  Keycloak realm role. The two systems serve different concerns:
  - **Keycloak realm roles** → platform access (authentication, endpoint
    authorization)
  - **`team_members.role`** → within-tenant team organization (who can
    manage team settings, invite members, view-only access)

  A user can only hold a `team_members.role` that is equal to or less
  privileged than their Keycloak realm role. Keycloak is always the
  authoritative gatekeeper; `team_members.role` adds fine-grained
  organizational context within an already-authenticated and authorized
  session.

- **Pros**:
  - **No constitutional violation**: Keycloak remains the RBAC authority
    (Art. 5.1). Application roles add organizational context, not replace
    platform security.
  - **Clear separation of concerns**: Platform access (Keycloak) vs.
    organizational hierarchy (app-level) are distinct, documented, and
    non-overlapping in their authorization scope.
  - **Satisfies FR-010**: Team-level role assignment is implemented with
    the granularity the spec requires.
  - **Compatible with ADR-017 (ABAC)**: `team_members.role` can serve as
    a `resource.*` attribute in ABAC FILTER policies without conflicting
    with Keycloak's gatekeeper role.
  - **Privilege escalation prevented**: The subordination rule ensures the
    app-level role never grants more access than Keycloak permits.

- **Cons**:
  - Two role systems exist — developers must understand the boundary.
  - Synchronization is needed when Keycloak roles change (mitigated by
    conflict resolution guard — see Implementation Notes).
  - Slightly more complex mental model than a single-system approach.

- **Effort**: Medium — implement subordination guard + conflict resolution.
- **Risk**: Low — clear architectural boundary with enforced subordination.

---

## Decision

**Chosen option**: **Option C — Hybrid with Application Roles Subordinate
to Keycloak RBAC**

### Rationale

The two role systems serve fundamentally different concerns and operate at
different layers of the authorization stack:

1. **Keycloak realm roles** are the **security boundary**. They control
   which users can authenticate, which API endpoints they can call, and
   which tenant they belong to. This is enforced by Keycloak middleware
   before any application code runs. This is non-negotiable per
   Constitution Art. 5.1.

2. **`team_members.role`** is an **organizational context** within a
   tenant. It answers the question: "Among users who already have platform
   access to this tenant, who has what level of responsibility within this
   specific team?" This is a business domain concept, not a security
   primitive.

3. **Subordination is the key architectural invariant**: A
   `team_members.role` value MUST NOT grant access that the user's
   Keycloak realm role does not permit. The app-level role can only
   **narrow** (or maintain) the effective permission — never **widen** it.

4. **This mirrors the ABAC deny-only pattern** established in ADR-017:
   just as ABAC can only restrict (DENY/FILTER) access that RBAC has
   granted, `team_members.role` can only organize users within the access
   boundary Keycloak has already established.

### Subordination Rules

The role hierarchy (most to least privileged):

```
Keycloak Realm Roles (platform level):
  SUPER_ADMIN > TENANT_ADMIN > TENANT_MEMBER > (no role)

team_members.role (organizational level):
  OWNER > ADMIN > MEMBER > VIEWER
```

**Maximum allowed `team_members.role` per Keycloak realm role**:

| Keycloak Realm Role | Max Allowed `team_members.role` | Rationale                                            |
| ------------------- | ------------------------------- | ---------------------------------------------------- |
| `SUPER_ADMIN`       | `OWNER`                         | Platform superadmin can hold any team role           |
| `TENANT_ADMIN`      | `OWNER`                         | Tenant admin can own and fully manage teams          |
| `TENANT_MEMBER`     | `MEMBER`                        | Regular tenant members cannot be team OWNER or ADMIN |
| (no realm role)     | (none)                          | Unauthenticated users cannot be team members         |

**Enforcement points**:

1. **On team member creation/update** (`POST /api/v1/tenant/teams/:id/members`,
   `PUT /api/v1/tenant/teams/:id/members/:uid`): The `TeamService` validates
   that the requested `role` does not exceed the maximum allowed for the
   user's Keycloak realm role. If it does, the request is rejected with
   `400 Bad Request` and error code `ROLE_EXCEEDS_REALM_ROLE`.

2. **On every team-scoped authorization check**: The `TeamAuthGuard`
   middleware (or equivalent service method) computes the **effective team
   role** as `min(keycloakMaxRole, team_members.role)`. If a user's
   Keycloak realm role has been demoted since their `team_members.role`
   was assigned, the effective role is automatically capped.

### Conflict Resolution

When Keycloak demotes a user's realm role (e.g., `TENANT_ADMIN` →
`TENANT_MEMBER`):

1. **Immediate (synchronous guard)**: The `TeamAuthGuard` computes the
   effective role at request time using `min(keycloakMaxRole,
team_members.role)`. A user with `team_members.role = OWNER` but
   Keycloak role `TENANT_MEMBER` is treated as `MEMBER` for all team
   authorization decisions. **No database update is required for security
   enforcement** — the guard handles it at runtime.

2. **Eventual (background cleanup)**: A scheduled job or Keycloak event
   listener detects realm role changes and downgrades any `team_members`
   rows where `role` exceeds the new maximum. This ensures the database
   reflects the actual effective role, preventing confusion in admin UIs
   that display the stored role.

   ```
   -- Cleanup query (runs on Keycloak role demotion event):
   UPDATE team_members
   SET role = 'MEMBER'
   WHERE user_id = $1
     AND role IN ('OWNER', 'ADMIN');
   ```

3. **Keycloak role promotion** does NOT automatically upgrade
   `team_members.role`. Promotion is always explicit — a tenant admin must
   manually assign a higher team role. This prevents accidental privilege
   escalation from Keycloak role changes propagating into team structure.

### Authorization Flow

```
Request arrives
  │
  ▼
Keycloak JWT Middleware (Art. 5.1)
  │  Validates token, extracts realm role, sets tenant context
  │  DENY if no valid token or wrong tenant → 401/403
  │
  ▼
RBAC Check (Keycloak realm role → endpoint permission)
  │  DENY if realm role lacks endpoint permission → 403
  │
  ▼
ABAC Check (ADR-017, if policies exist)
  │  DENY or FILTER based on attribute conditions
  │
  ▼
Team-Scoped Operation?
  │  YES → TeamAuthGuard computes effective role:
  │         effectiveRole = min(keycloakMaxRole, team_members.role)
  │         Check effectiveRole against required team permission
  │         DENY if insufficient → 403
  │  NO  → Proceed
  │
  ▼
Service Layer executes business logic
```

---

## Consequences

### Positive

- **No privilege escalation vector**: The subordination rule and runtime
  guard ensure that an app-level role never grants more access than
  Keycloak permits. Even if the database contains a stale elevated role,
  the effective role is capped at request time.
- **Clear separation of concerns**: Developers know that Keycloak =
  platform security, `team_members.role` = organizational context. The
  two systems have non-overlapping authorization scopes.
- **Satisfies FR-010**: Team-level role assignment (OWNER, ADMIN, MEMBER,
  VIEWER) provides the granularity required by the spec without
  overloading Keycloak with per-team roles.
- **ABAC compatibility**: `team_members.role` can be exposed as a
  `resource.teamRole` attribute in ABAC FILTER policies (ADR-017),
  enabling fine-grained team-scoped access restrictions.
- **Consistent with deny-only pattern**: The subordination model mirrors
  ABAC's "can only restrict, never expand" principle, creating a
  consistent authorization philosophy across the platform.
- **Schema-per-tenant isolation preserved**: `team_members` rows exist
  only within a tenant schema (ADR-002). Cross-tenant team role confusion
  is architecturally impossible at the data layer.

### Negative

- **Two role systems to understand**: Developers must learn the boundary
  between Keycloak realm roles and app-level team roles. Incorrect checks
  (e.g., checking `team_members.role` for endpoint authorization instead
  of Keycloak) would create security holes. Mitigation: lint rules or code
  review checks to ensure team role checks always follow Keycloak
  middleware.
- **Eventual consistency on demotion**: Between a Keycloak role demotion
  and the background cleanup job running, the database stores a stale
  elevated role. Mitigation: the synchronous `TeamAuthGuard` enforces the
  correct effective role at runtime regardless of database state — the
  staleness is cosmetic (admin UI display), not a security gap.
- **Additional complexity in TeamService**: Role assignment API must
  validate against Keycloak realm role, adding a cross-system check on
  every team member mutation. Mitigation: this is a single validation call
  (~1ms) using claims already available in the JWT — no Keycloak API call
  needed.

### Neutral

- **Keycloak event listener is optional**: The background cleanup job is
  a best-effort consistency measure. The synchronous guard is the security
  enforcement point. If the event listener is not implemented immediately,
  security is not compromised — only admin UI accuracy is affected.
- **Role enum may evolve**: Future specs may add or remove team roles
  (e.g., `CONTRIBUTOR` between `MEMBER` and `VIEWER`). The subordination
  rule and guard logic are generic — they compare role privilege levels,
  not specific role names. A `ROLE_PRIVILEGE_ORDER` constant defines the
  hierarchy.

---

## Constitution Alignment

| Article                      | Alignment | Notes                                                                                                                                                                                            |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Art. 1.2 (Security First)    | ✅        | Dual role system explicitly documented with subordination rule. No feature ships without this security architecture being clear. Privilege escalation vector eliminated by runtime guard.        |
| Art. 1.2 (Multi-Tenancy)     | ✅        | `team_members` table exists only in tenant schemas (ADR-002). Cross-tenant role confusion is impossible at the data layer.                                                                       |
| Art. 2.1 (Tech Stack)        | ✅        | No new dependency. Uses existing Keycloak JWT claims + Prisma ORM. `TeamAuthGuard` is standard Fastify middleware.                                                                               |
| Art. 3.2 (Layered Arch.)     | ✅        | Authorization decision flows through layers: Keycloak middleware → RBAC → ABAC → TeamAuthGuard → Service. Each layer has a clear responsibility.                                                 |
| Art. 3.3 (Parameterized SQL) | ✅        | Background cleanup query uses parameterized inputs. No raw SQL string interpolation.                                                                                                             |
| Art. 5.1 (Keycloak Auth)     | ✅        | Keycloak remains the sole authentication and primary RBAC authority. `team_members.role` is explicitly subordinate — it does not replace or override Keycloak decisions.                         |
| Art. 5.1 (RBAC)              | ✅        | Keycloak RBAC controls endpoint access. App-level team roles add organizational context within already-authorized sessions. The two scopes are non-overlapping.                                  |
| Art. 5.3 (Input Validation)  | ✅        | Team member role assignment validated via Zod schema. Subordination check rejects roles exceeding Keycloak maximum.                                                                              |
| Art. 6.1 (Error Handling)    | ✅        | `ROLE_EXCEEDS_REALM_ROLE` error code returned when subordination rule is violated. Clear, actionable error message for admin users.                                                              |
| Art. 8.1 (Testing)           | ✅        | Unit tests required for `TeamAuthGuard` effective role computation. Integration tests for subordination validation on member creation. E2E tests for Keycloak demotion → effective role capping. |

---

## Follow-Up Actions

- [ ] Implement `TeamAuthGuard` middleware with effective role computation (`min(keycloakMaxRole, team_members.role)`)
- [ ] Add subordination validation to `TeamService.addMember()` and `TeamService.updateMemberRole()`
- [ ] Define `ROLE_PRIVILEGE_ORDER` constant for role hierarchy comparison
- [ ] Add `ROLE_EXCEEDS_REALM_ROLE` to the error code registry (Art. 6.2)
- [ ] Write unit tests for effective role computation (all Keycloak × team role combinations)
- [ ] Write integration tests for subordination rejection on member creation
- [ ] Write E2E test for Keycloak demotion → capped effective role scenario
- [ ] Document the dual role architecture in developer docs (team module README)
- [ ] Evaluate Keycloak event listener for background role cleanup (can be deferred if `TeamAuthGuard` is in place)
- [ ] Update Spec 008 FR-010 to reference ADR-024 for team role semantics

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
```

## Related Decisions

- [ADR-002: Database Multi-Tenancy](adr-002-database-multi-tenancy.md) —
  schema-per-tenant isolation ensures `team_members` rows are tenant-scoped;
  cross-tenant team role confusion is impossible at the data layer
- [ADR-017: ABAC Condition Evaluation Engine](adr-017-abac-engine.md) —
  `team_members.role` can be exposed as a `resource.teamRole` attribute in
  ABAC FILTER policies; the subordination model mirrors ABAC's "can only
  restrict, never expand" principle
- Spec 008: `.forge/specs/008-admin-interfaces/spec.md` — FR-010 (team
  management), FR-011 (role editor)
- Plan 008: `.forge/specs/008-admin-interfaces/plan.md` — §5.7
  `team_members` table definition
- Constitution Articles 5.1 (Keycloak Auth + RBAC), 1.2 (Security First),
  3.2 (Layered Architecture)
- `/forge-analyze` finding C-201 (CRITICAL): dual role system authorization
  confusion risk

## References

- Spec 008 FR-010: "Team management: CRUD teams, member management, role
  assignment"
- Constitution Art. 5.1: "Keycloak for all authentication and identity
  management" + "RBAC: Role-based access control for all protected
  resources"
- [Keycloak Realm Roles Documentation](https://www.keycloak.org/docs/latest/server_admin/#realm-roles) —
  Keycloak's intended usage for realm-level roles
- ADR-017 §Decision: "ABAC can only restrict (DENY) or filter — never
  expand RBAC access" — the subordination model for `team_members.role`
  follows the same principle
