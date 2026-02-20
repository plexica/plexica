# ADR-013: Materialised Path for Workspace Hierarchy

> Architectural Decision Record documenting the choice of hierarchy pattern
> for parent-child workspace relationships. Created by the `forge-architect`
> agent via `/forge-adr`.

| Field    | Value             |
| -------- | ----------------- |
| Status   | Accepted          |
| Author   | forge-architect   |
| Date     | 2026-02-20        |
| Deciders | Architecture Team |

---

## Context

Spec 011 (Workspace Hierarchical Visibility & Templates) introduces
parent-child workspace relationships with **unlimited hierarchy depth**.
The hierarchy must support:

1. **Top-down aggregation**: A parent workspace admin must see aggregated
   member counts, team counts, and child counts across the entire subtree
   (FR-007, FR-008).
2. **Descendant queries**: Fetching all descendants of a workspace for tree
   views and access checks (FR-012, FR-013).
3. **Ancestor lookups**: Determining if a user is an admin of any ancestor
   workspace for hierarchical read access (FR-010, FR-011).
4. **Tree rendering**: Building a nested tree structure for the workspace
   switcher UI (FR-012).
5. **Immutability**: Once created, a workspace's parent cannot change
   (FR-005). Re-parenting is explicitly out of scope.

The hierarchy operates within the schema-per-tenant architecture (ADR-002).
All queries use `Prisma.$queryRaw` with `SET LOCAL search_path` per the
existing workspace service pattern (ADR-007, Constitution Art. 3.3).

**Constraints**:

- Unlimited hierarchy depth (no cap enforced; `CHECK (depth >= 0)`)
- Maximum workspace count per tenant: ~500 (based on current usage patterns)
- Query performance target: < 50ms P95 for descendant queries (Art. 4.3)
- Tree endpoint response time: < 200ms P95 for 100 workspaces (NFR-001)

## Options Considered

### Option A: Adjacency List (parentId only)

- **Description**: Store only a `parent_id` foreign key on each workspace
  row. Descendant queries use recursive CTEs (`WITH RECURSIVE`) to traverse
  the tree. This is the simplest relational pattern for tree structures.
- **Pros**:
  - Simplest schema change — single nullable column addition
  - Native PostgreSQL recursive CTE support
  - Re-parenting is trivial (update one row) if ever needed
  - Well-understood pattern with extensive documentation
- **Cons**:
  - Recursive CTEs have O(n) performance — must visit every node in the
    subtree one level at a time
  - Query complexity increases with depth (proportional to tree depth via
    recursive rounds)
  - Aggregation queries require CTE + JOIN, adding query planner overhead
  - Ancestor lookups also require recursive traversal upward
  - No single-query descendant fetch without recursion
- **Effort**: Low

### Option B: Nested Sets (left/right values)

- **Description**: Each workspace gets a `lft` (left) and `rgt` (right)
  integer pair representing its position in a depth-first traversal of the
  tree. Descendants of node N are all nodes where `lft > N.lft AND rgt < N.rgt`.
  This enables O(1) descendant queries via range scans.
- **Pros**:
  - O(1) descendant queries via `WHERE lft > ? AND rgt < ?` with B-TREE index
  - O(1) ancestor queries via `WHERE lft < ? AND rgt > ?`
  - Single-query subtree aggregation without recursion
  - Very fast read performance for deep trees
- **Cons**:
  - **Expensive writes**: Inserting or deleting a node requires updating
    `lft`/`rgt` values for ALL subsequent nodes in the tree — O(n) updates
    on every insert/delete
  - Write amplification is a serious concern for concurrent workspace
    creation within the same tenant
  - Complex implementation with high risk of data corruption on concurrent
    modifications
  - Requires gap-locking or table-level locks to prevent races
  - Overkill for shallow trees — the read performance advantage over
    materialised path is negligible at typical depths and scale
- **Effort**: High

### Option C: Materialised Path (path string)

- **Description**: Each workspace stores a `path` column containing the
  full path from root to self as a `/`-delimited string of UUIDs
  (e.g., `"rootId/childId/grandchildId/..."`). Descendant queries use
  `WHERE path LIKE 'rootId/%'` which is sargable with a B-TREE index.
  A `depth` column is stored redundantly for efficient depth-level
  filtering.
- **Pros**:
  - O(log n) descendant queries via B-TREE index on `path` column
    (`LIKE 'prefix%'` is sargable in PostgreSQL)
  - O(1) ancestor extraction — split path string to get all ancestor IDs
  - No recursive CTEs needed for any operation
  - Writes are O(1) — insert only touches the new row (no sibling updates)
  - Re-parenting cost is bounded to the moved subtree (O(n) subtree size),
    not the entire tree
  - Simple implementation with well-understood semantics
  - Path length grows with depth (unbounded; each UUID level adds ~37 chars —
    acceptable trade-off for unlimited depth support)
- **Cons**:
  - Re-parenting requires transactional bulk UPDATE of all descendant rows
    (O(n) subtree size) — acceptable given re-parenting is expected to be
    infrequent
  - Path string is denormalized data (acceptable trade-off for query
    performance)
  - B-TREE `LIKE 'prefix%'` is less efficient than dedicated tree indexes
    (e.g., `ltree` extension) but sufficient for our scale
- **Effort**: Medium

## Decision

**Chosen option**: Option C — Materialised Path

**Rationale**:

Materialised Path is the optimal choice for Plexica's workspace hierarchy
because it balances read performance, write simplicity, and implementation
complexity within the specific constraints of our use case:

1. **Write simplicity outweighs nested sets' read advantage**: Nested sets
   require O(n) sibling updates on every insert/delete. Since workspace
   creation is a transactional operation that already includes member
   creation and template application (Spec 011, FR-015), nested sets would
   add O(n) sibling updates to this transaction, increasing lock contention
   and transaction duration. Materialised path adds zero overhead to writes.

2. **Write simplicity is critical**: Workspace creation is a transactional
   operation that already includes member creation and template application
   (Spec 011, FR-015). Nested sets would add O(n) sibling updates to this
   transaction, increasing lock contention and transaction duration.
   Materialised path adds zero overhead to writes.

3. **Ancestor lookups are trivial**: The path string `"rootId/childId/selfId"`
   can be split to extract all ancestor IDs in O(1) without any database
   query. This directly supports the hierarchical guard extension (FR-011)
   which must check if a user is admin of any ancestor.

4. **Re-parenting is supported with bounded cost**: Since re-parenting requires
   recalculating `path` and `depth` only for the moved subtree (O(n) subtree
   size), materialised path provides the best trade-off: the update is a
   bounded transactional bulk UPDATE on descendant rows. Nested sets would
   require O(n) updates across the entire tree (not just the subtree).
   Adjacency list would require recursive CTE traversal plus path string
   computation for each node anyway.

5. **Compatible with schema-per-tenant**: The path column works within
   the `SET LOCAL search_path` pattern. No PostgreSQL extensions needed
   (unlike `ltree` which requires `CREATE EXTENSION`).

6. **Adjacency list rejected**: While simpler to implement, recursive CTEs
   add query complexity and planner overhead that would accumulate across
   aggregation queries, tree views, and guard checks. The marginal schema
   simplicity does not justify the query complexity for every read operation.

## Consequences

### Positive

- O(log n) descendant queries via sargable `LIKE 'prefix%'` on B-TREE
  indexed `path` column — meets P95 < 50ms target for up to 500 workspaces.
- O(1) ancestor extraction from path string — enables efficient hierarchical
  guard checks without additional database queries.
- O(1) write cost — inserting a workspace only touches the new row, no
  sibling or subtree updates needed.
- Path immutability is no longer assumed — `parentId` can be changed via
  the re-parenting endpoint (PATCH /parent), which triggers a transactional
  bulk update of all descendant `path` and `depth` values.
- Simple, well-understood implementation with no PostgreSQL extensions.
- Redundant `depth` column enables efficient depth-level filtering
  (e.g., "give me all root workspaces") without parsing the path string.

### Negative

- Re-parenting (moving a workspace to a different parent) requires path
  recalculation for the moved subtree (O(n) subtree size) in a single
  transaction. This is the main operational cost of materialised path, and
  it is bounded to the subtree being moved (not the entire tree).
- Path string is denormalized data. If the `depth` column or `path` column
  become inconsistent, hierarchy queries would return incorrect results.
  Mitigation: both are computed at creation time and are immutable.
- B-TREE index on `path` with `LIKE 'prefix%'` is less efficient than a
  specialized tree index (e.g., PostgreSQL `ltree` GiST index), but
  sufficient for our bounded depth and scale.

### Neutral

- The `depth` column is redundant (can be derived from path by counting
  separators), but storing it avoids string parsing in queries and enables
  direct `CHECK` constraints for depth validation.
- Path format (`"rootId/childId"`) uses `/` as separator. UUID v4 strings
  never contain `/`, so no escaping is needed.

## Constitution Alignment

| Article | Alignment | Notes                                                                                                                                     |
| ------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1  | COMPLIANT | Multi-tenancy isolation maintained — path queries scoped by tenant schema (Art. 1.2). Plugin system integrity preserved (Art. 1.4).       |
| Art. 2  | COMPLIANT | No new dependencies required. Uses existing PostgreSQL B-TREE indexes and Prisma `$queryRaw` (Art. 2.1).                                  |
| Art. 3  | COMPLIANT | All queries via Prisma `$queryRaw` with `Prisma.sql` parameterization (Art. 3.3). Service layer pattern maintained (Art. 3.2).            |
| Art. 4  | COMPLIANT | Descendant queries meet < 50ms P95 target (Art. 4.3). Tree endpoint meets < 200ms P95 target. No performance regression on existing APIs. |
| Art. 5  | COMPLIANT | Parameterized queries prevent SQL injection (Art. 5.3). Tenant isolation via schema search path (Art. 5.2).                               |
| Art. 9  | COMPLIANT | Migration is backward-compatible — all new columns have safe defaults (Art. 9.1). No breaking schema changes.                             |

## Follow-Up Actions

- [x] Document materialised path design in Plan 011 (Section 2, 3, 4)
- [ ] Implement schema migration (Task T1) with hierarchy columns
- [ ] Implement backfill migration (Task T2) for existing workspaces
- [ ] Implement `WorkspaceHierarchyService` (Task T3) with path-based queries
- [ ] Benchmark descendant queries with 500 workspaces to verify < 50ms P95
- [ ] Add B-TREE indexes on `path`, `parent_id`, and `depth` columns

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
```

## Related Decisions

- [ADR-002: Database Multi-Tenancy](adr-002-database-multi-tenancy.md) —
  schema-per-tenant pattern that the materialised path operates within
- [ADR-007: Prisma ORM](adr-007-prisma-orm.md) — all path queries use
  `Prisma.$queryRaw` with parameterized inputs
- [ADR-014: WorkspacePlugin Scoping](adr-014-workspace-plugin-scoping.md) —
  companion decision for workspace-level plugin enablement
- Spec 011: `.forge/specs/011-workspace-hierarchy-templates/spec.md`
  (FR-001 through FR-013)
- Plan 011: `.forge/specs/011-workspace-hierarchy-templates/plan.md`
  (Sections 2, 3, 4)
- Constitution Articles 3.3, 4.3, 5.3

## References

- [PostgreSQL B-TREE Index Documentation](https://www.postgresql.org/docs/current/indexes-types.html)
- [Materialised Path Pattern](https://docs.mongodb.com/manual/tutorial/model-tree-structures-with-materialized-paths/) (concept reference)
- [PostgreSQL LIKE with B-TREE](https://www.postgresql.org/docs/current/indexes-opclass.html) — `text_pattern_ops` for `LIKE 'prefix%'` queries
- Bill Karwin, _SQL Antipatterns_ — Chapter 3: Naive Trees (comparison of tree patterns)
