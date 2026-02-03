# 🔒 Security Guidelines for Plexica Development

**Last Updated**: 2025-02-03  
**Status**: Complete  
**Owner**: Engineering Team  
**Document Type**: Developer Guide

**Last Updated**: 2025-02-03  
**Status**: Complete  
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
if (process.env.NODE_ENV === 'production' && !request.protocol === 'https') {
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

## 📝 Version History

| Version | Date       | Changes                     | Author         |
| ------- | ---------- | --------------------------- | -------------- |
| 1.0.0   | 2024-01-XX | Initial security guidelines | Security Team  |
| 1.1.0   | 2024-01-XX | Added SQL injection fixes   | Security Audit |

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
