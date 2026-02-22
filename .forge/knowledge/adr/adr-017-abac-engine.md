# ADR-017: ABAC Condition Evaluation Engine Design

> Architectural Decision Record documenting the design of the Attribute-Based
> Access Control (ABAC) condition evaluation engine, including the evaluation
> algorithm, attribute resolution strategy, FILTER-to-Prisma query translation,
> and performance/caching model. Created by the `forge-architect` agent via
> `/forge-adr`.

| Field    | Value             |
| -------- | ----------------- |
| Status   | Accepted          |
| Author   | forge-architect   |
| Date     | 2026-02-22        |
| Deciders | Architecture Team |

---

## Context

Plexica implements a **hybrid RBAC + ABAC** authorization system (Spec 003).
RBAC provides the base ALLOW/DENY decision via role-to-permission mappings.
ABAC operates as a **deny-only overlay** — it can only restrict (DENY) or
filter (FILTER) access that RBAC has already granted. It cannot expand access
beyond what RBAC permits (FR-007).

The ABAC engine needs a **condition evaluation engine** to process policy
conditions at runtime. Policies are stored as JSONB condition trees in the
`policies` table (FR-008) with two effect modes:

- **DENY**: Evaluates the condition tree to a boolean. If `true`, the
  endpoint request is blocked with 403 Forbidden.
- **FILTER**: Translates the condition tree into a Prisma `where` clause
  constraint that is injected into the service layer's query, restricting
  the result set (FR-017).

The condition tree is a nested boolean structure supporting `AND` (`all`),
`OR` (`any`), and `NOT` (`not`) combinators with leaf conditions
`{ attribute, operator, value }`. The tree has enforced limits: maximum
nesting depth of 5 levels, maximum 20 conditions per policy, and maximum
64 KB JSONB payload (FR-008). All limits are validated via Zod schemas on
API input — the engine itself does not re-validate at evaluation time.

**Attribute namespaces** referenced in conditions span three sources:

- `user.*` — extracted from JWT token claims (e.g., `user.teamId`,
  `user.department`)
- `resource.*` — injected by the service layer from request context (e.g.,
  `resource.ownerId`, `resource.status`)
- `environment.*` — resolved from system state (e.g.,
  `environment.dayOfWeek`, `environment.ipAddress`)

**Current state**: No ABAC engine exists. The legacy `PermissionService`
handles only RBAC permission checks. Phase 4 of Plan 003 created the ABAC
data model (policies table, condition tree Zod schemas, `PolicyService`
CRUD, `ConditionValidatorService`). This ADR documents the runtime
evaluation engine that consumes those stored policies — a prerequisite
noted in Spec 003 §12 (Art. 2 compliance) and Plan 003 §9 (ADR-017).

**Performance constraint**: The combined RBAC + ABAC authorization decision
must complete within **< 50ms P95** (NFR-001). Since RBAC evaluation
(cache lookup + wildcard matching) typically takes 2–8ms, the ABAC engine
budget is approximately **< 40ms P95**.

**Rate limiting**: Auth management write endpoints are rate-limited at
60 mutations per tenant per minute (NFR-010), with debounced cache flush
(500ms window). This constrains how frequently policy changes can occur
and ensures the cache remains effective.

### Requirements Driving This Decision

| Req     | Summary                                                             |
| ------- | ------------------------------------------------------------------- |
| FR-007  | ABAC can only restrict (DENY) or filter — never expand RBAC access  |
| FR-008  | Condition tree: AND/OR/NOT + leaf conditions; depth ≤ 5, ≤ 20 conds |
| FR-017  | Two effect modes: DENY (binary gate) and FILTER (query injection)   |
| NFR-001 | Authorization decision latency < 50ms P95 (RBAC + ABAC combined)    |
| NFR-005 | Fail-closed: authorization failure defaults to DENY                 |
| NFR-010 | Rate limiting: 60 mutations/tenant/min on policy write endpoints    |

---

## Options Considered

### Option A: Custom Recursive Tree-Walk Engine (in-process)

- **Description**: A purpose-built TypeScript engine that recursively
  walks the condition tree in-process. AND nodes short-circuit at first
  `false`, OR nodes short-circuit at first `true`, NOT negates its single
  child, and LEAF nodes compare resolved attributes using the specified
  operator. Attribute resolution uses a namespace-based registry of
  resolver functions. For FILTER-effect policies, the engine translates
  the tree into a `Prisma.JsonFilter`-compatible `WhereConstraint` object
  instead of evaluating to a boolean. Two entry points: `evaluate(tree,
context): boolean` (for DENY) and `buildFilter(tree, context):
WhereConstraint` (for FILTER).
- **Pros**:
  - Zero external dependencies — pure TypeScript, stays within approved
    stack (Art. 2.1)
  - Full control over evaluation semantics, short-circuit behavior, and
    error handling
  - Direct integration with Prisma `where` clause generation (no
    intermediate format conversion)
  - Easy to unit test — deterministic, synchronous, no I/O
  - Namespace-based resolver registry is extensible for future attribute
    sources
  - Condition tree limits (depth ≤ 5, ≤ 20 conditions) bound worst-case
    complexity to trivial levels
- **Cons**:
  - Custom code must be maintained in-house (no community fixes)
  - Recursive tree-walk has O(n) worst-case where n = condition count
    (mitigated by max 20 limit)
  - FILTER-to-Prisma translation is tightly coupled to Prisma ORM
- **Effort**: Medium

### Option B: JSON Logic Library (`json-logic-js`)

- **Description**: Use the `json-logic-js` npm package (or its TypeScript
  fork `json-logic-engine`) to evaluate conditions. JSON Logic is a
  community standard for expressing logic as JSON. Policy conditions
  would be stored in JSON Logic format rather than the custom AND/OR/NOT
  tree format.
- **Pros**:
  - Community-maintained with existing documentation
  - Supports complex nested logic out of the box
  - Portable format — policies could be evaluated client-side
- **Cons**:
  - **Adds external dependency** — requires ADR and constitutional review
    per Art. 2.2 policy. `json-logic-js` has no TypeScript types natively;
    `@types/json-logic-js` is a separate package
  - **No Prisma integration** — JSON Logic evaluates to booleans only.
    FILTER effect requires a separate translation layer to convert JSON
    Logic AST → Prisma `where` constraints, essentially doubling the work
  - **Format mismatch**: The spec defines a specific condition tree format
    (`all`/`any`/`not` with `{ attribute, operator, value }` leaves).
    Adopting JSON Logic would require changing the spec format or adding
    bidirectional conversion between spec format and JSON Logic format
  - **Namespace resolution not built-in**: JSON Logic has no concept of
    attribute namespaces. Custom operations would be needed for `user.*`,
    `resource.*`, `environment.*` resolution
  - **Overkill**: JSON Logic supports ~20 operations; we need 7 operators
    on 3 namespaces
- **Effort**: Medium-High

### Option C: Open Policy Agent (OPA)

- **Description**: Deploy OPA as a sidecar or external service. Policies
  are written in Rego (OPA's policy language). The authorization service
  sends evaluation requests to OPA via HTTP or gRPC.
- **Pros**:
  - Industry-standard policy engine with enterprise adoption
  - Rich policy language (Rego) supports complex logic
  - Decoupled from application code — policies can be updated without
    redeployment
  - Built-in partial evaluation for query generation (similar to FILTER)
- **Cons**:
  - **Violates Constitution Art. 2**: OPA (Go binary) is not in the
    approved technology stack. Adding it requires a constitutional
    amendment, not just an ADR
  - **Operational complexity**: Requires sidecar deployment, health
    monitoring, and OPA-specific configuration management
  - **Latency**: HTTP/gRPC round-trip to OPA adds 5–15ms baseline
    latency, consuming a significant portion of the 50ms P95 budget
  - **Rego learning curve**: Team must learn OPA-specific policy language
  - **Format translation**: Spec conditions (JSON tree) would need
    conversion to Rego policies
  - **Heavyweight for scope**: Plexica's ABAC requirements (deny-only,
    max 20 conditions, 3 namespaces) do not justify the operational
    overhead of a dedicated policy engine
- **Effort**: High

### Option D: PostgreSQL Row-Level Security (RLS)

- **Description**: Translate ABAC conditions into PostgreSQL RLS policies
  that are applied at the database level. Each ABAC policy maps to a
  `CREATE POLICY` statement with conditions expressed as SQL `WHERE`
  clauses. User attributes are injected via `SET LOCAL` session variables.
- **Pros**:
  - Database-enforced access control — no application bypass possible
  - Transparent to application queries (no service-layer changes)
  - PostgreSQL-native with strong performance for simple conditions
- **Cons**:
  - **Conflicts with schema-per-tenant pattern** (ADR-002): Each tenant
    schema would need its own RLS policies. Dynamic policy creation would
    require DDL statements (`CREATE POLICY`) at runtime, which is
    operationally risky in a multi-tenant environment
  - **Cannot handle dynamic `user.*` attributes** without complex session
    variable injection on every request: `SET LOCAL app.user_team_id = ?`
    for each attribute the conditions reference
  - **FILTER translation is implicit**: Loses visibility into what
    constraints were applied. Debugging and audit logging become
    significantly harder
  - **Environment attributes impossible**: `environment.dayOfWeek` and
    `environment.ipAddress` cannot be efficiently injected as session
    variables for RLS evaluation
  - **Schema migration risk**: RLS policy creation/updates require
    `ALTER TABLE`-level permissions and cannot be easily rolled back
  - **Violates Art. 3.3**: Bypasses the Prisma ORM layer entirely for
    access control logic
- **Effort**: High

### Option E: Flat Condition List (No Nesting)

- **Description**: Instead of a nested boolean tree, use a flat list of
  conditions that are implicitly AND-combined. No OR or NOT operators.
- **Pros**:
  - Simplest possible implementation — iterate list, check each condition
  - No recursion needed
  - Trivial to validate and serialize
- **Cons**:
  - **Cannot express complex policies**: Policies like "(team member OR
    resource owner) AND NOT (account suspended)" are impossible without
    OR and NOT
  - **Violates FR-008**: The spec explicitly requires nested boolean tree
    structure with AND/OR/NOT operators
  - **Future limitation**: Any policy requiring disjunction or negation
    would require a spec change and data migration
- **Effort**: Low

---

## Decision

**Chosen option**: Option A — Custom Recursive Tree-Walk Engine

The decision encompasses four sub-decisions that collectively define the
ABAC engine architecture:

### Sub-Decision A: Evaluation Algorithm — Recursive Tree-Walk

The condition tree is a JSON structure with four node types:

```typescript
type ConditionNode =
  | { type: 'AND'; children: ConditionNode[] }
  | { type: 'OR'; children: ConditionNode[] }
  | { type: 'NOT'; child: ConditionNode }
  | { type: 'LEAF'; attribute: string; operator: Operator; value: unknown };

type Operator = 'equals' | 'notEquals' | 'contains' | 'in' | 'greaterThan' | 'lessThan' | 'exists';
```

Evaluation is recursive with **short-circuit semantics**:

- **AND** (`all`): Evaluates children left-to-right. Returns `false` at
  the first child that evaluates to `false` (remaining children skipped).
- **OR** (`any`): Evaluates children left-to-right. Returns `true` at
  the first child that evaluates to `true` (remaining children skipped).
- **NOT** (`not`): Evaluates the single child and negates the result.
- **LEAF**: Resolves the `attribute` via the attribute resolver registry,
  then applies the `operator` to compare the resolved value against
  `value`.

**Depth and size limits** (depth ≤ 5, conditions ≤ 20, payload ≤ 64 KB)
are enforced by Zod validation at API input time
(`ConditionValidatorService`), not at evaluation time. The engine assumes
valid input — this avoids redundant validation on every request and
keeps evaluation latency minimal.

**Fail-closed** (NFR-005): If attribute resolution fails (unknown
namespace, missing attribute, resolver error), the LEAF condition
evaluates to `false` for DENY policies (meaning: the restrictive
condition is treated as met, producing a DENY). If a `value` references
another attribute (e.g., `"resource.teamId"` as a dynamic comparison
target), the reference is resolved via the same resolver registry.

### Sub-Decision B: Attribute Resolution — Namespace-Based Resolver Registry

Three attribute namespaces are supported, each with a registered resolver:

| Namespace       | Source           | Resolution             | Cacheability        |
| --------------- | ---------------- | ---------------------- | ------------------- |
| `user.*`        | JWT token claims | Synchronous (from ctx) | Cached with session |
| `resource.*`    | Request context  | Synchronous (from ctx) | Per-request         |
| `environment.*` | System state     | Lazy at eval time      | Never cached        |

**Interface**:

```typescript
interface AttributeResolver {
  resolve(attribute: string, context: EvalContext): unknown;
}

interface EvalContext {
  user: Record<string, unknown>; // Populated from JWT claims
  resource: Record<string, unknown>; // Populated by service layer
  environment: {
    // Resolved lazily
    dayOfWeek: string;
    timeOfDay: string;
    ipAddress: string;
  };
  tenantId: string;
}
```

Resolvers are registered at application startup via a `ResolverRegistry`:

```typescript
class ResolverRegistry {
  private resolvers: Map<string, AttributeResolver>;

  register(namespace: string, resolver: AttributeResolver): void;
  resolve(qualifiedAttribute: string, context: EvalContext): unknown;
}
```

**Unknown namespaces fail closed** (NFR-005): If a condition references a
namespace with no registered resolver (e.g., `unknown.attr`), the resolver
returns `undefined`, and the LEAF condition evaluates as if the attribute
does not exist — which for a DENY policy means the condition is treated
as met (DENY applied). This prevents policy misconfiguration from creating
security holes.

**Extensibility**: Future attribute sources (e.g., ML risk scores from an
external API, LDAP group membership) can be added by registering a new
resolver for a new namespace without modifying the engine.

### Sub-Decision C: FILTER-to-Prisma Query Translation

FILTER-effect policies produce a `WhereConstraint` object (not a boolean)
that the service layer merges into its Prisma `where` clause:

```typescript
type WhereConstraint = Record<string, unknown>; // Prisma.JsonFilter compatible

// Engine exposes two methods:
interface AbacEngine {
  evaluate(tree: ConditionNode, context: EvalContext): boolean;
  buildFilter(tree: ConditionNode, context: EvalContext): WhereConstraint;
}
```

**Translation rules**:

| Condition   | Prisma Where Equivalent                              |
| ----------- | ---------------------------------------------------- |
| AND         | `{ AND: [child1, child2, ...] }`                     |
| OR          | `{ OR: [child1, child2, ...] }`                      |
| NOT         | `{ NOT: child }`                                     |
| LEAF equals | `{ [column]: { equals: value } }`                    |
| LEAF in     | `{ [column]: { in: [values] } }`                     |
| LEAF gt     | `{ [column]: { gt: value } }`                        |
| LEAF lt     | `{ [column]: { lt: value } }`                        |
| LEAF exists | `{ [column]: { not: null } }` / `{ [column]: null }` |

**Namespace restriction**: Only `resource.*` attributes are valid as
column references in FILTER conditions. `user.*` attributes are resolved
to concrete values and injected as constants. `environment.*` attributes
are **not valid** in FILTER policies — a FILTER policy referencing
`environment.*` is rejected at Zod validation time (API layer), not at
translation time. This prevents temporal conditions from being baked
into database queries.

**Attribute-to-column mapping**: The `resource.*` namespace maps
attribute names to Prisma model field names. For example,
`resource.teamId` maps to the `team_id` column. The mapping is
maintained by a `ResourceAttributeMapper` registered per resource type.

**Invalid/unsupported conditions fail open** for FILTER: If a FILTER
condition cannot be translated to a valid Prisma constraint (e.g.,
`contains` operator on a non-string column), the condition is skipped
(no constraint added) and a warning is logged. This is the opposite of
DENY's fail-closed behavior — for FILTER, an untranslatable condition
should not silently exclude all results, as that would be
indistinguishable from a data loss bug. The warning log ensures
operators are alerted to misconfigured FILTER policies.

**Service layer integration**: The service layer calls
`abacEngine.buildFilter(policyTree, context)` for each matching FILTER
policy and merges the resulting constraints into its Prisma query:

```typescript
const where = { tenantId, ...baseWhere };
for (const policy of matchingFilterPolicies) {
  const constraint = abacEngine.buildFilter(policy.conditions, context);
  where.AND = where.AND || [];
  where.AND.push(constraint);
}
const results = await prisma.resource.findMany({ where });
```

### Sub-Decision D: Performance & Caching

**Evaluation order**: ABAC evaluation occurs **after** RBAC ALLOW.
The flow is:

```
Request → Extract Context → RBAC Check
  → RBAC DENY? → 403 (ABAC not evaluated)
  → RBAC ALLOW → Load matching ABAC policies → Evaluate DENY policies
    → Any DENY evaluates true? → 403
    → No DENY? → Evaluate FILTER policies → Build WhereConstraints
      → Merge into service query → Execute → Return results
```

**super_admin bypass**: ABAC evaluation is skipped entirely for users
with the `super_admin` system role (FR-016). The skip is recorded in
the audit log.

**Policy caching**: Active ABAC policies for a tenant are cached in
Redis alongside the RBAC permission cache. This avoids a database query
per request to load matching policies.

- **Cache key**: `abac:policies:{tenantId}` — stores all active policies
  for the tenant as a serialised JSON array
- **User-scoped cache**: `abac:tenant:{tenantId}:user:{userId}` — stores
  pre-matched policy IDs for the user's roles (optional optimisation;
  initial implementation uses tenant-level cache)
- **TTL**: 300s ± 30s jitter (consistent with RBAC permission cache,
  NFR-007)
- **Invalidation**: Policy cache is flushed when policies are
  created/updated/deleted via `PolicyService`. Uses the same debounced
  flush pattern as RBAC cache (500ms window, NFR-010)

**Synchronous evaluation**: Both `evaluate()` (for DENY) and
`buildFilter()` (for FILTER) are **synchronous** — no async attribute
resolution occurs during evaluation. `user.*` and `resource.*`
attributes are pre-populated in the `EvalContext` before the engine is
invoked. `environment.*` attributes are resolved lazily from the request
context (e.g., reading `Date.now()` for time, reading the IP from the
Fastify request), but this resolution is synchronous (in-memory
operations, no I/O).

**Performance budget**:

| Step                         | Budget    | Notes                                 |
| ---------------------------- | --------- | ------------------------------------- |
| Policy cache lookup (Redis)  | 1–3ms     | Single `GET` on `abac:policies:{tid}` |
| Policy matching (in-memory)  | < 1ms     | Filter by resource pattern            |
| DENY evaluation (per policy) | < 0.5ms   | 20 conditions max, short-circuit      |
| FILTER translation (per pol) | < 0.5ms   | Tree → Prisma constraint, synchronous |
| `environment.*` resolution   | < 1ms     | In-memory, no I/O                     |
| **Total ABAC budget**        | **< 8ms** | Well within 40ms budget after RBAC    |

**`environment.*` latency constraint**: Each `environment.*` attribute
resolution must complete in < 5ms to stay within NFR-001 (50ms P95
total). Since current `environment.*` attributes (`dayOfWeek`,
`timeOfDay`, `ipAddress`) are all derived from in-memory request state,
this is trivially met. If future `environment.*` attributes require I/O
(e.g., geolocation lookup), they must be pre-resolved before engine
invocation, not resolved lazily.

---

## Consequences

### Positive

- **Simple, testable model**: Recursive tree-walk with short-circuit
  evaluation is easy to reason about, easy to test exhaustively, and
  produces deterministic results. The bounded input (≤ 5 depth, ≤ 20
  conditions) means worst-case behavior is trivially fast.
- **Extensible resolver registry**: New attribute namespaces can be added
  by registering a resolver at startup. No engine changes needed. This
  supports future requirements like ML risk scores, external identity
  provider attributes, or plugin-contributed attributes.
- **Zero external dependencies**: The engine is pure TypeScript with no
  npm dependencies beyond the approved stack. No constitutional amendment
  required.
- **Dual-mode evaluation**: A single engine serves both DENY (boolean)
  and FILTER (query constraint) use cases, sharing the tree-walk logic
  and attribute resolution. This avoids maintaining two separate
  evaluation systems.
- **Performance headroom**: With a < 8ms total ABAC budget against a
  40ms available window, there is ~32ms of headroom for future
  complexity (additional policies, more attributes, deeper trees).

### Negative

- **O(n) worst-case evaluation**: Recursive tree-walk visits every node
  in the worst case (no short-circuit opportunities). With n = 20 max
  conditions, this is ~20 comparisons — negligible in practice, but
  the linear characteristic should be noted. Mitigation: the 20-condition
  limit in FR-008 bounds the worst case.
- **Prisma coupling**: The FILTER-to-Prisma translation produces
  `Prisma.JsonFilter`-compatible objects, tightly coupling the FILTER
  subsystem to Prisma. If Plexica migrates to a different ORM in the
  future, the FILTER translation layer would need a complete rewrite.
  Mitigation: the translation is isolated in `buildFilter()` — only
  this method would need replacement, not the evaluation engine.
- **Custom code maintenance**: Unlike OPA or JSON Logic, there is no
  community maintaining the evaluation engine. All bugs and edge cases
  must be handled in-house. Mitigation: the engine is small (~200–300
  lines), well-bounded by spec limits, and covered by 100% unit tests
  (Art. 4.1 security code requirement).

### Neutral

- **FILTER fail-open vs DENY fail-closed**: The asymmetric failure
  behavior (DENY = fail-closed, FILTER = fail-open with warning log) is
  an intentional design choice. Developers must understand and document
  this distinction clearly. A DENY policy with an untranslatable
  condition blocks access (safe). A FILTER policy with an untranslatable
  condition returns unfiltered results (potentially unsafe, but less
  dangerous than silently returning empty results).
- **`environment.*` exclusion from FILTER**: Environment attributes
  cannot appear in FILTER policies. This is a deliberate restriction to
  prevent temporal conditions from being baked into database queries
  (which would produce confusing results when cached). Policies needing
  time-based restrictions must use DENY effect, not FILTER.
- **Resolver registry is mutable at startup only**: Resolvers are
  registered during application bootstrap. Runtime resolver registration
  is not supported. This prevents plugins from dynamically adding
  resolvers, which would be a security risk (a plugin could override
  `user.*` resolution). If plugin attribute namespaces are needed in the
  future, they would be added via a controlled registration mechanism
  with prefix enforcement (e.g., `plugin.crm.*`).

---

## Constitution Alignment

| Article | Alignment | Notes                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1  | COMPLIANT | **Security First** (Art. 1.2.1): Fail-closed for DENY; unknown namespaces fail closed; `super_admin` bypass preserves audit trail. **Multi-Tenancy** (Art. 1.2.2): Policy cache keyed by `tenantId`; all evaluation scoped to tenant context.                                                                                                                                                                                    |
| Art. 2  | COMPLIANT | **No new dependencies** (Art. 2.1): Pure TypeScript engine using only approved stack (Node.js, TypeScript, ioredis for cache). No external policy engine, no new npm packages. Dependency policy (Art. 2.2) fully satisfied.                                                                                                                                                                                                     |
| Art. 3  | COMPLIANT | **Service layer** (Art. 3.2): ABAC engine is a service within the `authorization` module. No direct database access from the engine — FILTER constraints are passed to the service layer for Prisma query construction. **Parameterized queries** (Art. 3.3): FILTER translation produces Prisma-native objects; no raw SQL generated. **Tenant context** (Art. 3.4): `EvalContext` includes `tenantId` validated by middleware. |
| Art. 4  | COMPLIANT | **Coverage** (Art. 4.1): ABAC engine is security code — 100% unit test coverage required. **Performance** (Art. 4.3): Total ABAC budget < 8ms, well within 50ms P95 combined target. Redis cache lookup < 3ms.                                                                                                                                                                                                                   |
| Art. 5  | COMPLIANT | **RBAC prerequisite** (Art. 5.1.3): ABAC only runs after RBAC ALLOW. **Zod validation** (Art. 5.3.1): Condition tree validated at API layer. **No PII in logs** (Art. 5.2.2): Attribute values not logged in evaluation results; only policy ID and decision.                                                                                                                                                                    |
| Art. 6  | COMPLIANT | **Error classification** (Art. 6.1): DENY produces 403 with `AUTHORIZATION_DENIED` code (no policy details leaked). FILTER translation warnings logged at `warn` level with policy ID and failure reason. **Error format** (Art. 6.2): Standard error response.                                                                                                                                                                  |
| Art. 7  | COMPLIANT | **Files**: `abac-engine.service.ts`, `attribute-resolver.ts`, `filter-translator.ts` (kebab-case). **Classes**: `AbacEngineService`, `ResolverRegistry`, `FilterTranslator` (PascalCase). **Constants**: `MAX_CONDITION_DEPTH`, `MAX_CONDITIONS` (UPPER_SNAKE).                                                                                                                                                                  |
| Art. 8  | COMPLIANT | **Unit tests** (Art. 8.1.1): Full evaluation matrix (all operators × all node types × short-circuit paths × fail-closed scenarios). **Integration tests** (Art. 8.1.2): FILTER constraints verified against actual Prisma queries. **Deterministic** (Art. 8.2.1): Engine is pure function (synchronous, no I/O).                                                                                                                |
| Art. 9  | COMPLIANT | **Feature flag** (Art. 9.1.1): ABAC engine gated behind `abac_enabled` tenant feature flag. Engine is not invoked when flag is off. **Monitoring** (Art. 9.2): ABAC evaluation latency and DENY rates logged for monitoring. Policy cache hit/miss rates trackable via Redis metrics.                                                                                                                                            |

---

## Follow-Up Actions

- [ ] Implement `AbacEngineService` with `evaluate()` and `buildFilter()` methods
- [ ] Implement `ResolverRegistry` with `user`, `resource`, `environment` resolvers
- [ ] Implement `FilterTranslator` for condition tree → Prisma `WhereConstraint`
- [ ] Implement `ResourceAttributeMapper` per resource type (CRM deals, contacts, etc.)
- [ ] Add ABAC evaluation step to `AuthorizationService.authorize()` flow
- [ ] Add policy cache to Redis (`abac:policies:{tenantId}`) with jittered TTL
- [ ] Write unit tests: evaluation matrix (all operators, node types, short-circuit, fail-closed) — target 100% coverage
- [ ] Write integration tests: FILTER constraints produce correct Prisma queries
- [ ] Write E2E tests: DENY policy blocks access, FILTER policy restricts results
- [ ] Update `PolicyService` to flush policy cache on CRUD operations
- [ ] Document FILTER fail-open vs DENY fail-closed semantics in developer docs

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
```

## Related Decisions

- [ADR-002: Database Multi-Tenancy](adr-002-database-multi-tenancy.md) —
  schema-per-tenant pattern that the ABAC engine operates within;
  tenant-scoped policy caching
- [ADR-007: Prisma ORM](adr-007-prisma-orm.md) — FILTER translation
  produces `Prisma.JsonFilter`-compatible constraints; all data access
  via Prisma
- [ADR-013: Materialised Path](adr-013-materialised-path.md) — workspace
  hierarchy context relevant for resource attribute resolution in
  workspace-scoped policies
- [ADR-014: WorkspacePlugin Scoping](adr-014-workspace-plugin-scoping.md) —
  plugin attribute namespace for workspace-level plugin policies
- Spec 003: `.forge/specs/003-authorization/spec.md` — FR-007, FR-008,
  FR-017 (normative requirements)
- Plan 003: `.forge/specs/003-authorization/plan.md` — Phase 4 tasks
  T003-30 through T003-37 (ABAC data model); ADR-017 prerequisite noted
  in §9
- Constitution Articles 2.1, 2.2, 3.2, 3.3, 4.1, 4.3, 5.1, 5.3

## References

- Spec 003 §6, ABAC Condition Schema — `all`/`any`/`not` combinators
  with `{ attribute, operator, value }` leaf conditions
- [NIST SP 800-162: Guide to ABAC](https://csrc.nist.gov/publications/detail/sp/800-162/final) —
  ABAC architecture and attribute evaluation model
- [Prisma Where Input Types](https://www.prisma.io/docs/orm/prisma-client/queries/filtering-and-sorting) —
  `AND`, `OR`, `NOT` filter composition
- [XACML 3.0 Policy Evaluation](https://docs.oasis-open.org/xacml/3.0/xacml-3.0-core-spec-os-en.html) —
  reference architecture for deny-override combining algorithm (adapted
  to Plexica's deny-only model)
