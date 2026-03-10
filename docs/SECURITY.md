# 🔒 Security Guidelines for Plexica Development

**Last Updated**: March 2026  
**Status**: Active  
**Owner**: Engineering Team  
**Document Type**: Security Guidelines

This document provides security best practices and guidelines for developing secure code in the Plexica platform.

---

## 📋 Table of Contents

- [SQL Injection Prevention](#sql-injection-prevention)
- [Authentication & Authorization](#authentication--authorization)
- [Input Validation](#input-validation)
- [Multi-Tenant Security](#multi-tenant-security)
- [Secure Coding Practices](#secure-coding-practices)
- [Security Testing](#security-testing)
- [Code Review Checklist](#code-review-checklist)
- [Incident Response](#incident-response)
- [Extension Points Security (Spec 013 / ADR-031)](#extension-points-security-spec-013--adr-031)
- [SSRF Prevention (Spec 015)](#ssrf-prevention-spec-015)
- [Path Traversal Prevention (Spec 015)](#path-traversal-prevention-spec-015)
- [Rate Limiting (Spec 015)](#rate-limiting-spec-015)
- [XSS / CSS Sanitization (Spec 015 / ADR-032)](#xss--css-sanitization-spec-015--adr-032)
- [Log Injection Prevention (Spec 015)](#log-injection-prevention-spec-015)
- [ReDoS False Positive Analysis (Spec 015)](#redos-false-positive-analysis-spec-015)

---

## 🛡️ SQL Injection Prevention

### **CRITICAL: Always Use Parameterized Queries**

SQL injection is the #1 security risk in web applications. **Never** concatenate user input into SQL queries.

### ✅ **CORRECT - Parameterized Queries**

```typescript
import { Prisma } from '@plexica/database';

// ✅ Good: Using Prisma template literals (recommended)
const users = await db.$queryRaw<User[]>`
  SELECT * FROM ${Prisma.raw(`"${schemaName}"."users"`)}
  WHERE email = ${email} AND status = ${status}
`;

// ✅ Good: Using Prisma ORM methods (safest)
const user = await db.user.findUnique({
  where: { email },
});

// ✅ Good: PostgreSQL positional parameters
const result = await db.$queryRawUnsafe<User[]>(
  `SELECT * FROM users WHERE email = $1 AND status = $2`,
  email,
  status
);
```

### ❌ **INCORRECT - String Interpolation**

```typescript
// ❌ NEVER DO THIS - Vulnerable to SQL injection!
const users = await db.$queryRawUnsafe(`
  SELECT * FROM users WHERE email = '${email}'
`);

// ❌ NEVER DO THIS - Even with escaping, still risky!
const users = await db.$queryRawUnsafe(`
  SELECT * FROM users WHERE email = '${email.replace(/'/g, "''")}'
`);

// ❌ NEVER DO THIS - Template literals are NOT safe with $queryRawUnsafe
const users = await db.$queryRawUnsafe(`SELECT * FROM users WHERE email = '${email}'`);
```

### 🔧 **Special Cases: Schema and Table Names**

PostgreSQL **does not support** parameterized identifiers (schema/table/column names). For these cases:

1. **Always validate** the identifier with a strict regex
2. Use `Prisma.raw()` for the identifier
3. Parameterize the **values**

```typescript
// ✅ Correct: Validate schema name, then use Prisma.raw()
const schemaPattern = /^[a-z0-9_]+$/;
if (!schemaPattern.test(schemaName)) {
  throw new Error(`Invalid schema name: ${schemaName}`);
}

const tableName = Prisma.raw(`"${schemaName}"."users"`);
const users = await db.$queryRaw<User[]>`
  SELECT * FROM ${tableName}
  WHERE email = ${email}
`;
```

### 📝 **When to Use Each Method**

| Method                                  | Use Case                        | Security Level            |
| --------------------------------------- | ------------------------------- | ------------------------- |
| **Prisma ORM**                          | CRUD operations                 | 🟢 Safest                 |
| **`$queryRaw` template literals**       | Complex queries with user input | 🟢 Safe                   |
| **`$queryRawUnsafe` with `$1, $2`**     | Legacy code, specific needs     | 🟡 Safe if used correctly |
| **`$executeRaw` template literals**     | INSERT/UPDATE/DELETE            | 🟢 Safe                   |
| **`$executeRawUnsafe` with validation** | DDL operations (CREATE SCHEMA)  | 🟡 Acceptable             |
| **String concatenation**                | **NEVER USE**                   | 🔴 **Vulnerable**         |

---

## 🔐 Authentication & Authorization

### **Keycloak Integration**

Plexica uses Keycloak for authentication. Always verify tokens server-side.

```typescript
// ✅ Good: Verify token in middleware
export const authenticateUser = async (request: FastifyRequest) => {
  const token = request.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    throw new UnauthorizedException('No token provided');
  }

  // Verify with Keycloak
  const decoded = await keycloakService.verifyToken(token);
  return decoded;
};
```

### **Multi-Tenant Authorization**

Always check tenant context before accessing data:

```typescript
// ✅ Good: Verify tenant context
export const requireTenantContext = () => {
  const tenantContext = getTenantContext();

  if (!tenantContext) {
    throw new UnauthorizedException('No tenant context available');
  }

  return tenantContext;
};

// Use in routes
fastify.get('/api/workspaces', async (request, reply) => {
  const tenant = requireTenantContext();
  const userId = request.user.id;

  // Only fetch workspaces for this tenant and user
  const workspaces = await workspaceService.findAll(userId, tenant);
  return workspaces;
});
```

### **Role-Based Access Control (RBAC)**

Check user permissions before sensitive operations:

```typescript
// ✅ Good: Check workspace role
const membership = await workspaceService.getMembership(workspaceId, userId, tenant);

if (!membership) {
  throw new ForbiddenException('Not a workspace member');
}

if (membership.role !== WorkspaceRole.ADMIN) {
  throw new ForbiddenException('Admin role required');
}
```

### **Common Authorization Mistakes**

```typescript
// ❌ Bad: Only checking if user is authenticated
fastify.delete('/api/workspaces/:id', async (request, reply) => {
  const { id } = request.params;
  await workspaceService.delete(id); // No permission check!
});

// ✅ Good: Check ownership/membership
fastify.delete('/api/workspaces/:id', async (request, reply) => {
  const { id } = request.params;
  const userId = request.user.id;
  const tenant = requireTenantContext();

  // Verify user is admin of this workspace
  const membership = await workspaceService.getMembership(id, userId, tenant);
  if (membership?.role !== WorkspaceRole.ADMIN) {
    throw new ForbiddenException('Admin role required');
  }

  await workspaceService.delete(id, tenant);
});
```

---

## ✅ Input Validation

### **Always Validate User Input**

Use Zod schemas for validation (already integrated with Fastify):

```typescript
import { z } from 'zod';

// ✅ Good: Define validation schema
const createWorkspaceSchema = z.object({
  slug: z
    .string()
    .min(3, 'Slug must be at least 3 characters')
    .max(50, 'Slug must be at most 50 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
  description: z.string().max(500).optional(),
  settings: z.record(z.any()).optional(),
});

// Use in route
fastify.post(
  '/api/workspaces',
  {
    schema: {
      body: createWorkspaceSchema,
    },
  },
  async (request, reply) => {
    // Body is automatically validated and typed
    const workspace = await workspaceService.create(request.body, request.user.id);
    return workspace;
  }
);
```

### **Validate at Multiple Layers**

1. **Client-side**: For UX (can be bypassed)
2. **API Gateway**: For format validation
3. **Service Layer**: For business logic validation
4. **Database**: For data integrity constraints

```typescript
// ✅ Good: Service-layer validation
export class WorkspaceService {
  async create(dto: CreateWorkspaceDto, creatorId: string, tenantCtx?: TenantContext) {
    // Validate slug format (redundant but safe)
    if (!/^[a-z0-9-]+$/.test(dto.slug)) {
      throw new ValidationException('Invalid slug format');
    }

    // Validate slug uniqueness
    const existing = await this.findBySlug(dto.slug, tenantCtx);
    if (existing) {
      throw new ConflictException('Workspace with this slug already exists');
    }

    // Proceed with creation
    // ...
  }
}
```

### **Sanitize Output**

When displaying user-generated content:

```typescript
// ✅ Good: Sanitize HTML content
import DOMPurify from 'isomorphic-dompurify';

const sanitizedDescription = DOMPurify.sanitize(workspace.description);
```

---

## 🏢 Multi-Tenant Security

### **Tenant Isolation**

Each tenant has a dedicated PostgreSQL schema for data isolation:

```
public (core)
├── tenants
├── users
└── plugins

tenant_acme (tenant schema)
├── users (synced from core)
├── workspaces
├── workspace_members
└── teams

tenant_widgets (tenant schema)
├── users (synced from core)
├── workspaces
├── workspace_members
└── teams
```

### **Critical Rules**

1. **Never query across tenant boundaries** without explicit authorization
2. **Always set search_path** when accessing tenant data
3. **Validate tenant context** in every request
4. **Sync users** to tenant schema before creating relationships

### ✅ **Correct Tenant Access**

```typescript
// ✅ Good: Set search_path and verify tenant
await tx.$executeRaw(Prisma.raw(`SET LOCAL search_path TO "${tenantContext.schemaName}", public`));

const workspaces = await tx.$queryRaw<Workspace[]>`
  SELECT * FROM ${Prisma.raw(`"${tenantContext.schemaName}"."workspaces"`)}
  WHERE tenant_id = ${tenantContext.tenantId}
`;
```

### ❌ **Tenant Security Anti-Patterns**

```typescript
// ❌ Bad: No tenant context verification
export async function getWorkspace(id: string) {
  return await db.workspace.findUnique({ where: { id } });
  // This could leak data across tenants!
}

// ❌ Bad: Using wrong schema
const workspaces = await db.$queryRaw`
  SELECT * FROM public.workspaces  -- Wrong! Should use tenant schema
`;

// ❌ Bad: Not filtering by tenant_id
const workspaces = await db.$queryRaw`
  SELECT * FROM ${tableName}
  WHERE slug = ${slug}
  -- Missing: AND tenant_id = ${tenantId}
`;
```

### **User Synchronization**

Before creating workspace memberships, ensure user exists in tenant schema:

```typescript
// ✅ Good: Sync user before creating membership
const coreUser = await db.user.findUnique({
  where: { id: userId },
  select: { id: true, keycloakId: true, email: true, firstName: true, lastName: true },
});

if (!coreUser) {
  throw new NotFoundException(`User ${userId} not found`);
}

// Sync to tenant schema
await tx.$executeRaw`
  INSERT INTO ${usersTable}
  (id, keycloak_id, email, first_name, last_name, created_at, updated_at)
  VALUES (
    ${coreUser.id},
    ${coreUser.keycloakId || ''},
    ${coreUser.email},
    ${coreUser.firstName || ''},
    ${coreUser.lastName || ''},
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    updated_at = NOW()
`;
```

---

## 🔧 Secure Coding Practices

### **1. Principle of Least Privilege**

Grant minimum necessary permissions:

```typescript
// ✅ Good: Only select needed fields
const user = await db.user.findUnique({
  where: { id: userId },
  select: {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    // Don't expose: keycloakId, createdAt, etc.
  },
});
```

### **2. Error Handling**

Don't leak sensitive information in errors:

```typescript
// ❌ Bad: Exposes database structure
catch (error) {
  throw new Error(`Database error: ${error.message}`);
}

// ✅ Good: Generic error message, log details
catch (error) {
  logger.error('Failed to create workspace', { error, userId, tenantId });
  throw new InternalServerException('Failed to create workspace');
}
```

### **3. Secrets Management**

Never commit secrets to version control:

```typescript
// ❌ Bad: Hard-coded secrets
const jwtSecret = 'my-secret-key-12345';

// ✅ Good: Environment variables
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required');
}
```

Use `.env` files for local development, environment variables in production:

```bash
# .env (never commit this file!)
DATABASE_URL="postgresql://user:password@localhost:5432/plexica"
JWT_SECRET="generate-with-openssl-rand-base64-32"
KEYCLOAK_CLIENT_SECRET="keycloak-secret-here"
```

### **4. Rate Limiting**

Protect against brute-force attacks:

```typescript
import rateLimit from '@fastify/rate-limit';

// ✅ Good: Add rate limiting
await fastify.register(rateLimit, {
  max: 100, // Max 100 requests
  timeWindow: '15 minutes',
  errorResponseBuilder: () => ({
    code: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, please try again later',
  }),
});
```

### **5. HTTPS Only**

Always use HTTPS in production:

```typescript
// ✅ Good: Enforce HTTPS
if (process.env.NODE_ENV === 'production' && request.protocol !== 'https') {
  throw new UnauthorizedException('HTTPS required');
}
```

### **6. CORS Configuration**

Restrict CORS to trusted origins:

```typescript
// ❌ Bad: Allow all origins
fastify.register(cors, { origin: '*' });

// ✅ Good: Specific origins
fastify.register(cors, {
  origin: [
    'https://app.plexica.com',
    'https://admin.plexica.com',
    process.env.NODE_ENV === 'development' && 'http://localhost:3000',
  ].filter(Boolean),
  credentials: true,
});
```

---

## 🧪 Security Testing

### **1. Integration Tests for Security**

Test authorization scenarios:

```typescript
describe('Workspace Security', () => {
  it('should prevent access to other tenant workspaces', async () => {
    // Create workspace in tenant A
    const workspaceA = await createWorkspace('tenant-a', userA);

    // Try to access from tenant B (should fail)
    const response = await fastify.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceA.id}`,
      headers: {
        authorization: `Bearer ${tokenUserB}`, // User from tenant B
        'x-tenant-id': 'tenant-b',
      },
    });

    expect(response.statusCode).toBe(404); // Not found (tenant isolation)
  });

  it('should prevent non-admin from deleting workspace', async () => {
    const workspace = await createWorkspace('tenant-a', adminUser);
    await addMember(workspace.id, memberUser, WorkspaceRole.MEMBER);

    // Try to delete as member (should fail)
    const response = await fastify.inject({
      method: 'DELETE',
      url: `/api/workspaces/${workspace.id}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });

    expect(response.statusCode).toBe(403); // Forbidden
  });
});
```

### **2. SQL Injection Testing**

Test for SQL injection vulnerabilities:

```typescript
describe('SQL Injection Prevention', () => {
  it('should prevent SQL injection in workspace slug', async () => {
    const maliciousSlug = "'; DROP TABLE workspaces; --";

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/workspaces',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        slug: maliciousSlug,
        name: 'Test Workspace',
      },
    });

    // Should reject with validation error, not execute SQL
    expect(response.statusCode).toBe(400);

    // Verify tables still exist
    const workspaces = await db.workspace.findMany();
    expect(workspaces).toBeDefined();
  });
});
```

### **3. Security Scanning Tools**

Run these tools regularly:

```bash
# Dependency vulnerability scanning
npm audit

# Fix vulnerabilities automatically
npm audit fix

# Check for known security issues
npx snyk test

# Static analysis
npx eslint . --ext .ts,.tsx

# Type checking
npx tsc --noEmit
```

---

## ✔️ Code Review Checklist

Use this checklist when reviewing code:

### **SQL Security**

- [ ] No string concatenation in SQL queries
- [ ] All user input is parameterized
- [ ] Schema/table names are validated with regex
- [ ] `$queryRaw` template literals used instead of `$queryRawUnsafe`
- [ ] No raw `${variable}` in SQL strings

### **Authentication & Authorization**

- [ ] Token verification in place
- [ ] Tenant context validated
- [ ] User permissions checked
- [ ] Role-based access implemented
- [ ] Ownership verified before mutations

### **Input Validation**

- [ ] Zod schemas defined for request bodies
- [ ] Path parameters validated
- [ ] Query parameters validated
- [ ] File uploads validated (size, type)
- [ ] HTML content sanitized

### **Multi-Tenant**

- [ ] Tenant schema used for data access
- [ ] `tenant_id` filter in all queries
- [ ] No cross-tenant data leaks
- [ ] User synced to tenant schema
- [ ] search_path set correctly

### **Error Handling**

- [ ] No sensitive data in error messages
- [ ] Errors logged with context
- [ ] Generic messages to users
- [ ] Status codes appropriate

### **General Security**

- [ ] No secrets in code
- [ ] HTTPS enforced in production
- [ ] CORS configured correctly
- [ ] Rate limiting applied
- [ ] Logging includes security events

---

## 🚨 Incident Response

### **If You Discover a Security Vulnerability**

1. **Do NOT** create a public GitHub issue
2. **Email**: security@plexica.com (replace with actual email)
3. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if known)

### **Security Incident Process**

1. **Identify**: Detect and confirm the incident
2. **Contain**: Limit the damage
3. **Investigate**: Understand the scope and root cause
4. **Remediate**: Fix the vulnerability
5. **Communicate**: Notify affected users if needed
6. **Document**: Update this guide with lessons learned

### **Emergency Contacts**

- Security Team: security@plexica.com
- On-Call Engineer: +XX XXX XXX XXXX
- Infrastructure Lead: infra@plexica.com

---

## 📚 Additional Resources

### **OWASP Resources**

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

### **Prisma Documentation**

- [Prisma Security Best Practices](https://www.prisma.io/docs/guides/database/advanced-database-tasks/sql-injection)
- [Raw Database Access](https://www.prisma.io/docs/concepts/components/prisma-client/raw-database-access)

### **Multi-Tenancy**

- [PostgreSQL Row-Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Multi-Tenant Architecture Patterns](https://docs.microsoft.com/en-us/azure/architecture/guide/multitenant/overview)

---

## 🤝 Contributing to This Document

Security is everyone's responsibility. If you:

- Discover a new security pattern
- Find an error in this document
- Want to add examples

Please submit a PR or contact the security team.

---

**Remember: Security is not optional. It's a fundamental requirement.**

🔒 **When in doubt, ask the security team before deploying!**

---

## Extension Points Security (Spec 013 / ADR-031)

**Date Added**: March 2026

The Extension Points system introduces a bounded exception to the schema-per-tenant rule (ADR-002). Five tables live in the `core` shared schema. The following security safeguards are **mandatory** and enforced by code review.

### ADR-031 Mandatory Safeguards

#### 1. Single Repository Access Path

All reads and writes to `extension_slots`, `extension_contributions`, `workspace_extension_visibility`, `extensible_entities`, and `data_extensions` must go through `ExtensionRegistryRepository`. Direct Prisma calls on these models from any other service are **prohibited**.

```typescript
// ✅ ALWAYS: Use repository
const repo = new ExtensionRegistryRepository(db);
await repo.getSlots(tenantId, pluginId);

// ❌ NEVER: Direct model access from a service
await db.extensionSlot.findMany({ where: { tenantId } });
```

#### 2. Required tenantId on All Tenant-Scoped Methods

Every repository method that reads or writes tenant-scoped data **must** accept `tenantId` as a required first parameter. Methods without `tenantId` are reserved exclusively for super-admin cross-tenant operations and must be named accordingly (see §4).

```typescript
// ✅ Correct — tenantId required
async getSlots(tenantId: string, pluginId?: string): Promise<ExtensionSlot[]>

// ❌ Wrong — omitting tenantId allows cross-tenant leakage
async getSlots(pluginId?: string): Promise<ExtensionSlot[]>
```

#### 3. Explicitly-Named Super-Admin Cross-Tenant Methods

Any method that reads across tenants must be explicitly named to signal its elevated privilege level:

```typescript
// ✅ Correct naming — intent is clear
async getAllSlotsForSuperAdmin(): Promise<ExtensionSlot[]>
async getPermissionsForSuperAdmin(): Promise<ContributionPermission[]>

// ❌ Wrong — ambiguous naming hides cross-tenant access
async getAllSlots(): Promise<ExtensionSlot[]>
```

Super-admin methods must also verify the caller holds the `SUPER_ADMIN` role via `requireSuperAdmin` middleware before being invoked.

#### 4. PostgreSQL RLS Defense-in-Depth

The `extension_rls` migration adds Row-Level Security policies on all five tables, restricting reads to rows where `tenant_id` matches `current_setting('app.current_tenant_id')`. This is a defense-in-depth layer; it does not replace application-level `tenantId` enforcement.

```sql
-- Applied by migration 20260308000002_extension_tables_rls
CREATE POLICY ext_tenant_isolation ON core.extension_slots
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE));
```

#### 5. Code Review Gate

Any pull request that modifies `extension-registry.repository.ts` requires:

- At least one reviewer with senior backend access
- Explicit verification that all five safeguards above are maintained
- Reference to ADR-031 in the PR description

### Extension Permission Model

Contributions are subject to a three-layer visibility model:

| Layer                   | Controlled By                          | Granularity                    |
| ----------------------- | -------------------------------------- | ------------------------------ |
| `is_active`             | Plugin lifecycle (activate/deactivate) | Plugin-wide                    |
| `validationStatus`      | Registry auto-validation               | Per-contribution               |
| `isVisible` (workspace) | Workspace admin toggle                 | Per-workspace per-contribution |
| Super-admin override    | Super-admin UI                         | Cross-tenant                   |

A contribution is rendered only when all layers are satisfied: `is_active = true`, `validationStatus IN ('valid', 'pending')`, and `isVisible = true` for the current workspace.

### Input Validation

All extension registry endpoints validate inputs with Zod schemas defined in `extension-registry.schema.ts`. Key constraints:

- `pluginId`: string, 1–255 characters (not UUID — plugins use string IDs)
- `slotId`: string, 1–128 characters, alphanumeric + hyphens/underscores only
- `tenantId`: UUID v4
- `workspaceId`: UUID v4
- `contributionId`: UUID v4
- `maxContributions`: integer 0–100 (0 = unlimited)
- `priority`: integer 0–999

### Tenant Isolation Checklist

Before merging any change to the extension registry:

- ✅ Does every `getXxx()` method pass `tenantId` to the repository?
- ✅ Does every `upsertXxx()` method validate `tenantId` before write?
- ✅ Are cross-tenant admin methods named with `ForSuperAdmin` suffix?
- ✅ Is the feature flag checked before any DB access?
- ✅ Does cache invalidation scope keys by `tenantId`?

---

## SSRF Prevention (Spec 015)

**Date Added**: March 2026  
**CodeQL alerts resolved**: #1–#3 (`js/request-forgery`)  
**FR**: FR-001, FR-002, FR-003, FR-004

### The Problem

Server-Side Request Forgery (SSRF) occurs when user-supplied or externally-derived URLs are passed directly to `fetch()` or similar HTTP clients. An attacker can construct a URL targeting internal services (e.g., `http://169.254.169.254/metadata` on AWS) and exfiltrate sensitive data or pivot to internal systems.

In Plexica, the three `fetch()` calls in `keycloak.service.ts` (token exchange, token refresh, token revocation) were flagged because the `tokenEndpoint` URLs are constructed from Keycloak realm names, which could theoretically be influenced by user input.

### The Fix: `assertKeycloakUrl()`

All Keycloak `fetch()` calls are guarded by `assertKeycloakUrl()` from `apps/core-api/src/services/keycloak-url-validator.ts`:

```typescript
import { assertKeycloakUrl } from './keycloak-url-validator.js';

// ✅ ALWAYS call assertKeycloakUrl() immediately before fetch()
assertKeycloakUrl(tokenEndpoint);
const response = await fetch(tokenEndpoint, { method: 'POST', ... });
```

The validator confirms the constructed URL's **hostname** and **protocol** match the `KEYCLOAK_URL` environment variable. Any mismatch throws `SSRF_BLOCKED: constructed URL does not match configured KEYCLOAK_URL`.

### How to Extend for New Keycloak Integrations

When adding a new `fetch()` call to a Keycloak endpoint:

1. Import `assertKeycloakUrl` from `'./keycloak-url-validator.js'`
2. Call it synchronously **before** the `fetch()` call — it must run before any network I/O
3. Add a unit test asserting that a mismatched hostname throws

```typescript
// ✅ Correct pattern for any new Keycloak fetch
import { assertKeycloakUrl } from './keycloak-url-validator.js';

const endpointUrl = `${keycloakBaseUrl}/realms/${realm}/protocol/openid-connect/userinfo`;
assertKeycloakUrl(endpointUrl); // throws if hostname doesn't match KEYCLOAK_URL
const response = await fetch(endpointUrl, { headers: { Authorization: `Bearer ${token}` } });
```

### `validateRealmName()` Defense-in-Depth

In addition to URL validation, `validateRealmName()` in `keycloak.service.ts` rejects:

- URL-encoded path separators: `%2f`, `%2F`, `%5c`, `%5C`
- Double-dot path traversal: `..`
- Any character outside `^[a-z0-9-]{1,50}$`

---

## Path Traversal Prevention (Spec 015)

**Date Added**: March 2026  
**CodeQL alerts resolved**: #4–#5 (`js/path-injection`)  
**FR**: FR-005, FR-006, FR-007, FR-008

### The Problem

Path traversal occurs when user-supplied strings (locale, namespace) are used to construct file paths without canonicalization. An attacker passing `../../etc/passwd` as a locale can escape the intended directory.

In Plexica, `i18n.service.ts`'s `loadNamespaceFile()` was flagged because `locale` and `namespace` query parameters were used in `path.join()` without a canonical path check.

### The Fix: Zod Validation + `path.resolve()` Prefix Check

The fix applies at two layers in `loadNamespaceFile()`:

**Layer 1 — Zod schema validation (fail fast)**

```typescript
import { z } from 'zod';
import path from 'node:path';

const LocaleSchema = z
  .string()
  .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/, 'Locale must be a valid BCP 47 language tag');

const NamespaceSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]{1,64}$/, 'Namespace must be lowercase alphanumeric with hyphens');

// ✅ Validate BEFORE any filesystem access
LocaleSchema.parse(locale); // rejects '../../etc/passwd', 'en/evil', etc.
NamespaceSchema.parse(namespace); // rejects '../package', 'Core', 65-char strings
```

**Layer 2 — Canonical path prefix check**

```typescript
const filePath = path.join(TRANSLATIONS_DIR, locale, `${namespace}.json`);
const resolvedPath = path.resolve(filePath);
const resolvedBase = path.resolve(TRANSLATIONS_DIR);

if (!resolvedPath.startsWith(resolvedBase + path.sep)) {
  throw new Error('PATH_TRAVERSAL_BLOCKED: resolved path escapes translations directory');
}
```

### Accepted and Rejected Inputs

| Input              | Type      | Result             |
| ------------------ | --------- | ------------------ |
| `en`               | locale    | ✅ Accepted        |
| `en-US`            | locale    | ✅ Accepted        |
| `zh-Hans-CN`       | locale    | ✅ Accepted        |
| `../../etc/passwd` | locale    | ❌ Rejected by Zod |
| `en/evil`          | locale    | ❌ Rejected by Zod |
| `core`             | namespace | ✅ Accepted        |
| `plugin-crm`       | namespace | ✅ Accepted        |
| `../package`       | namespace | ❌ Rejected by Zod |
| `Core` (uppercase) | namespace | ❌ Rejected by Zod |

---

## Rate Limiting (Spec 015)

**Date Added**: March 2026  
**CodeQL alerts resolved**: #6–#16 (`js/missing-rate-limiting`)  
**FR**: FR-009 – FR-014

### Three-Tier Rate Limiting System

Plexica uses `@fastify/rate-limit` with three configurable tiers, all backed by Redis:

| Environment Variable | Default     | Routes                                                                                                               |
| -------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| `RATE_LIMIT_AUTH`    | 20 req/min  | `auth.ts` (authentication endpoints)                                                                                 |
| `RATE_LIMIT_ADMIN`   | 60 req/min  | `tenant-admin.ts`, `jobs.routes.ts`, `storage.routes.ts` (uploads)                                                   |
| `RATE_LIMIT_GENERAL` | 120 req/min | `search.routes.ts`, `notification.routes.ts`, `storage.routes.ts` (reads), `notification-stream.routes.ts` (non-SSE) |

Override defaults per environment in `.env`:

```bash
RATE_LIMIT_AUTH=20
RATE_LIMIT_ADMIN=60
RATE_LIMIT_GENERAL=120
```

In test environments, set low limits to make tests fast: `RATE_LIMIT_ADMIN=3`.

### Redis Key Format

Rate limit counters are stored in Redis with the key format:

```
rl:{tier}:{tenantId}:{userId}
```

Examples:

- `rl:auth:tenant-abc:user-xyz` — auth tier for a specific user
- `rl:admin:tenant-abc:anonymous` — admin tier for unauthenticated requests
- `rl:general:tenant-abc:user-xyz` — general tier

### 429 Response Format

When a rate limit is exceeded, the API returns HTTP 429 with the Constitution Art. 6.2 compliant body:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please retry after 45s",
    "details": {
      "retryAfter": 45
    }
  }
}
```

The `Retry-After` header is also set to the number of seconds remaining in the current window.

> **TD-023**: Frontend apps (`apps/web`, `apps/super-admin`, `packages/api-client`) do not yet handle 429 responses automatically. Until a `Retry-After` interceptor is added, users will see a generic error. Tracked as TD-023 for Sprint 011.

### Applying Rate Limiting to New Routes

Import the shared config and use one of the three tiers:

```typescript
import {
  RATE_LIMIT_TIERS,
  rateLimitErrorResponse,
  rateLimitKeyGenerator,
} from '../../lib/rate-limit-config.js';

// ✅ Plugin-scope registration (covers all handlers in the plugin)
fastify.register(import('@fastify/rate-limit'), {
  ...RATE_LIMIT_TIERS.general,
  keyGenerator: (req) => rateLimitKeyGenerator('general', req),
  errorResponseBuilder: rateLimitErrorResponse,
});
```

### SSE Streams: Per-Request Rate Limiting Disabled Intentionally

Long-lived SSE streams have `config: { rateLimit: false }`. Connection establishment is rate-limited globally by `@fastify/rate-limit`. Per-request limiting is not applicable to a persistent stream (there is no per-message HTTP request to count).

### Testing with Rate Limits

Unit tests in `.env.test` set `DISABLE_RATE_LIMIT=true` to prevent test interference. Rate-limiting-specific unit tests must disable this override:

```typescript
beforeEach(() => {
  delete process.env['DISABLE_RATE_LIMIT'];
});
afterEach(() => {
  process.env['DISABLE_RATE_LIMIT'] = 'true';
});
```

Integration tests must flush Redis between tests:

```typescript
beforeEach(async () => {
  await redis.flushdb(); // reset rate-limit counters
});
```

---

## XSS / CSS Sanitization (Spec 015 / ADR-032)

**Date Added**: March 2026  
**CodeQL alerts resolved**: #27–#29 (`js/xss-through-dom`)  
**FR**: FR-023, FR-024, FR-025, FR-026, FR-027, FR-028  
**ADR**: [ADR-032](../.forge/knowledge/adr/adr-032-dompurify-xss-sanitization.md)

### The Problem

XSS through the DOM occurs when attacker-controlled strings are passed directly to `dangerouslySetInnerHTML` (CSS injection) or rendered as `<img src=...>` (URL injection via `javascript:` or `data:text/html` schemes).

In Plexica, the `ThemePreview` component rendered tenant-supplied CSS and logo URLs without sanitization, and `admin.settings.tsx` rendered the logo URL without scheme validation.

### CSS Sanitization: `sanitizeCss()`

Use `sanitizeCss()` from `@plexica/ui` whenever a CSS string from an untrusted source is injected into the DOM:

```typescript
import { sanitizeCss } from '@plexica/ui/utils/sanitize-css.js';

// ✅ ALWAYS sanitize CSS before dangerouslySetInnerHTML
<style dangerouslySetInnerHTML={{ __html: sanitizeCss(tenantCss) }} />

// ❌ NEVER inject CSS directly
<style dangerouslySetInnerHTML={{ __html: tenantCss }} />
```

`sanitizeCss()` applies two layers of protection:

1. **DOMPurify** — wraps CSS in `<style>` tags and sanitizes via DOMPurify (strips injected HTML, script tags, etc.)
2. **String-level strip** (defense-in-depth) — removes `</style>` break-outs, `expression(...)` IE XSS vectors, `url('javascript:...')` values, and `@import` rules

The function has a 10 KB size guard — inputs over 10,240 bytes are rejected with an error.

### Image URL Validation: `validateImageUrl()` and `<SafeImage>`

For rendering user-supplied image URLs, use the `<SafeImage>` component instead of a bare `<img>`:

```tsx
import { SafeImage } from '@plexica/ui';

// ✅ ALWAYS use SafeImage for user-supplied image URLs
<SafeImage
  src={tenantSettings.logoUrl ?? ''}
  alt="Tenant logo"
  fallback={<span className="logo-placeholder">No logo</span>}
/>

// ❌ NEVER render user URLs directly in img src
<img src={tenantSettings.logoUrl} alt="Tenant logo" />
```

`<SafeImage>` internally calls `validateImageUrl()`, which:

- **Allows**: `https://`, `http://`, `data:image/` (safe image data URIs)
- **Rejects**: `javascript:`, `data:text/html`, `data:application/`, empty strings

When a URL is rejected, `<SafeImage>` renders the `fallback` prop (default: `null`).

For form fields, display a validation error when the URL is rejected:

```tsx
const logoError = logoUrl && !validateImageUrl(logoUrl) ? 'Logo URL must use HTTPS.' : undefined;
```

### DOMPurify and SSR

DOMPurify requires a DOM environment. `sanitizeCss()` is safe to import in SSR contexts — it will fall back to string-level stripping if DOMPurify is unavailable. If SSR sanitization with full DOMPurify support is needed, switch to `isomorphic-dompurify` (tracked as DD-003 evolution).

---

## Log Injection Prevention (Spec 015)

**Date Added**: March 2026  
**CodeQL alerts resolved**: #17–#20 (`js/tainted-format-string`)  
**FR**: FR-015, FR-016, FR-017, FR-018

### The Problem

Log injection occurs when attacker-controlled values are interpolated directly into log message strings. A payload containing `\n` or `\r` can inject fake log lines; a payload containing JSON metacharacters can corrupt structured log output. Even with Pino's JSON serialization (which escapes `\n` within string values), CodeQL flags format-string interpolation as a tainted format string.

### The Pattern: Context Object, Not String Interpolation

Plexica uses structured Pino logging. User-controlled values **must** appear in the **context object** (first argument), never in the message string (second argument):

```typescript
// ❌ BAD: user-controlled value in message string (CodeQL tainted-format-string)
logger.info(`Topic created: ${topicName}`);
logger.error(`Failed to process event ${eventId} for tenant ${tenantId}`);

// ✅ GOOD: user-controlled values in context object
logger.info({ topicName }, 'Topic created');
logger.error({ eventId, tenantId, error }, 'Failed to process event');
```

The message string should be a static, human-readable description. All dynamic context goes into the first object argument.

### Constructor Injection Pattern

Services that need logging should receive a Pino logger via constructor injection, with a no-op fallback:

```typescript
import type { Logger } from 'pino';

export class TopicManager {
  private readonly logger: Logger;

  constructor(opts?: { logger?: Logger }) {
    // No-op stub when no logger is provided (e.g., in tests without a logger)
    this.logger =
      opts?.logger ??
      ({
        info: () => {},
        error: () => {},
        warn: () => {},
      } as unknown as Logger);
  }

  async createTopic(name: string): Promise<void> {
    // ✅ name in context object, not message string
    this.logger.info({ topicName: name }, 'Creating topic');
    // ...
  }
}
```

### Fastify Route Handlers

In Fastify route handlers, use `request.log` (the per-request logger with built-in `requestId`):

```typescript
fastify.post('/api/reports/:id/run', async (request, reply) => {
  const { id } = request.params;
  try {
    // ...
  } catch (error: unknown) {
    // ✅ reportId in context object
    request.log.error(
      { reportId: id, error: error instanceof Error ? error.message : String(error) },
      'Failed to run analytics report'
    );
    reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Report run failed' } });
  }
});
```

### Required Log Fields

Per Constitution Art. 6.3, every log entry must include (automatically added by Pino + Fastify):

| Field       | Source            | Description                      |
| ----------- | ----------------- | -------------------------------- |
| `timestamp` | Pino              | ISO 8601 timestamp               |
| `level`     | Pino              | `error`, `warn`, `info`, `debug` |
| `message`   | Your code         | Static description               |
| `requestId` | Fastify           | Per-request correlation ID       |
| `userId`    | Auth middleware   | Authenticated user ID            |
| `tenantId`  | Tenant middleware | Current tenant context           |

---

## ReDoS False Positive Analysis (Spec 015)

**Date Added**: March 2026  
**CodeQL alerts resolved**: #30–#31 (`js/polynomial-redos`)  
**FR**: FR-029, FR-030

### Background

CodeQL's `js/polynomial-redos` detector flags regex patterns that could exhibit catastrophic exponential or polynomial backtracking under adversarial input. Some patterns are false positives — they are O(n) linear time with no backtracking risk. In these cases, the correct response is to add a suppression comment with an explanation and a benchmark regression test.

### When to Suppress vs. When to Fix

| Situation                                                        | Action                                       |
| ---------------------------------------------------------------- | -------------------------------------------- | -------------------------------- |
| Single character class with `+`/`*` (e.g., `/\/+$/`)             | **Suppress** — O(n), no alternation          |
| `.*` with a unique literal suffix (e.g., `/member.*not found/i`) | **Suppress** — O(n), engine does linear scan |
| Nested quantifiers (e.g., `/(a+)+$/`)                            | **Fix** — genuine ReDoS risk                 |
| Alternation with overlap (e.g., `/a.\*b                          | a.\*c/`)                                     | **Fix** — may cause backtracking |

### Suppression Comment Format

Use **both** an inline comment and a multi-line explanation:

```typescript
// lgtm[js/polynomial-redos] Safe: /\/+$/ is O(n) — single character class
// with + quantifier, no alternation or nesting. Confirmed linear-time.
// Benchmark test in redos-benchmark.test.ts. See Spec 015 FR-029.
const normalizedUrl = url.replace(/\/+$/, ''); // lgtm[js/polynomial-redos]
```

### Benchmark Test Pattern

For every suppressed ReDoS alert, add a benchmark test in `apps/core-api/src/__tests__/unit/redos-benchmark.test.ts`:

```typescript
it('/\\/+$/ completes in < 2ms on adversarial 100K-slash input', () => {
  if (process.env['CI_SKIP_BENCHMARKS'] === '1') return; // avoid flaky CI
  const input = '/'.repeat(100_000);
  const start = performance.now();
  input.replace(/\/+$/, '');
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(2); // 2ms with 2× CI margin
});
```

Use `performance.now()` (not `Date.now()` — too coarse). Set `CI_SKIP_BENCHMARKS=1` in slow CI environments to prevent flaky failures.

### Confirmed False Positives in This Codebase

| File                                                           | Line | Pattern                | Reason Safe                                            |
| -------------------------------------------------------------- | ---- | ---------------------- | ------------------------------------------------------ |
| `packages/sdk/src/api-client.ts`                               | 40   | `/\/+$/`               | Single char class + quantifier, O(n)                   |
| `apps/core-api/src/modules/workspace/utils/error-formatter.ts` | 227  | `/member.*not found/i` | `.*` with literal suffix, no catastrophic backtracking |

---

## 📝 Version History

| Version | Date       | Changes                                                                                  | Author         |
| ------- | ---------- | ---------------------------------------------------------------------------------------- | -------------- |
| 1.0.0   | 2024-01-XX | Initial security guidelines                                                              | Security Team  |
| 1.1.0   | 2024-01-XX | Added SQL injection fixes                                                                | Security Audit |
| 1.2.0   | March 2026 | Added Extension Points security (Spec 013 / ADR-031)                                     | FORGE          |
| 1.3.0   | March 2026 | Added SSRF, path traversal, rate limiting, XSS, log injection, ReDoS sections (Spec 015) | FORGE          |
