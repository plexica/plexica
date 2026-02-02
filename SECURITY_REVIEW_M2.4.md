# Plexica Comprehensive Security Review - Milestone 2.4

**Date**: January 22, 2026  
**Scope**: Plexica Platform v0.1.0  
**Review Type**: Post-Session Security Analysis

## Executive Summary

This comprehensive security review identifies **24 distinct security vulnerabilities and code quality issues** across the Plexica codebase, including 4 npm audit findings and 20 additional issues. The review focuses on issues that were not previously addressed in earlier security fixes (authentication validation, XSS prevention, and access control).

**Vulnerability Breakdown**:

- **3 CRITICAL** severity issues
- **6 HIGH** severity issues
- **10 MEDIUM** severity issues
- **5 LOW** severity issues

---

## CRITICAL SEVERITY ISSUES (Immediate Action Required)

### 1. Exposed .env Files in Version Control

**Status**: CRITICAL | **Category**: Security - Secrets Management  
**Location**: Repository root and app directories  
**Files**: `.env`, `apps/core-api/.env`, `apps/web/.env`, `packages/database/.env`, `apps/super-admin/.env`

**Problem**:
Multiple `.env` files with production credentials committed to git history:

- DATABASE_URL: `postgresql://plexica:plexica_password@localhost:5432/plexica`
- JWT_SECRET: `your-super-secret-jwt-key-change-in-production`
- KEYCLOAK credentials exposed
- MINIO credentials: `minioadmin:minioadmin`

**Impact**: Critical - Anyone with repository access can access all service credentials

**Remediation**:

1. Remove from git history immediately:
   ```bash
   git filter-branch --tree-filter 'rm -f .env apps/*/.env packages/*/.env' -- --all
   git push origin --force-with-lease
   ```
2. Rotate all exposed credentials
3. Scan history for other exposed secrets:
   ```bash
   git log --all --source -S 'plexica_password' --oneline
   ```
4. Use pre-commit hooks to prevent future commits:
   ```bash
   pnpm add -D husky lint-staged
   echo "*.env" >> .gitignore
   ```

---

### 2. Unencrypted Token Storage in localStorage

**Status**: CRITICAL | **Category**: Security - Authentication  
**Location**: `apps/web/src/stores/auth-store.ts` (lines 95-101)

**Problem**:
JWT tokens stored in localStorage via Zustand persist middleware without encryption:

- Tokens persist across page reloads (not cleared on logout)
- No encryption applied - plaintext in browser storage
- Vulnerable to XSS attacks that can read localStorage
- Visible in browser DevTools

**Impact**: Critical - XSS vulnerability could steal all user sessions

**Code Location**:

```typescript
export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({...}),
    {
      name: 'plexica-auth',
      partialize: (state) => ({
        token: state.token,  // <- Stored unencrypted
        // ... other state
      }),
    }
  )
);
```

**Remediation**:

1. **Option A**: Move to sessionStorage (cleared on tab close)

   ```typescript
   {
     name: 'plexica-auth',
     storage: sessionStorage,  // Lost on tab close
     partialize: (state) => ({
       user: state.user,
       tenant: state.tenant,
       // DO NOT store token
     }),
   }
   ```

2. **Option B**: Use encrypted storage

   ```bash
   pnpm add sodium-js @noble/ciphers
   ```

   ```typescript
   import { crypto_secretbox } from 'sodium-js';

   const encryptedToken = crypto_secretbox(token, nonce, key);
   localStorage.setItem('plexica-auth-token', encryptedToken);
   ```

3. **Option C**: Use httpOnly cookies (requires backend changes)
   - Backend sets httpOnly, Secure, SameSite cookies
   - Browser automatically sends with requests
   - JavaScript cannot access

**Recommendation**: Implement Option A + refresh token in encrypted storage for persistent sessions

---

### 3. Hono JWT Vulnerability in Transitive Dependencies

**Status**: CRITICAL | **Category**: Security - Authentication  
**CVE**: GHSA-3vhc-576x-3qv4, GHSA-f67f-6cw9-8mq4  
**Location**: `packages/database > prisma > @prisma/dev > hono` (versions < 4.11.4)

**Problem**:
Two high-severity JWT algorithm confusion vulnerabilities in Hono:

1. JWT algorithm confusion when JWK lacks "alg" field
2. Unsafe default HS256 allows token forgery and authentication bypass

**Impact**: Critical - Could allow unauthenticated access if Prisma Studio is running

**Current Status**:

```
npm audit
High: Hono JWT algorithm confusion vulnerabilities
Vulnerable versions: <4.11.4
Affected: packages__database>prisma>@prisma/dev>hono
```

**Remediation**:

1. Update Prisma to latest version:

   ```bash
   pnpm update @prisma/cli @prisma/client --latest
   ```

2. Force upgrade Hono if needed:

   ```bash
   pnpm add -D hono@^4.11.4
   ```

3. Add to CI/CD to prevent downgrade:
   ```yaml
   # .github/workflows/security.yml
   - name: Check npm audit
     run: npm audit --audit-level=high
   ```

---

## HIGH SEVERITY ISSUES

### 4. Insufficient CORS Configuration & Validation

**Status**: HIGH | **Category**: Security - API Configuration  
**Location**: `apps/core-api/src/index.ts` (lines 51-54)

**Problem**:
CORS origins configured without validation:

```typescript
await server.register(cors, {
  origin: config.corsOrigin.split(','), // No validation!
  credentials: true,
});
```

Vulnerable to:

- Malformed CORS origins (e.g., "http://evil.com.trusted.com:3001")
- Missing protocol validation
- Environment variable injection

**Remediation**:

```typescript
const validateCorsOrigins = (origins: string): string[] => {
  return origins.split(',').map((origin) => {
    const trimmed = origin.trim();

    // Validate format
    try {
      const url = new URL(trimmed);

      // Reject localhost in production
      if (config.nodeEnv === 'production' && ['localhost', '127.0.0.1'].includes(url.hostname)) {
        throw new Error('Localhost CORS not allowed in production');
      }

      return url.origin;
    } catch (error) {
      throw new Error(`Invalid CORS origin: ${trimmed}`);
    }
  });
};

await server.register(cors, {
  origin: validateCorsOrigins(config.corsOrigin),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

---

### 5. Custom Headers Not Validated

**Status**: HIGH | **Category**: Security - Input Validation  
**Location**: API client and routes

**Problem**:
Frontend sends custom headers that backend doesn't validate:

```typescript
// Frontend: api-client.ts
config.headers['X-Tenant-Slug'] = this.tenantSlug; // No validation
config.headers['X-Workspace-ID'] = this.workspaceId; // No validation
```

Backend doesn't validate these headers, allowing:

- Header injection attacks
- Large header values (DoS)
- Invalid format data

**Remediation** - Add validation middleware:

```typescript
// middleware/header-validation.ts
export async function validateHeadersMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const tenantSlug = request.headers['x-tenant-slug'] as string;
  const workspaceId = request.headers['x-workspace-id'] as string;

  // Validate tenant slug
  if (tenantSlug) {
    if (!/^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])?$/.test(tenantSlug)) {
      return reply.code(400).send({
        error: 'BadRequest',
        message: 'Invalid X-Tenant-Slug format',
      });
    }
  }

  // Validate workspace ID (UUID)
  if (workspaceId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(workspaceId)) {
      return reply.code(400).send({
        error: 'BadRequest',
        message: 'Invalid X-Workspace-ID format',
      });
    }
  }
}
```

Apply to all routes:

```typescript
server.addHook('preHandler', validateHeadersMiddleware);
```

---

### 6. No CSRF Protection

**Status**: HIGH | **Category**: Security - CSRF  
**Location**: All API routes (no CSRF tokens implemented)

**Problem**:
No CSRF protection for state-changing operations (POST, PUT, DELETE):

- No X-CSRF-Token header validation
- No double-submit cookies
- Using localStorage (no SameSite protection)

**Remediation** - Implement double-submit cookie pattern:

```typescript
// middleware/csrf.ts
import crypto from 'crypto';

const csrfTokens = new Map<string, string>(); // In-memory or Redis in production

export async function generateCsrfToken(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const sessionId = request.cookies.sessionId || crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('hex');

  csrfTokens.set(sessionId, token);

  reply.setCookie('sessionId', sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  });

  return reply.send({ csrfToken: token });
}

export async function validateCsrfToken(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!['POST', 'PUT', 'DELETE'].includes(request.method)) {
    return;
  }

  const token = request.headers['x-csrf-token'] as string;
  const sessionId = request.cookies.sessionId;

  if (!token || !sessionId) {
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'Missing CSRF token',
    });
  }

  const storedToken = csrfTokens.get(sessionId);
  if (storedToken !== token) {
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'Invalid CSRF token',
    });
  }
}
```

---

### 7. Lodash Prototype Pollution Vulnerability

**Status**: HIGH | **Category**: Security - Dependencies  
**CVE**: GHSA-xxjr-mmjv-4gpg  
**Location**: `packages/database > prisma > @prisma/dev > @mrleebo/prisma-ast > chevrotain > lodash`

**Problem**:
Vulnerable lodash version (4.0.0-4.17.22) in build dependencies allowing prototype pollution

**Remediation**:

```bash
# Force update lodash
pnpm add -D lodash@^4.17.23

# Or update Prisma/related packages
pnpm update @prisma/cli@latest @mrleebo/prisma-ast@latest
```

---

### 8. Weak Rate Limiting Configuration

**Status**: HIGH | **Category**: Security - API Security  
**Location**: `apps/core-api/src/index.ts` (lines 60-63)

**Problem**:

- Development: 1000 req/min per IP (too permissive)
- Production: 100 req/min per IP (too basic)
- No per-user rate limiting
- No per-endpoint limits
- Bypassable with multiple IPs/proxies

**Remediation**:

```typescript
// Replace current rate limiting with:
await server.register(rateLimit, {
  keyGenerator: (request) => {
    // Use authenticated user ID if available
    if (request.user?.id) {
      return `user:${request.user.id}`;
    }
    // Otherwise use IP address
    return request.ip;
  },
  max: config.nodeEnv === 'production' ? 100 : 500,
  timeWindow: '1 minute',
  cache: 10000,  // Use Redis in production
  skipOnError: false,
  errorResponseBuilder: () => ({
    error: 'TooManyRequests',
    message: 'Rate limit exceeded',
  }),
});

// Add per-endpoint limits for sensitive operations
const sensitiveRateLimit = rateLimit({
  max: 5,
  timeWindow: '1 minute',
});

server.post('/auth/login', { preHandler: sensitiveRateLimit }, ...);
server.post('/auth/refresh', { preHandler: sensitiveRateLimit }, ...);
server.post('/plugins/upload', { preHandler: sensitiveRateLimit }, ...);
```

---

### 9. Plugin Upload Endpoint Not Authenticated

**Status**: HIGH | **Category**: Security - Authorization  
**Location**: `apps/core-api/src/routes/plugin-upload.ts` (line 14)

**Problem**:

```typescript
server.post('/plugins/upload',
  // NO AUTHENTICATION! Anyone can upload plugins
  async (request, reply) => { ... }
);
```

Consequences:

- Unauthenticated file upload
- No tenant validation
- No file type checking
- No virus scanning
- Potential for DoS with large files

**Remediation**:

```typescript
server.post(
  '/plugins/upload',
  {
    preHandler: [authMiddleware, requireRole('admin')],
    schema: {
      // ... existing schema
    },
  },
  async (request: FastifyRequest, reply: FastifyReply) => {
    // Verify user is admin
    if (!request.user?.roles.includes('admin')) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Admin access required',
      });
    }

    // Validate file MIME type
    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === 'file') {
        const allowedTypes = ['application/zip', 'application/octet-stream'];

        if (!allowedTypes.includes(part.mimetype)) {
          return reply.code(400).send({
            error: 'BadRequest',
            message: `Invalid file type: ${part.mimetype}`,
          });
        }

        // Add virus scanning here with ClamAV
        // const isMalware = await scanForMalware(part);
        // if (isMalware) { ... return 400 ... }
      }
    }

    // ... rest of upload logic
  }
);
```

---

## MEDIUM SEVERITY ISSUES

### 10. esbuild Development Server CORS Vulnerability

**Status**: MEDIUM | **Category**: Security - Development  
**CVE**: GHSA-67mh-4wv8-2f99  
**Location**: Build toolchain (Vite with esbuild <= 0.24.2)

**Problem**:
Development server allows any website to send requests and read responses

**Remediation**:

1. Update Vite/esbuild:

   ```bash
   pnpm update vite@latest
   ```

2. Configure dev server CORS:
   ```typescript
   // vite.config.ts
   server: {
     cors: {
       origin: ['http://localhost:3001', 'http://localhost:3002'],
       methods: ['GET', 'POST', 'PUT', 'DELETE'],
       allowedHeaders: ['Content-Type', 'Authorization'],
       credentials: true,
     },
     middlewareMode: true,
   },
   ```

---

### 11. Plugin ID and Version Not Validated

**Status**: MEDIUM | **Category**: Security - Input Validation  
**Location**: `apps/core-api/src/routes/plugin-upload.ts` (lines 31-35)

**Problem**:
pluginId and version fields accepted without validation:

- Could contain path traversal attempts (`../../../etc/passwd`)
- No format validation (semver not enforced)
- Could break MinIO path construction

**Remediation**:

```typescript
const PLUGIN_ID_REGEX = /^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$/;
const VERSION_REGEX = /^\d+\.\d+\.\d+(-[a-z0-9]+(\.[a-z0-9]+)*)?$/; // semver

for await (const part of parts) {
  if (part.type === 'field') {
    if (part.fieldname === 'pluginId') {
      pluginId = part.value as string;

      if (!PLUGIN_ID_REGEX.test(pluginId)) {
        return reply.code(400).send({
          error: 'BadRequest',
          message: 'Invalid pluginId format. Must be lowercase alphanumeric with hyphens.',
        });
      }
    }

    if (part.fieldname === 'version') {
      version = part.value as string;

      if (!VERSION_REGEX.test(version)) {
        return reply.code(400).send({
          error: 'BadRequest',
          message: 'Invalid version format. Must be semver (e.g., 1.0.0).',
        });
      }
    }
  }
}
```

---

### 12. Tenant Slug Pattern Too Permissive

**Status**: MEDIUM | **Category**: Security - Input Validation  
**Location**: `apps/core-api/src/routes/tenant.ts` (line 18)

**Problem**:
Pattern `^[a-z0-9-]+$` allows:

- Leading/trailing hyphens: `-invalid-`
- Double hyphens: `in--valid`
- Confusing identifiers

**Remediation**:

```typescript
const createTenantSchema = {
  body: {
    type: 'object',
    required: ['slug', 'name'],
    properties: {
      slug: {
        type: 'string',
        // Updated pattern: start/end with alphanumeric
        pattern: '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])?$',
        minLength: 3,
        maxLength: 50,
        description: 'Unique tenant identifier (alphanumeric with hyphens)',
      },
      // ... other properties
    },
  },
};

// Add reserved name check
const RESERVED_SLUGS = ['admin', 'api', 'mail', 'ftp', 'master', 'system', 'public'];

fastify.post('/tenants', async (request, reply) => {
  const { slug } = request.body;

  if (RESERVED_SLUGS.includes(slug.toLowerCase())) {
    return reply.code(400).send({
      error: 'BadRequest',
      message: `Slug "${slug}" is reserved and cannot be used`,
    });
  }

  // ... create tenant
});
```

---

### 13. Excessive Console Logging with Sensitive Data

**Status**: MEDIUM | **Category**: Security - Logging  
**Location**: Multiple files (49 console.log statements in core-api)

**Files with sensitive logging**:

- `apps/core-api/src/lib/jwt.ts` (lines 83, 95, 103, 106, 130, 146)
  - Logs user IDs
  - Logs tenant information
- `apps/web/src/stores/auth-store.ts` (lines 46, 51, 129)
  - Logs auth state changes

**Problem**:
Console output captured by:

- Docker logs
- Syslog
- Application monitoring (Datadog, New Relic, etc.)
- Could expose PII

**Remediation**:

```typescript
// BEFORE (jwt.ts)
console.log('[JWT] Verifying token for realm:', realm);
console.log('[JWT] Token verified successfully for user:', payload.sub);

// AFTER
server.log.info({ realm }, 'Verifying JWT token');
server.log.info({ userId: payload.sub }, 'JWT token verified');

// Remove all console.log from production
if (config.nodeEnv !== 'production') {
  console.debug('[DEV] Token details:', token);
}

// Redact sensitive data
const safeUser = {
  id: user.id,
  email: user.email,
  roles: user.roles,
  // password, tokens, etc. NOT included
};
server.log.info(safeUser, 'User authenticated');
```

---

### 14. Missing Content Security Policy Header

**Status**: MEDIUM | **Category**: Security - Frontend  
**Location**: `apps/web/nginx.conf`

**Problem**:
No CSP header configured, vulnerable to:

- Inline script injection
- External script injection
- CSS injection
- Data exfiltration

**Remediation**:

```nginx
# apps/web/nginx.conf
add_header Content-Security-Policy "
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self';
  connect-src 'self' http://localhost:3000 https://api.plexica.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  report-uri /api/security/csp-report;
" always;
```

Test CSP:

```bash
curl -I http://localhost:3001/ | grep Content-Security-Policy
```

---

### 15. Missing HSTS Header

**Status**: MEDIUM | **Category**: Security - Frontend  
**Location**: `apps/web/nginx.conf`

**Problem**:
No HTTP Strict-Transport-Security header, vulnerable to SSL stripping attacks

**Remediation**:

```nginx
# apps/web/nginx.conf
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

# Redirect HTTP to HTTPS
server {
  listen 80;
  server_name _;
  return 301 https://$host$request_uri;
}
```

---

### 16. Redis Not Configured with Authentication

**Status**: MEDIUM | **Category**: Security - Infrastructure  
**Location**: `.env.example`, docker-compose.yml

**Problem**:

- REDIS_PASSWORD empty
- No TLS/SSL configured
- No authentication requirement
- Plaintext credentials in environment

**Remediation**:

```env
# .env.prod
REDIS_URL=redis://:STRONG_PASSWORD@redis:6379/0
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=STRONG_RANDOM_PASSWORD_HERE
REDIS_DB=0
REDIS_USES_TLS=true
```

Update code:

```typescript
// config/index.ts
const redis = new Redis({
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword,
  db: config.redisDb,
  tls: config.redisUsesTls ? {} : undefined,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  enableReadyCheck: true,
  enableOfflineQueue: true,
});
```

---

### 17. MinIO Using Default Credentials

**Status**: MEDIUM | **Category**: Security - Infrastructure  
**Location**: `.env.example`, docker-compose.yml

**Problem**:

- Default credentials: `minioadmin:minioadmin`
- No credential rotation
- No IAM policies
- Public bucket access possible

**Remediation**:

```bash
# Generate secure credentials
openssl rand -base64 32  # Access key
openssl rand -base64 32  # Secret key
```

```env
# .env.prod
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=$(openssl rand -base64 32)
MINIO_SECRET_KEY=$(openssl rand -base64 32)
MINIO_BUCKET_NAME=plexica
MINIO_USE_SSL=true
```

Set up MinIO policies:

```bash
# Restrict bucket to authenticated access only
mc policy set private minio/plexica

# Enable versioning
mc version enable minio/plexica

# Enable lifecycle (cleanup old versions after 30 days)
mc ilm rule add minio/plexica --expire-days 30
```

---

### 18. No Request Timeout Configuration

**Status**: MEDIUM | **Category**: Security - Performance  
**Location**: `apps/core-api/src/index.ts`

**Problem**:

- No request timeout set
- No body size limit
- Vulnerable to slow client DoS
- No idle timeout

**Remediation**:

```typescript
const server = fastify({
  requestTimeout: 30000,  // 30 seconds
  bodyLimit: 52428800,    // 50MB
  logger: {
    level: config.logLevel,
    // ... rest of config
  },
});

// Per-route timeout for file uploads
server.post('/plugins/upload',
  {
    config: { timeout: 120000 },  // 2 minutes for large uploads
  },
  async (request, reply) => { ... }
);

// Connection timeout
server.server.headersTimeout = 65000; // > requestTimeout
server.server.keepAliveTimeout = 65000;
```

---

### 19. Inadequate Error Message Sanitization

**Status**: MEDIUM | **Category**: Security - Information Disclosure  
**Location**: `apps/core-api/src/index.ts` (line 132-143)

**Problem**:
Error handler doesn't sanitize responses for production:

- Database errors exposed
- Stack traces could be returned
- Connection strings might be visible

**Remediation**:

```typescript
server.setErrorHandler((error, request, reply) => {
  const errorId = crypto.randomUUID();

  // Always log full error server-side
  server.log.error(
    {
      errorId,
      error: error.message,
      code: error.code,
      statusCode: error.statusCode,
      // Don't log stack trace to avoid sensitive info in logs
    },
    'Request error'
  );

  // Sanitize response for client
  if (config.nodeEnv === 'production') {
    if (error instanceof ValidationError) {
      return reply.code(400).send({
        error: 'BadRequest',
        message: error.message, // Validation errors are safe
      });
    }

    return reply.code(error.statusCode || 500).send({
      error: 'ServerError',
      message: 'An unexpected error occurred',
      errorId: errorId, // For debugging without exposing details
    });
  }

  // In development, return full details
  return reply.code(error.statusCode || 500).send({
    error: error.name,
    message: error.message,
    statusCode: error.statusCode || 500,
    ...(error instanceof Error && { stack: error.stack }),
  });
});
```

---

### 20. Database Connection Without SSL/TLS

**Status**: MEDIUM | **Category**: Security - Data Protection  
**Location**: `.env.example`, database configuration

**Problem**:

- DATABASE_URL doesn't specify SSL mode
- Credentials sent in plaintext over network
- No certificate validation

**Remediation**:

```env
# .env.prod
DATABASE_URL="postgresql://user:password@postgres:5432/plexica?sslmode=require&sslcert=/path/to/ca-cert.pem"

# Or use managed database with built-in encryption
# AWS RDS, Azure Database, Google Cloud SQL all support SSL by default
```

Verify SSL connection:

```bash
# Test with psql
psql "$DATABASE_URL" -c "SELECT version();"

# Should see: SSL connection
```

---

### 21. No Secrets Management System

**Status**: MEDIUM | **Category**: Security - Secrets  
**Location**: Entire codebase

**Problem**:
All secrets stored as plaintext in environment variables:

- No secret rotation
- No audit trail
- No access control
- Single point of failure

**Remediation** - Implement HashiCorp Vault:

```bash
# Install Vault client
pnpm add node-vault
```

```typescript
// config/vault.ts
import * as Vault from 'node-vault';

const vault = new Vault({
  endpoint: config.vaultUrl,
  token: config.vaultToken,
});

export async function loadSecrets() {
  const jwtSecret = await vault.read('secret/plexica/jwt');
  const dbPassword = await vault.read('secret/plexica/database');

  return {
    jwtSecret: jwtSecret.data.data.secret,
    databasePassword: dbPassword.data.data.password,
  };
}
```

Or use AWS Secrets Manager for cloud deployments:

```typescript
import AWS from 'aws-sdk';

const secretsManager = new AWS.SecretsManager();

export async function getSecret(secretName: string) {
  const result = await secretsManager.getSecretValue({ SecretId: secretName }).promise();

  return JSON.parse(result.SecretString!);
}
```

---

## LOW SEVERITY ISSUES

### 22. Incomplete Security Headers Configuration

**Status**: LOW | **Category**: Security - Headers  
**Location**: `apps/core-api/src/index.ts` (Helmet configuration)

**Remediation**:

```typescript
await server.register(helmet, {
  contentSecurityPolicy:
    config.nodeEnv === 'production'
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            fontSrc: ["'self'"],
            connectSrc: ["'self'", config.webUrl],
            frameSrc: ["'none'"],
            formAction: ["'self'"],
            baseUri: ["'self'"],
            frameAncestors: ["'none'"],
          },
        }
      : false,
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  dnsPrefetchControl: true,
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
});
```

---

### 23. No Test Coverage for Web Application

**Status**: LOW | **Category**: Quality - Testing  
**Location**: `apps/web/src`

**Problem**:

- 0 test files for web app
- Core API has 4616 lines of test code
- Critical paths untested:
  - Login/logout
  - Token refresh
  - Auth store persistence
  - API client error handling

**Remediation**:

```bash
pnpm add -D vitest @testing-library/react @testing-library/user-event @vitest/ui
```

```typescript
// apps/web/src/__tests__/stores/auth-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useAuthStore } from '../../stores/auth-store';

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth();
    localStorage.clear();
  });

  it('should persist auth state to localStorage', () => {
    const user = { id: 'user1', email: 'test@example.com' };
    const tenant = { id: 'tenant1', slug: 'test-tenant' };
    const token = 'jwt-token';

    useAuthStore.getState().setAuth(user, tenant, token);

    // Verify persisted state
    const stored = localStorage.getItem('plexica-auth');
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored!);
    expect(parsed.user.email).toBe('test@example.com');
  });

  it('should clear auth on logout', () => {
    // ... setup
    useAuthStore.getState().clearAuth();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
```

---

### 24. Unused Dependencies Not Audited

**Status**: LOW | **Category**: Quality - Maintenance  
**Location**: All package.json files

**Remediation**:

```bash
pnpm add -D depcheck

# Check for unused dependencies
depcheck apps/core-api
depcheck apps/web
depcheck apps/super-admin
```

Remove unused packages and update lock file.

---

### 25. No Session Synchronization Across Tabs

**Status**: LOW | **Category**: Security - Session Management  
**Location**: `apps/web/src/stores/auth-store.ts`

**Problem**:

- Logout in one tab doesn't affect other tabs
- Token refresh not synced
- Could have inconsistent state

**Remediation**:

```typescript
// In auth-store initialization
useEffect(() => {
  // Listen for storage changes (logout in another tab)
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === 'plexica-auth') {
      if (!event.newValue) {
        // Auth cleared in another tab
        useAuthStore.getState().clearAuth();
      } else {
        const newState = JSON.parse(event.newValue);
        useAuthStore.setState(newState);
      }
    }
  };

  window.addEventListener('storage', handleStorageChange);
  return () => window.removeEventListener('storage', handleStorageChange);
}, []);

// Or use Broadcast Channel API (modern browsers)
useEffect(() => {
  const channel = new BroadcastChannel('auth');

  channel.onmessage = (event) => {
    if (event.data.type === 'logout') {
      useAuthStore.getState().clearAuth();
    } else if (event.data.type === 'tokenRefresh') {
      useAuthStore.getState().setToken(event.data.token);
    }
  };

  return () => channel.close();
}, []);
```

---

## REMEDIATION ROADMAP

### Phase 1: CRITICAL (24-48 hours)

- [ ] Remove .env files from git history
- [ ] Rotate all exposed credentials
- [ ] Update Hono to >= 4.11.4 in Prisma
- [ ] Implement encrypted token storage (sessionStorage or encryption)
- [ ] Add authentication to plugin upload endpoint

### Phase 2: HIGH (This week)

- [ ] Implement CSRF protection
- [ ] Validate CORS origins
- [ ] Validate custom headers
- [ ] Validate plugin ID and version
- [ ] Update Lodash

### Phase 3: MEDIUM (This month)

- [ ] Add CSP and HSTS headers
- [ ] Remove console.log statements
- [ ] Add request timeouts
- [ ] Configure Redis authentication
- [ ] Configure database SSL
- [ ] Implement secrets management

### Phase 4: LOW (Ongoing)

- [ ] Add test coverage to web app
- [ ] Clean unused dependencies
- [ ] Implement cross-tab session sync
- [ ] Add monitoring and alerting
- [ ] Regular security audits

---

## References

- OWASP Top 10: https://owasp.org/www-project-top-ten/
- CWE: https://cwe.mitre.org/
- Node.js Security: https://nodejs.org/en/docs/guides/nodejs-security-checklist/
- Fastify Security: https://www.fastify.io/docs/latest/Guides/Security/
- React Security: https://snyk.io/blog/10-react-security-best-practices/

---

**Report Generated**: January 22, 2026  
**Last Updated**: January 22, 2026  
**Status**: Ready for team review
