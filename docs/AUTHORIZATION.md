# Authorization System (RBAC + ABAC)

**Last Updated**: March 7, 2026  
**Status**: ✅ Implemented (RBAC + ABAC deny-only overlay + Frontend UI)  
**Spec Reference**: [`.forge/specs/003-authorization/spec.md`](../.forge/specs/003-authorization/spec.md)

> **Frontend UI (Spec 003 Phase 3)**: The Access Control management UI is now live. Tenant
> admins can manage roles, permissions, user role assignments, and ABAC policies directly
> in the app at `/access-control/*`. See the routes under `apps/web/src/routes/access-control.*`
> and the reusable components under `apps/web/src/components/authorization/`.

> ⚠️ **Model Update (Spec 003)**: The prior authorization model described in earlier versions of this document — specifically the ABAC `ALLOW` effect and `INCONCLUSIVE` evaluation state — has been **superseded** by [Spec 003](../.forge/specs/003-authorization/spec.md). The authoritative model is now:
>
> - **ABAC is deny-only**: effects are `DENY` and `FILTER` only; ABAC policies cannot grant access that RBAC would not already allow.
> - **No `INCONCLUSIVE` state**: policy evaluation is fail-closed — if ABAC evaluation fails, access is denied.
>
> See [Spec 003 §10](../.forge/specs/003-authorization/spec.md) for the complete authoritative specification.

---

## 📋 Implementation Status

| Component              | Status         | Completion | Notes                                                                               |
| ---------------------- | -------------- | ---------- | ----------------------------------------------------------------------------------- |
| RBAC (Role-Based)      | ✅ Implemented | 100%       | Fully functional, production-ready                                                  |
| Custom Roles           | ✅ Implemented | 100%       | Tenant admins can create up to 50 custom roles                                      |
| Permission Management  | ✅ Implemented | 100%       | CRUD operations for roles/permissions, plugin permission registration               |
| ABAC (Attribute-Based) | ✅ Implemented | 100%       | Deny-only overlay — policies can DENY or FILTER; cannot grant access                |
| Policy Engine          | ✅ Implemented | 100%       | ConditionValidator + PolicyService with Redis-cached evaluation                     |
| Plugin Permissions     | ✅ Implemented | 100%       | Auto-registration on plugin install via PermissionRegistrationService               |
| Frontend UI (Phase 3)  | ✅ Implemented | 100%       | Roles/Users/Policies screens + ConditionBuilder + sidebar nav (`/access-control/*`) |

**Overall Completion**: 100%

> See [Spec 003](../.forge/specs/003-authorization/spec.md) for the full authoritative specification.

---

## Overview

Plexica's authorization system is a **hybrid RBAC + ABAC** model:

- **RBAC (Role-Based Access Control)**: Simple, performant role-to-permission mappings for common access patterns
- **ABAC (Attribute-Based Access Control)**: Deny-only overlay for fine-grained access control — policies can DENY or FILTER access but cannot grant what RBAC does not already allow

### Architecture

```
┌─────────────┐
│   Request   │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ Extract User Context│
│ (JWT → User + Roles)│
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  RBAC Check         │
│  - Get user roles   │
│  - Get permissions  │
│  - Check required   │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  Decision: ALLOW    │
│  or DENY (403)      │
└─────────────────────┘
```

### Target Architecture (RBAC + ABAC)

```
┌─────────────┐
│   Request   │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ Extract Context     │
│ (User, Resource,    │
│  Action, Env)       │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  RBAC Check         │
│  Fast permission    │
│  lookup             │
└──────┬──────────────┘
       │
       ├─ ALLOW ────────────────┐
       │                         │
       ├─ DENY ─────────────────┤
       │                         │
       └─ INCONCLUSIVE          │
              │                  │
              ▼                  │
       ┌─────────────────────┐  │
       │  ABAC Check         │  │
       │  Policy evaluation  │  │
       │  (if needed)        │  │
       └──────┬──────────────┘  │
              │                  │
              ▼                  │
       ┌─────────────────────┐  │
       │  Final Decision     │◄─┘
       │  ALLOW or DENY      │
       └─────────────────────┘
```

---

## RBAC Implementation (Current)

### Permission Format

Permissions use the format `resource:action`:

```
users:read          # Read user data
users:write         # Create/update users
users:delete        # Delete users
plugins:install     # Install plugins
crm:contacts:*      # All actions on CRM contacts (wildcard - NOT YET SUPPORTED)
```

**Naming Convention**:

- **Resource**: Singular noun (e.g., `user`, `plugin`, `tenant`)
- **Action**: Verb (e.g., `read`, `write`, `delete`, `install`)
- **Namespace**: Plugin-scoped (e.g., `crm:contacts:read`)

### System Roles (Built-in)

| Role           | Scope    | Description                            | Immutable |
| -------------- | -------- | -------------------------------------- | --------- |
| `super_admin`  | Platform | Platform-wide access, cross-tenant ops | Yes       |
| `tenant_admin` | Tenant   | Full access within tenant              | Yes       |
| `team_admin`   | Team     | Manage team members and resources      | Yes       |
| `user`         | Tenant   | Basic user access                      | Yes       |

**System roles cannot be edited or deleted.**

### Custom Roles

Tenant admins can create custom roles with specific permission sets:

```typescript
// Example: Create "Sales Manager" role
const role = await permissionService.createRole({
  name: 'Sales Manager',
  tenantId: 'tenant-123',
  permissions: [
    'crm:contacts:read',
    'crm:contacts:write',
    'crm:deals:read',
    'crm:deals:write',
    'analytics:reports:read',
  ],
});
```

### Permission Inheritance

User permissions are calculated as the **union** of:

1. Direct role permissions
2. Team role permissions
3. Workspace role permissions

```typescript
// Example: User permission calculation
const userPermissions = [
  ...directRolePermissions, // From assigned roles
  ...teamRolePermissions, // From team memberships
  ...workspaceRolePermissions, // From workspace memberships
];

// Permissions are additive (union)
const hasPermission = userPermissions.includes('users:read');
```

---

## API Reference (Current Implementation)

### PermissionService

**Location**: `apps/core-api/src/services/permission.service.ts`

#### Key Methods

```typescript
class PermissionService {
  // Get all permissions for a user (RBAC)
  async getUserPermissions(userId: string, tenantId: string): Promise<string[]>;

  // Check if user has a specific permission
  async hasPermission(userId: string, tenantId: string, permission: string): Promise<boolean>;

  // Check if user has all required permissions
  async hasAllPermissions(
    userId: string,
    tenantId: string,
    permissions: string[]
  ): Promise<boolean>;

  // Create custom role (tenant-scoped)
  async createRole(data: CreateRoleDto): Promise<Role>;

  // Update role permissions
  async updateRolePermissions(roleId: string, permissions: string[]): Promise<Role>;

  // Assign role to user
  async assignRole(userId: string, roleId: string): Promise<void>;

  // Remove role from user
  async removeRole(userId: string, roleId: string): Promise<void>;
}
```

### Middleware

**Location**: `apps/core-api/src/middleware/auth.ts`

```typescript
// Require authentication (JWT validation)
app.get('/api/resource', { preHandler: authMiddleware }, handler);

// Require specific role
app.get(
  '/api/admin/tenants',
  {
    preHandler: requireRole('super_admin'),
  },
  handler
);

// Require tenant access
app.get(
  '/api/tenants/:id/settings',
  {
    preHandler: [authMiddleware, requireTenantAccess],
  },
  handler
);

// Optional authentication (public endpoints with context)
app.get(
  '/api/public/plugins',
  {
    preHandler: optionalAuthMiddleware,
  },
  handler
);
```

### Usage Examples

#### Check Permission in Controller

```typescript
// apps/core-api/src/routes/user.ts
import { permissionService } from '../services/permission.service.js';

app.delete('/api/users/:id', async (request, reply) => {
  const { id } = request.params;
  const user = request.user; // From authMiddleware

  // Check permission
  const hasPermission = await permissionService.hasPermission(
    user.id,
    user.tenantId,
    'users:delete'
  );

  if (!hasPermission) {
    return reply.code(403).send({
      error: 'AUTHORIZATION_DENIED',
      message: 'You do not have permission to delete users',
    });
  }

  // Proceed with deletion
  await userService.deleteUser(id);
  return reply.code(204).send();
});
```

#### Create Custom Role (Admin UI)

```typescript
// apps/web/src/routes/settings/roles.tsx
const createRole = async () => {
  const response = await fetch('/api/v1/roles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Content Editor',
      permissions: ['cms:pages:read', 'cms:pages:write', 'cms:media:read', 'cms:media:write'],
    }),
  });

  const role = await response.json();
  console.log('Role created:', role.id);
};
```

---

## ABAC Implementation (Planned)

> ⚠️ **Not Yet Implemented** - Specification approved, implementation planned for next sprint

### Policy Engine Design

**Database Schema** (to be added):

```prisma
model Policy {
  id          String       @id @default(uuid())
  name        String
  source      PolicySource // CORE, PLUGIN, SUPER_ADMIN, TENANT_ADMIN
  tenantId    String?      // null for global policies
  effect      PolicyEffect // ALLOW, DENY
  actions     String[]     // e.g., ["crm:deals:read", "crm:deals:write"]
  resources   String[]     // e.g., ["crm:deals:*"]
  conditions  Json         // Attribute-based conditions
  priority    Int          @default(0)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@schema("core")
}

enum PolicySource {
  CORE          // Immutable core policies
  PLUGIN        // Plugin-defined policies
  SUPER_ADMIN   // Global policies
  TENANT_ADMIN  // Tenant-scoped policies

  @@schema("core")
}

enum PolicyEffect {
  ALLOW
  DENY

  @@schema("core")
}
```

### Policy Condition Syntax

Policies will support attribute-based conditions:

```json
{
  "name": "Sales Team Access Policy",
  "effect": "ALLOW",
  "actions": ["crm:deals:read", "crm:deals:write"],
  "resources": ["crm:deals:*"],
  "conditions": {
    "and": [
      {
        "attribute": "user.team",
        "operator": "equals",
        "value": "Sales"
      },
      {
        "attribute": "resource.owner",
        "operator": "equals",
        "value": "${user.team}"
      }
    ]
  }
}
```

**Supported Operators**:

- `equals`, `notEquals`
- `in`, `notIn`
- `contains`, `notContains`
- `greaterThan`, `lessThan`, `greaterOrEqual`, `lessOrEqual`
- `matches` (regex)

**Available Attributes**:

- `user.*`: User attributes (id, email, team, department, role)
- `resource.*`: Resource attributes (owner, team, status, createdAt)
- `environment.*`: Environment context (time, day, ip, location)
- `tenant.*`: Tenant attributes (plan, features, settings)

### Authorization Flow (RBAC → ABAC)

```typescript
// Planned implementation in apps/core-api/src/services/permission.service.ts

async function authorize(context: AuthContext): Promise<Decision> {
  // 1. Extract context
  const { user, resource, action, environment } = context;

  // 2. RBAC Check (fast path)
  const rbacDecision = await checkRBAC(user, action);

  if (rbacDecision === 'ALLOW') {
    return { effect: 'ALLOW', reason: 'RBAC' };
  }

  if (rbacDecision === 'DENY' && !hasABACPolicies(action)) {
    return { effect: 'DENY', reason: 'RBAC' };
  }

  // 3. ABAC Check (if RBAC inconclusive or DENY with policies)
  const policies = await getPoliciesForAction(action, user.tenantId);

  for (const policy of policies) {
    const match = evaluatePolicy(policy, context);

    if (match && policy.effect === 'DENY') {
      // DENY policies override ALLOW
      return { effect: 'DENY', reason: 'ABAC', policy: policy.id };
    }

    if (match && policy.effect === 'ALLOW') {
      return { effect: 'ALLOW', reason: 'ABAC', policy: policy.id };
    }
  }

  // 4. Default deny
  return { effect: 'DENY', reason: 'DEFAULT' };
}
```

### Example Policies

**Policy 1: Sales Team Access**

```json
{
  "name": "Sales Team Can Access Own Deals",
  "effect": "ALLOW",
  "actions": ["crm:deals:read", "crm:deals:write"],
  "conditions": {
    "and": [
      { "attribute": "user.team", "operator": "equals", "value": "Sales" },
      { "attribute": "resource.team", "operator": "equals", "value": "${user.team}" }
    ]
  }
}
```

**Policy 2: Time-Based Access**

```json
{
  "name": "Admin Access Only During Business Hours",
  "effect": "DENY",
  "actions": ["users:delete", "tenants:delete"],
  "conditions": {
    "or": [
      { "attribute": "environment.hour", "operator": "lessThan", "value": 9 },
      { "attribute": "environment.hour", "operator": "greaterThan", "value": 17 }
    ]
  }
}
```

**Policy 3: Plugin-Contributed Policy**

```json
{
  "name": "CRM Deal Approval Workflow",
  "source": "PLUGIN",
  "effect": "DENY",
  "actions": ["crm:deals:approve"],
  "conditions": {
    "and": [
      { "attribute": "resource.value", "operator": "greaterThan", "value": 10000 },
      { "attribute": "user.role", "operator": "notIn", "value": ["manager", "director"] }
    ]
  }
}
```

---

## Plugin Permission Registration

> ⚠️ **Partially Implemented** - Manual registration works, auto-registration planned

### Current: Manual Registration

Plugin developers must manually call `registerPermissions`:

```typescript
// In plugin code (apps/plugins/crm/src/index.ts)
import { core } from '@plexica/sdk';

await core.permissions.registerPermissions([
  {
    id: 'crm:contacts:read',
    name: 'Read Contacts',
    description: 'View contact information',
  },
  {
    id: 'crm:contacts:write',
    name: 'Write Contacts',
    description: 'Create and update contacts',
  },
  {
    id: 'crm:deals:read',
    name: 'Read Deals',
    description: 'View deal information',
  },
  {
    id: 'crm:deals:write',
    name: 'Write Deals',
    description: 'Create and update deals',
  },
]);
```

### Planned: Auto-Registration from Manifest

Permissions will be automatically registered from plugin manifest:

```json
{
  "id": "crm",
  "version": "1.0.0",
  "permissions": {
    "contacts": {
      "read": {
        "name": "Read Contacts",
        "description": "View contact information"
      },
      "write": {
        "name": "Write Contacts",
        "description": "Create and update contacts"
      }
    },
    "deals": {
      "read": { "name": "Read Deals", "description": "..." },
      "write": { "name": "Write Deals", "description": "..." },
      "delete": { "name": "Delete Deals", "description": "..." }
    }
  }
}
```

**On plugin enable**: Permissions automatically registered in `permissions` table  
**On plugin disable**: Permissions removed from roles (roles not deleted)

---

## Testing

### Current Tests (RBAC)

**Location**: `apps/core-api/src/__tests__/auth/`

```bash
# Run authorization tests
cd apps/core-api
pnpm test -- auth/

# Results: 89 tests, 65% coverage
```

**Test Coverage**:

- ✅ Role creation/deletion
- ✅ Permission assignment
- ✅ Permission inheritance (user + team + workspace)
- ✅ System role immutability
- ✅ Tenant isolation (cross-tenant permission checks)

### Planned Tests (ABAC)

Target: 60+ additional tests for ABAC, ≥80% coverage

- [ ] Policy creation/deletion
- [ ] Policy condition evaluation (all operators)
- [ ] RBAC → ABAC flow
- [ ] DENY override ALLOW
- [ ] Time-based policies
- [ ] Attribute interpolation
- [ ] Policy priority/ordering
- [ ] Performance (< 50ms P95 for authorization check)

---

## Migration Guide

### For Existing Applications

When ABAC is implemented, existing RBAC code will continue to work:

**Before (RBAC only)**:

```typescript
const hasPermission = await permissionService.hasPermission(userId, tenantId, 'crm:deals:write');
```

**After (RBAC + ABAC)**:

```typescript
// Same API, now checks RBAC first, then ABAC if needed
const hasPermission = await permissionService.hasPermission(
  userId,
  tenantId,
  'crm:deals:write',
  { resourceContext: { dealId: '123', ownerId: 'user-456' } } // Optional
);
```

### For Plugin Developers

**Current**: Manual permission registration

```typescript
await core.permissions.registerPermissions([...]);
```

**After ABAC**: Declare in manifest (auto-registration)

```json
{
  "permissions": { ... }
}
```

---

## Performance Considerations

### RBAC Performance (Current)

- **Cache**: User permissions cached in Redis (5-minute TTL)
- **Latency**: P95 < 10ms (cached), P95 < 50ms (uncached)
- **Optimization**: Permissions loaded once per request in middleware

### ABAC Performance (Target)

- **Cache**: Policy evaluation results cached per (user, resource, action) tuple
- **Latency Target**: P95 < 50ms (including policy evaluation)
- **Optimization**:
  - Policy indexing by action/resource
  - Short-circuit evaluation (DENY policies checked first)
  - Parallel policy evaluation when possible

---

## Security Considerations

### RBAC Security

✅ **Implemented**:

- Tenant isolation enforced at permission check level
- System roles immutable (cannot be edited/deleted)
- Permission checks logged for audit trail
- Cross-tenant access prevented by tenant context middleware

### ABAC Security (Planned)

🔒 **Required**:

- Policy validation at creation (prevent malicious conditions)
- Attribute sanitization (prevent injection attacks)
- Policy source verification (only trusted sources can create CORE policies)
- Rate limiting on policy evaluation (prevent DoS)

---

## Roadmap

### Phase 1: RBAC Only (✅ Complete)

- [x] Permission format and schema
- [x] System roles (super_admin, tenant_admin, user)
- [x] Custom roles per tenant
- [x] Permission middleware
- [x] 89 tests, 65% coverage

### Phase 2: ABAC Implementation (⏳ In Progress)

- [ ] Database schema for policies
- [ ] Policy engine implementation
- [ ] Condition evaluator (all operators)
- [ ] RBAC → ABAC authorization flow
- [ ] Plugin permission auto-registration
- [ ] 60+ additional tests, ≥80% coverage

### Phase 3: Advanced Features (🔮 Future)

- [ ] Wildcard permissions (`crm:deals:*`)
- [ ] Policy simulation/dry-run mode
- [ ] Policy conflict detection
- [ ] Permission analytics dashboard
- [ ] Policy templates library

---

## FAQ

### Q: Why hybrid RBAC + ABAC instead of just RBAC?

**A**: RBAC is simple and fast but cannot express fine-grained rules like "users can only see data from their own department." ABAC enables these complex policies without creating hundreds of roles.

### Q: Will ABAC make authorization slower?

**A**: RBAC remains the fast path (< 10ms). ABAC only runs when RBAC is inconclusive or when attribute-based policies exist. Target: < 50ms P95 including ABAC.

### Q: Can I use ABAC now?

**A**: No, ABAC is not yet implemented. Only RBAC is available. ABAC is planned for the next sprint (3 weeks).

### Q: Will my existing RBAC code break when ABAC is added?

**A**: No, existing RBAC code will continue to work without changes. ABAC extends the system, does not replace it.

### Q: How do I contribute a policy from my plugin?

**A**: (After ABAC implementation) Declare policies in your plugin manifest under the `policies` key. They will be automatically registered when the plugin is enabled.

---

## Frontend UI (Phase 3)

The authorization management UI is available to tenant admins at `/access-control/*`.

### Routes

| Path                                      | Description                                              |
| ----------------------------------------- | -------------------------------------------------------- |
| `/access-control/roles`                   | List all roles, search, create/delete custom roles       |
| `/access-control/roles/create`            | Create a new custom role with permission selection       |
| `/access-control/roles/:roleId`           | Read-only role detail view                               |
| `/access-control/roles/:roleId/edit`      | Edit name/description/permissions for custom roles       |
| `/access-control/users`                   | List tenant users and manage their role assignments      |
| `/access-control/policies`                | List ABAC policies (hidden behind `featureEnabled` flag) |
| `/access-control/policies/create`         | Create a new ABAC policy with ConditionBuilder           |
| `/access-control/policies/:policyId/edit` | Edit an existing ABAC policy                             |

### Key Components

- `apps/web/src/components/authorization/` — reusable authorization UI components
  - `ConditionBuilder` — recursive ABAC condition tree editor (max 20 conditions, depth 5)
  - `ConditionGroup` / `ConditionRow` / `NotGroup` — sub-components for condition tree nodes
  - `PolicySummary` — compact read-only condition tree display
  - `SystemRoleBadge` / `EffectBadge` — status indicators
  - `RoleAssignmentDialog` — modal for assigning/removing roles from a user

### API Hooks

- `apps/web/src/hooks/useAuthorizationApi.ts` — raw fetch wrappers for all Spec 003 endpoints
- `apps/web/src/hooks/usePermissions.ts` — `usePermissions(filters?)` query hook
- `apps/web/src/hooks/usePolicies.ts` — `usePolicies`, `useCreatePolicy`, `useUpdatePolicy`, `useDeletePolicy`
- `apps/web/src/hooks/useRoles.ts` — extended with Spec 003 role CRUD mutations

---

## References

- **FORGE Spec**: [`.forge/specs/003-authorization/spec.md`](../.forge/specs/003-authorization/spec.md)
- **Constitution**: [`.forge/constitution.md`](../.forge/constitution.md) Article 5 (Security)
- **Implementation**: `apps/core-api/src/services/permission.service.ts`
- **Tests**: `apps/core-api/src/__tests__/auth/`
- **Middleware**: `apps/core-api/src/middleware/auth.ts`

---

**Document Version**: 1.0  
**Last Updated**: February 16, 2026  
**Next Review**: After ABAC implementation
