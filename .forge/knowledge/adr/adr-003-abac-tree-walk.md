# ADR-003: ABAC Tree-Walk for Workspace Isolation

**Date**: March 2026
**Status**: Accepted
**Deciders**: Plexica Team

## Context

Within a tenant, Plexica organizes resources into workspaces that can be nested in a hierarchy. Users can hold different roles at different levels of this hierarchy — for example, an `admin` of a parent workspace and a `viewer` in a sibling workspace. The authorization system must resolve the effective permission for a user on any resource by considering roles inherited through the workspace tree.

Keycloak (ADR-002) handles authentication and tenant-level roles. Workspace-level authorization is too granular and hierarchical for Keycloak's realm-based model and must be handled in the application layer.

## Decision

Use **Attribute-Based Access Control (ABAC) with tree-walk inheritance**. When checking whether a user can perform an action on a resource, the system walks up the workspace tree from the resource's workspace to the tenant root, collecting the user's role assignments at each level. The **most-permissive role wins** (inheritance model).

Key implementation details:

- Authorization boundary: Keycloak owns authentication + tenant-level roles (`super_admin`, `tenant_admin`, `member`). The core backend owns workspace-level ABAC (`workspace_admin`, `editor`, `viewer`).
- The tree-walk is implemented as a core service (`WorkspaceAuthorizationService`), invoked by route-level middleware.
- The workspace tree and user role assignments are cached in Redis with event-driven invalidation via Kafka.
- Maximum workspace nesting depth is capped at 10 levels to bound authorization query time.
- Role hierarchy: `workspace_admin` > `editor` > `viewer`. A role at a parent workspace grants at least that role in all descendants.

## Consequences

### Positive

- Fine-grained permissions at any level of the workspace hierarchy
- Intuitive inheritance model — admin of a parent workspace is automatically admin of children
- Clean separation of concerns: Keycloak handles identity, the core backend handles workspace authorization
- Works with any workspace depth up to the configured limit
- Extensible — new roles or permission attributes can be added without changing the tree-walk algorithm

### Negative

- Tree-walk has O(depth) queries per authorization check without caching
- More complex to reason about than flat RBAC — "why does this user have access?" requires tracing the tree
- Cache layer adds infrastructure dependency (Redis) and invalidation complexity

### Risks

- **Deep workspace trees cause slow auth checks**: Each level requires a role lookup. Mitigated by Redis caching of the materialized workspace tree and user role map, reducing tree-walk to in-memory traversal. The depth cap (10 levels) provides a hard bound.
- **Cache invalidation on role changes**: A role change at a parent workspace must invalidate cached permissions for all descendants. Mitigated by event-driven invalidation — role change events published to Kafka trigger targeted cache eviction by workspace subtree.
- **Most-permissive-wins may over-grant**: A user with `admin` on a parent cannot be restricted to `viewer` on a specific child. This is a deliberate design choice for simplicity. If deny-overrides are needed in the future, the tree-walk can be extended to support explicit deny rules.

## Alternatives Considered

### Flat RBAC (Single Role Per User Per Tenant)

- Each user gets one role at the tenant level that applies uniformly to all workspaces.
- Rejected because: too coarse-grained. Real-world tenants need different access levels for different workspaces — e.g., engineering workspace vs. finance workspace within the same tenant.

### Keycloak Authorization Services

- Use Keycloak's built-in authorization server with resource-based policies.
- Rejected because: it would couple workspace structure to Keycloak configuration, requiring Keycloak Admin API calls whenever workspaces are created or restructured. The policy language is poorly suited for tree hierarchies, and debugging authorization decisions through Keycloak's evaluation API is significantly harder than application-level logging.

### Open Policy Agent (OPA)

- Deploy OPA as a sidecar and define workspace policies in Rego.
- Rejected because: adds an infrastructure dependency (OPA sidecar or server), requires the team to learn Rego, and introduces network latency on every authorization check. The workspace tree-walk logic is straightforward enough to implement directly in TypeScript without a general-purpose policy engine.
