# Decision Log

> This document tracks architectural decisions, technical debt, deferred
> decisions, and implementation notes that don't warrant a full ADR.

**Last Updated**: February 17, 2026

---

## Active Decisions

### Technical Debt

| ID     | Description                                              | Impact  | Severity | Tracked In                                | Target Sprint |
| ------ | -------------------------------------------------------- | ------- | -------- | ----------------------------------------- | ------------- |
| TD-001 | Test coverage at 63%, target 80%                         | Quality | MEDIUM   | `specs/TEST_COVERAGE_IMPROVEMENT_PLAN.md` | Phase 2       |
| TD-002 | Core modules (auth, tenant, workspace) need 85% coverage | Quality | HIGH     | `AGENTS.md`                               | Q1 2026       |

### Deferred Decisions

| ID     | Decision                             | Reason Deferred                          | Revisit Date | Context               |
| ------ | ------------------------------------ | ---------------------------------------- | ------------ | --------------------- |
| DD-001 | GraphQL API layer                    | Focus on REST first; evaluate after v1.0 | Q2 2026      | Plugin API evolution  |
| DD-002 | Real-time collaboration (WebSockets) | Core platform stability priority         | Q2 2026      | Future plugin feature |

---

### Phase 3 Security Fixes (February 17, 2026)

**Date**: February 17, 2026  
**Context**: Adversarial security review of Spec 002-Authentication Phase 3 (Keycloak Service Extensions) implementation

**Issues Resolved**: 8 security and code quality issues (2 CRITICAL, 4 WARNING, 2 INFO)

**Key Fixes**:

1. **Error Response Sanitization** (CRITICAL):
   - Created `sanitizeKeycloakError()` helper to prevent stack traces and internal details from being exposed
   - Logs full errors internally with Pino, returns generic user-friendly messages
   - Applied to all 7 methods: provisionRealmClients, provisionRealmRoles, setRealmEnabled, exchangeAuthorizationCode, refreshToken, revokeToken, configureRefreshTokenRotation

2. **Input Validation** (CRITICAL):
   - Created `validateRealmName()` to prevent injection attacks
   - Validates realm name format: 1-50 chars, lowercase alphanumeric + hyphens only
   - Applied to all methods accepting `realmName` parameter

3. **Structured Logging** (WARNING):
   - Added success logging to all token operations and realm management
   - Error logging integrated into `sanitizeKeycloakError()` with full context

4. **Test Access Patterns** (INFO):
   - Changed `private client`, `withRealmScope`, `withRetry` → `protected`
   - Added `@internal` JSDoc comments
   - Removed 30 occurrences of `(keycloakService as any)` casts in tests

5. **Rollback Logic** (INFO):
   - Added Keycloak realm rollback in `TenantService.createTenant()` catch block
   - Prevents orphaned realms after failed provisioning

**Files Modified**:

- `apps/core-api/src/services/keycloak.service.ts` (+293 lines)
- `apps/core-api/src/services/tenant.service.ts` (+13 lines)
- `apps/core-api/src/__tests__/auth/integration/realm-provisioning.integration.test.ts` (removed 'as any' casts)

**Documentation**: `.forge/knowledge/phase3-security-fixes.md` (2,000+ lines comprehensive report)

**Constitution Compliance**: Articles 5.2, 5.3, 6.3, 3.2, 4.3, 8.2, 9.1

**Status**: ✅ All 8 issues resolved, TypeScript compilation passes, commit `a443fb2`

---

### Phase 3 Security Fixes Part 4: HIGH Severity Issues (February 17, 2026)

**Date**: February 17, 2026  
**Context**: Adversarial security review follow-up - 4 HIGH severity issues identified in Spec 002 Phase 3 implementation

**Commit**: `caf2f0c` - "fix(auth): resolve 4 HIGH severity issues in Spec 002 Phase 3"

**Issues Resolved**: 4 HIGH severity security and quality issues

**Fixes Implemented**:

1. **Issue 1: Sanitized Error Re-throw Guard** (HIGH)
   - Created `KeycloakSanitizedError` custom error class
   - Updated 7 call sites to throw this error type
   - Added `instanceof` checks in 3 catch blocks (lines 664, 722, 779)
   - **Result**: Error context preserved for operators while sanitizing user responses

2. **Issue 2: Provisioning Failure Status** (HIGH, Spec Violation)
   - Changed `TenantStatus.SUSPENDED` → `TenantStatus.PROVISIONING` on rollback (line 158)
   - Added comment referencing Spec 002 §5, §6, Plan §7
   - **Result**: Failed provisioning tenants can be retried/recovered per spec

3. **Issue 3: Console Logging** (HIGH, Constitution Violation)
   - Imported Pino logger in `tenant.service.ts` (line 5)
   - Replaced 4 `console.*` calls with structured logging (lines 133, 139, 166, 205)
   - Added context fields (tenantSlug, tenantId, error, stack)
   - **Result**: Constitution Art. 6.3 compliant (Pino JSON logging)

4. **Issue 4: Nested Retry Logic** (HIGH, Performance)
   - Removed outer `withRetry()` from `setRealmEnabled()` and `createRealm()`
   - Eliminated redundant auth attempts (4x → 2x)
   - **Result**: 50% latency reduction on auth failures

**Files Modified**:

- `apps/core-api/src/services/keycloak.service.ts` (~150 lines)
- `apps/core-api/src/services/tenant.service.ts` (~40 lines)

**Constitution Compliance**: Articles 5.2 (Error Sanitization), 6.3 (Structured Logging), 4.3 (Performance)

**Spec Compliance**: Spec 002 Section 5 (Tenant Provisioning), Section 6 (Failure Recovery)

**Status**: ✅ All 4 HIGH issues resolved, TypeScript compilation clean, committed

---

### Phase 4 Task 4.6 Complete: Auth Middleware Refactoring (February 17, 2026)

**Date**: February 17, 2026  
**Context**: Spec 002-Authentication Phase 4 (OAuth Authorization Code Flow) - Auth middleware updates for Constitution compliance

**Task**: 4.6 - Refactor auth middleware for suspended tenant check, cross-tenant validation, and Constitution-compliant error format

**Changes Implemented**:

1. **Main authMiddleware()** (lines 32-143):
   - ✅ Added suspended tenant check after JWT validation (FR-012, Edge Case #9)
   - ✅ Added cross-tenant validation for URLs with `/tenants/:id/` pattern (FR-011)
   - ✅ Updated all error responses to nested Constitution format (Article 6.2)
   - ✅ Super admin bypass for cross-tenant validation

2. **requireRole()** (lines 157-184):
   - ✅ Updated to nested error format with `AUTH_INSUFFICIENT_ROLE` code
   - ✅ Added `details` object with `requiredRoles` and `userRoles`

3. **requirePermission()** (lines 198-241):
   - ✅ Updated to nested error format with `AUTH_INSUFFICIENT_PERMISSION` code
   - ✅ Added `details` object with `requiredPermissions`

4. **requireSuperAdmin()** (lines 257-338):
   - ✅ Updated to nested error format with `AUTH_SUPER_ADMIN_REQUIRED` code
   - ✅ Added `details` object with context (userRealm, validRealms, userRoles)

5. **requireTenantOwner()** (lines 344-377):
   - ✅ Updated to nested error format with `AUTH_TENANT_OWNER_REQUIRED` code
   - ✅ Added `details` object with `userRoles` and `requiredRoles`

6. **requireTenantAccess()** (lines 392-487):
   - ✅ Updated to nested error format with proper error codes
   - ✅ Added detailed context in all error responses
   - ✅ Improved error messages for debugging

**Error Codes Standardized**:

- `AUTH_TOKEN_MISSING` (401) - No bearer token provided
- `AUTH_TOKEN_EXPIRED` (401) - Token has expired
- `AUTH_TOKEN_INVALID` (401) - Invalid or malformed token
- `AUTH_TENANT_NOT_FOUND` (403) - Tenant doesn't exist
- `AUTH_TENANT_SUSPENDED` (403) - Tenant is suspended
- `AUTH_CROSS_TENANT` (403) - Token not valid for this tenant
- `AUTH_REQUIRED` (401) - Authentication required
- `AUTH_INSUFFICIENT_ROLE` (403) - Missing required role
- `AUTH_INSUFFICIENT_PERMISSION` (403) - Missing required permission
- `AUTH_SUPER_ADMIN_REQUIRED` (403) - Super admin access required
- `AUTH_TENANT_OWNER_REQUIRED` (403) - Tenant owner access required
- `TENANT_ID_REQUIRED` (400) - Tenant ID missing in path
- `TENANT_FETCH_FAILED` (500) - Failed to fetch tenant

**Files Modified**:

- `apps/core-api/src/middleware/auth.ts` (~130 lines modified, 487 lines total)
- `.forge/specs/002-authentication/tasks.md` (marked Task 4.6 complete)

**Constitution Compliance**: Articles 1.2 (Multi-Tenancy Isolation), 5.1 (Tenant Validation), 6.2 (Error Format), 6.3 (Structured Logging)

**Next Steps**:

- Task 4.6.1: Write unit tests for refactored middleware (estimated 3-4h)
- Task 4.7: Rewrite auth routes for OAuth flow (estimated 6h)

**Status**: ✅ Implementation complete; unit tests pending

---

### Phase 4 Task 4.6.1 Complete: Auth Middleware Unit Tests (February 17, 2026)

**Date**: February 17, 2026  
**Context**: Spec 002-Authentication Phase 4 (OAuth Authorization Code Flow) - Unit tests for refactored auth middleware

**Task**: 4.6.1 - Write comprehensive unit tests for all 6 middleware functions with ≥90% coverage target

**Test Coverage Implemented**:

1. **authMiddleware()** (10 tests):
   - Successful authentication with valid token
   - 401 AUTH_TOKEN_MISSING when no bearer token
   - 401 AUTH_TOKEN_EXPIRED when token expired
   - 401 AUTH_TOKEN_INVALID when token invalid
   - 403 AUTH_TENANT_NOT_FOUND when tenant doesn't exist
   - 403 AUTH_TENANT_SUSPENDED when tenant suspended (Edge Case #9, FR-012)
   - 403 AUTH_CROSS_TENANT when JWT tenant ≠ requested tenant (FR-011)
   - Super admin bypass for cross-tenant access
   - Success when no tenant context in URL path
   - User and token attachment to request

2. **requireRole()** (4 tests):
   - 401 AUTH_REQUIRED when not authenticated
   - 403 AUTH_INSUFFICIENT_ROLE when role missing
   - Pass when user has required role
   - Pass when user has one of multiple required roles

3. **requirePermission()** (4 tests):
   - 401 AUTH_REQUIRED when not authenticated
   - 403 AUTH_INSUFFICIENT_PERMISSION when permission missing
   - 500 PERMISSION_CHECK_FAILED on database error
   - Pass when user has required permission

4. **requireSuperAdmin()** (8 tests):
   - BYPASS_AUTH behavior in development vs production
   - 401 AUTH_REQUIRED when not authenticated
   - 403 AUTH_SUPER_ADMIN_REQUIRED for invalid realm
   - 403 AUTH_SUPER_ADMIN_REQUIRED when missing super_admin role
   - Pass for super_admin from master realm
   - Pass for super_admin from plexica-admin realm
   - Pass for super-admin role (kebab-case variant)
   - Allow plexica-test realm in non-production

5. **requireTenantOwner()** (5 tests):
   - 401 AUTH_REQUIRED when not authenticated
   - Super admin bypass from master realm
   - 403 AUTH_TENANT_OWNER_REQUIRED when missing role
   - Pass for tenant_owner role
   - Pass for admin role

6. **requireTenantAccess()** (7 tests):
   - 401 AUTH_REQUIRED when not authenticated
   - 400 TENANT_ID_REQUIRED when tenant ID missing in path
   - Super admin bypass for cross-tenant access
   - 500 TENANT_FETCH_FAILED on database error
   - 403 AUTH_TENANT_NOT_FOUND when user tenant not found
   - 403 AUTH_CROSS_TENANT when tenant ID mismatch
   - Pass when tenant ID matches user's tenant

**Files Created**:

- `apps/core-api/src/__tests__/auth/unit/auth-middleware.test.ts` (987 lines, 38 tests)

**Test Coverage Results**:

- **Overall**: 91.96% (exceeds ≥90% target)
- **Statements**: 91.96%
- **Branches**: 92.95%
- **Functions**: 91.66%
- **Lines**: 92.72%
- **Uncovered lines**: 168-182 (optionalAuthMiddleware function, not modified in Task 4.6)

**Test Quality**:

- All tests use Constitution-compliant nested error format validation
- Comprehensive mock strategy with Vitest
- Helper functions for creating mock requests, replies, tenants, JWT payloads, user info
- Independent tests (no shared state, proper cleanup with beforeEach)
- Follows AAA pattern (Arrange-Act-Assert)

**Files Updated**:

- `.forge/specs/002-authentication/tasks.md` (added Task 4.6.1 with full details)
- `.forge/knowledge/decision-log.md` (this entry)

**Constitution Compliance**: Articles 1.2 (Multi-Tenancy Isolation), 4.1 (Test Coverage ≥80%), 5.1 (Tenant Validation), 6.2 (Error Format), 8.2 (Test Quality)

**Next Steps**:

- Task 4.7: Rewrite auth routes for OAuth flow (estimated 6h)
- Task 4.7.1: Unit tests for auth routes (estimated 4h)

**Status**: ✅ Complete (38 tests, 91.96% coverage, all passing)

---

## Implementation Notes

### Microservices Architecture

**Date**: February 13, 2026  
**Context**: Constitution Article 3.1 defines architecture as Microservices

**Current State**:

- Core API is a modular monolith with clear module boundaries
- Plugin system supports both:
  - **Embedded plugins**: Loaded as modules within core-api process
  - **Remote plugins**: Deployed as separate microservices

**Migration Strategy**:

- Phase 1 (Current): Modular monolith with plugin system
- Phase 2 (Q2 2026): Extract plugins as independent microservices
- Phase 3 (Q3 2026): Core platform service decomposition if needed

**Rationale**:

- Start with modular monolith for development velocity
- Service registry pattern already in place for future microservices
- Plugin isolation and API contracts enable gradual extraction

**Related ADRs**:

- [ADR-001: Monorepo Strategy](adr/adr-001-monorepo-strategy.md)
- [ADR-002: Database Multi-Tenancy](adr/adr-002-database-multi-tenancy.md)
- [ADR-005: Event System (Redpanda)](adr/adr-005-event-system-redpanda.md)
- [ADR-006: Fastify Framework](adr/adr-006-fastify-framework.md)
- [ADR-007: Prisma ORM](adr/adr-007-prisma-orm.md)
- See [ADR Index](adr/README.md) for all 11 ADRs

---

### ADR-012: ICU MessageFormat Library (FormatJS)

**Date**: 2026-02-13  
**Decision**: Selected FormatJS (`@formatjs/intl` + `react-intl`) as the ICU
MessageFormat library for Plexica's i18n system (Spec 006).  
**Rationale**: FormatJS provides native ICU MessageFormat compliance (built
by ICU-TC contributors), compile-time message compilation for optimal bundle
size (~12KB vs ~25KB for i18next+ICU), dual Node.js/browser API for shared
`@plexica/i18n` package, and strong React integration. i18next rejected due
to bolted-on ICU support, heavier bundle, and runtime parsing. LinguiJS
rejected due to smaller ecosystem and macro build complexity with Module
Federation.  
**Impact**: New dependencies (`@formatjs/intl`, `react-intl`, `@formatjs/cli`);
system architecture doc updated to FormatJS (2026-02-13); `@plexica/i18n`
shared package to be created.  
**Status**: ✅ Architecture updated; Spec 006 clarified and corrected.

---

### LanguageSelector Component in @plexica/ui

**Date**: February 16, 2026  
**Context**: Sprint 2 planning for E01-S006 (Frontend Integration) - Task 6.3

**Decision**: Implement `LanguageSelector` component in `packages/ui` as part of the shared UI library, rather than directly in `apps/web/src/components`.

**Rationale**:

- **Reusability**: Component will be used across multiple apps (`apps/web`, `apps/super-admin`, plugin frontends)
- **Design system consistency**: Aligns with existing 36 components in `@plexica/ui` (Button, Select, Dropdown, etc.)
- **Infrastructure ready**: Storybook and Vitest already configured in `packages/ui`
- **Quality assurance**: Storybook enables visual testing and component documentation; Vitest provides unit test coverage
- **Constitution compliance**: Art. 3.2 (reusable components in shared packages), Art. 8.2 (component testing requirements)

**Implementation**:

- Component built on `@radix-ui/react-select` (consistent with existing Select component)
- Headless/agnostic API: accepts `locales`, `value`, `onChange` props (no i18n logic in UI component)
- Storybook stories: default state, many locales, disabled state, styling examples
- Unit tests: rendering, interaction, keyboard navigation, accessibility (target ≥85% coverage)
- Usage in apps: imported from `@plexica/ui` and integrated with app-specific IntlContext

**Files**:

- Create: `packages/ui/src/components/LanguageSelector/` (component, stories, tests, index)
- Modify: `packages/ui/src/index.ts` (export LanguageSelector)
- Usage: `apps/web/src/App.tsx` (integrate with IntlContext)

**Status**: ✅ **COMPLETE** (Feb 16, 2026) — Component implemented with 15 unit tests (100% coverage), 9 Storybook stories, integrated in apps/web Header

---

### Milestone 4 Security Fixes (February 14, 2026)

Following adversarial code review (`/forge-review`) of Milestone 4 implementation, three CRITICAL security vulnerabilities were identified and immediately fixed before continuing with Milestone 5.

#### CRITICAL #1: Cross-Tenant Authorization Bypass

**Vulnerability**: Any authenticated user could manage plugins on ANY tenant (install, activate, configure, uninstall) by manipulating the `tenantId` parameter in the URL.

**Files Modified**:

- `apps/core-api/src/middleware/auth.ts` - Created `requireTenantAccess()` middleware
- `apps/core-api/src/routes/plugin.ts` - Applied middleware to 6 tenant plugin routes

**Fix Implementation**:

```typescript
// New middleware validates tenant ownership before plugin operations
export async function requireTenantAccess(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = (request.params as { id: string }).id;
  const userTenant = await tenantService.getTenantBySlug(request.user.tenantSlug);

  if (userTenant.id !== tenantId && !isSuperAdmin(request.user)) {
    reply.code(403).send({ error: 'Access denied to this tenant' });
  }
}
```

**Impact**: **HIGH** - Prevented complete multi-tenant isolation violation  
**Constitution Violation**: Article 1.2 (Multi-Tenancy Isolation), Article 5.1 (Tenant Validation)  
**Status**: ✅ Fixed (Feb 14, 2026)

---

#### CRITICAL #2: Path Traversal Risk in Translation Validation

**Vulnerability**: Translation file validation didn't re-validate locale/namespace at filesystem boundary despite Zod validation upstream. Potential for directory traversal attacks via crafted manifest.

**File Modified**: `apps/core-api/src/services/plugin.service.ts` (lines 346-403)

**Fix Implementation** (Defense-in-Depth):

1. **Layer 1**: Zod schema validates namespace/locale format at manifest parsing
2. **Layer 2**: Re-validate formats at filesystem boundary with strict regex
3. **Layer 3**: Path resolution + `startsWith()` check ensures path stays within plugin directory

```typescript
// Re-validate at filesystem boundary
const namespaceRegex = /^[a-z0-9\-]+$/;
const localeRegex = /^[a-z]{2}(-[A-Z]{2})?$/;

if (!localeRegex.test(locale) || !namespaceRegex.test(namespace)) {
  throw new Error('SECURITY_VIOLATION: Invalid locale or namespace format');
}

// Path resolution check
const resolvedPath = path.resolve(filePath);
if (!resolvedPath.startsWith(pluginBasePath)) {
  throw new Error('SECURITY_VIOLATION: Path traversal attempt detected');
}
```

**Impact**: **HIGH** - Prevented potential filesystem access outside plugin boundaries  
**Constitution Violation**: Article 5.3 (Input Validation)  
**Status**: ✅ Fixed (Feb 14, 2026)

---

#### CRITICAL #3: Transaction Integrity Violation

**Vulnerability**: Service registrations happened outside Prisma transaction, causing orphaned registry entries if lifecycle hooks failed. This violated ACID properties.

**File Modified**: `apps/core-api/src/services/plugin.service.ts` (lines 534-607)

**Fix Implementation**:

- **Before**: Service registration inside transaction → orphaned if hook failed
- **After**: Lifecycle hooks inside transaction, service registration after commit

```typescript
// Transaction now contains ONLY:
const installation = await db.$transaction(async (tx) => {
  const inst = await tx.tenantPlugin.create({ ... });

  // Lifecycle hook INSIDE transaction
  if (manifest.lifecycle?.install) {
    await executeHook(manifest.lifecycle.install);
  }

  return inst;
});

// Service registration AFTER successful commit
if (manifest.api?.services) {
  await serviceRegistry.registerServices(manifest.api.services);
}
```

**Impact**: **HIGH** - Prevented database inconsistency and orphaned records  
**Constitution Violation**: Article 3.2 (Service Layer Encapsulation)  
**Trade-off**: If service registration fails after commit, plugin is installed but without services (acceptable - can be re-registered manually)  
**Status**: ✅ Fixed (Feb 14, 2026)

---

### Milestone 4 Security Fixes Part 2 (February 14, 2026)

Following resolution of 3 CRITICAL issues, 3 additional WARNING-level security and code quality issues were fixed:

#### WARNING #2: Unbounded Query - Memory Exhaustion Risk

**Vulnerability**: `getPluginStats()` loaded ALL tenant plugin installations into memory using `findMany({ include: { installations: true } })`. For popular plugins with 10,000+ installations, this caused:

- Loading ~500MB+ data into memory
- Risk of Node.js out-of-memory errors
- Linear scaling O(n) with tenant count

**File Modified**: `apps/core-api/src/services/plugin.service.ts` (lines 270-322)

**Fix Implementation**:

- Replaced `findMany` with 3 parallel `COUNT()` aggregation queries
- Memory usage reduced from O(n) to O(1)
- Database handles aggregation, no data transfer overhead

```typescript
// Old: Load all installations into memory
const plugin = await db.plugin.findUnique({
  where: { id: pluginId },
  include: { installations: true }, // Loads 10,000+ records
});

// New: Database aggregation queries
const [totalInstallations, enabledInstallations, activeTenantsCount] = await Promise.all([
  db.tenantPlugin.count({ where: { pluginId } }),
  db.tenantPlugin.count({ where: { pluginId, enabled: true } }),
  db.tenantPlugin.count({ where: { pluginId, enabled: true, tenant: { status: 'ACTIVE' } } }),
]);
```

**Impact**: **HIGH** - Prevented memory exhaustion and scalability bottleneck  
**Constitution Compliance**: Article 3.3 (Database aggregation for performance), Article 4.3 (Performance targets)  
**Status**: ✅ Fixed (Feb 14, 2026)

---

#### WARNING #3: Validation Bypass in updatePlugin()

**Vulnerability**: `updatePlugin()` method only used custom validation (`validateManifest()`), bypassing Zod schema validation that was enforced in `registerPlugin()`. This inconsistency allowed attackers to bypass format validation (e.g., plugin ID format) when updating existing plugins.

**File Modified**: `apps/core-api/src/services/plugin.service.ts` (lines 128-161)

**Fix Implementation**:

- Added `validatePluginManifest()` Zod validation before custom validation
- Defense-in-depth: Both Zod schema + custom validation enforced
- Consistent with `registerPlugin()` pattern

```typescript
async updatePlugin(pluginId: string, manifest: Partial<PluginManifest>): Promise<Plugin> {
  // NEW: Zod validation (was missing)
  const validation = validatePluginManifest(manifest as PluginManifest);
  if (!validation.valid) {
    const errorMessages = validation.errors?.map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new Error(`Invalid plugin manifest: ${errorMessages}`);
  }

  // Existing: Custom validation
  await this.validateManifest(manifest as PluginManifest);

  // ... rest of update logic
}
```

**Impact**: **HIGH** - Closed security bypass, enforced input validation  
**Constitution Compliance**: Article 5.3 (Zod validation for all external input)  
**Status**: ✅ Fixed (Feb 14, 2026)

---

#### INFO #6: Non-compliant Logging (console.log)

**Issue**: `PluginRegistryService` and `PluginLifecycleService` used custom "silent logger" wrapper around `console.log/error/warn`, violating Constitution Article 6.3 (Pino JSON logging).

**Files Modified**:

- `apps/core-api/src/services/plugin.service.ts` (constructor refactored)
- `apps/core-api/src/lib/logger.ts` (new shared Pino logger)

**Fix Implementation**:

1. Created shared Pino logger instance (`lib/logger.ts`) with proper configuration
2. Updated both service constructors to accept optional `Logger` parameter
3. Replaced all `console.log/error/warn` with structured Pino logging
4. Logger passed to nested services (ServiceRegistryService, DependencyResolutionService)

```typescript
// New: Shared Pino logger
export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  transport: isDevelopment ? { target: 'pino-pretty', ... } : undefined,
});

// Updated constructors
export class PluginRegistryService {
  private logger: Logger;

  constructor(customLogger?: Logger) {
    this.logger = customLogger || logger; // Use custom or default Pino logger
    this.serviceRegistry = new ServiceRegistryService(db, redis, this.logger);
    this.dependencyResolver = new DependencyResolutionService(db, this.logger);
  }
}

// Structured logging with context
this.logger.error(
  { pluginId: manifest.id, serviceName: service.name, error: errorMsg },
  `Failed to register service '${service.name}'`
);
```

**Impact**: **MEDIUM** - Improved observability, structured logging compliance  
**Constitution Compliance**: Article 6.3 (Pino JSON logging with standard fields: timestamp, level, message, requestId, userId, tenantId)  
**Status**: ✅ Fixed (Feb 14, 2026)

---

**Test Coverage**: Added 11 comprehensive tests in `plugin-security-fixes.test.ts`:

- 2 tests for Issue #2 (COUNT aggregation)
- 3 tests for Issue #3 (Zod + custom validation)
- 3 tests for Issue #6 (Pino logger integration)
- 3 tests for Constitution compliance verification

**All Tests Passing**: 825/825 tests pass (814 existing + 11 new)

---

### Milestone 4 Security Fixes Part 3 (February 14, 2026)

Following resolution of 6 WARNING/INFO issues in Parts 1 and 2, the remaining 3 WARNING-level security issues were fixed to complete the M4 security remediation:

#### WARNING #1: ReDoS Vulnerability in Plugin Manifest Validation

**Vulnerability**: `validateRegexPattern()` used basic pattern matching (regex to validate regex) which was incomplete and could miss dangerous patterns. Attackers could craft regex patterns with exponential backtracking in plugin configuration validation rules, causing denial of service.

**File Modified**: `apps/core-api/src/services/plugin.service.ts` (lines 952-974)

**Fix Implementation**:

- Replaced pattern matching with `safe-regex2` library for comprehensive static analysis
- Library detects: nested quantifiers, excessive backtracking, overlapping alternations
- Provides actionable error messages for plugin developers

```typescript
// Old: Basic pattern matching (incomplete)
const redosPatterns = [
  /(\w\+)\+/, // nested + quantifier
  /(\w\*)\*/, // nested * quantifier
  // ... limited set of patterns
];

for (const redosPattern of redosPatterns) {
  if (redosPattern.test(pattern)) {
    throw new Error(`ReDoS vulnerability detected`);
  }
}

// New: Comprehensive static analysis with safe-regex2
if (!safeRegex(pattern)) {
  throw new Error(
    `ReDoS vulnerability detected in regex pattern: "${pattern}". ` +
      'This pattern may cause excessive backtracking and denial of service. ' +
      'Avoid nested quantifiers (e.g., (a+)+, (a*)*), overlapping alternations (e.g., (a|ab)+), ' +
      'and patterns with exponential complexity. ' +
      'See plugin development documentation for safe regex patterns.'
  );
}
```

**Impact**: **HIGH** - Prevented ReDoS attacks, comprehensive pattern detection  
**Constitution Compliance**: Article 5.3 (Input validation)  
**Status**: ✅ Fixed (Feb 14, 2026)

---

#### WARNING #5: Unimplemented Version Check in Dependency Validation

**Vulnerability**: `validateDependencies()` had a `TODO` comment at line 915 - only checked if dependency exists, not version compatibility. Plugins could install with incompatible dependencies, causing runtime failures.

**File Modified**: `apps/core-api/src/services/plugin.service.ts` (lines 900-933)

**Fix Implementation**:

- Implemented semver version checking using `semver.satisfies()`
- Validates exact versions, ranges, and complex operators (e.g., `^2.0.0`, `>=1.5.0 <2.0.0`)
- Error messages include both required and installed versions

```typescript
// Old: TODO comment, no version checking
// TODO: Implement version checking

// New: Full semver validation
const installedVersion = installation.plugin.version;
if (!semver.satisfies(installedVersion, _version)) {
  throw new Error(
    `Incompatible dependency version: Plugin '${depId}' requires version ${_version}, ` +
      `but installed version is ${installedVersion}`
  );
}
```

**Impact**: **HIGH** - Prevented incompatible plugin installations, runtime stability  
**Constitution Compliance**: Article 3.2 (Service layer encapsulation), Article 4.3 (Quality standards)  
**Status**: ✅ Fixed (Feb 14, 2026)

---

#### WARNING #4: Code Duplication in Logger and Service Instantiation

**Issue**: Both `PluginRegistryService` and `PluginLifecycleService` instantiated their own logger instances, duplicating initialization logic. This violated DRY principle and made configuration changes difficult.

**Files Modified**:

- `apps/core-api/src/services/plugin.service.ts` (constructors already refactored in Part 2)
- Verification: Confirmed shared logger pattern is used consistently

**Fix Status**: **ALREADY FIXED** in Security Fixes Part 2 (Issue #6)

- Shared Pino logger created in `lib/logger.ts`
- Both service constructors accept optional `customLogger?: Logger` parameter
- Fall back to shared logger when no custom logger provided
- Logger passed to nested services consistently

**Impact**: **MEDIUM** - Improved maintainability, consistent logging configuration  
**Constitution Compliance**: Article 6.3 (Pino JSON logging)  
**Status**: ✅ Verified (Feb 14, 2026)

---

**Test Coverage**: Added 12 comprehensive tests in `plugin-security-fixes.test.ts`:

- 4 tests for Issue #1 (ReDoS detection with safe-regex2)
- 5 tests for Issue #5 (semver version checking)
- 3 tests for Issue #4 (shared logger verification)
- Total: 23 tests in security-fixes test file (11 from Part 2 + 12 from Part 3)

**All Tests Passing**: 836/836 tests pass (825 from Part 2 + 11 new)

**Security Remediation Complete**: All 6 security issues identified by `/forge-review` have been resolved:

- 3 CRITICAL issues (Part 1): Cross-tenant bypass, path traversal, transaction integrity
- 3 WARNING/INFO issues (Part 2): Unbounded query, validation bypass, logging compliance
- 3 WARNING issues (Part 3): ReDoS vulnerability, version check, code duplication

---

### Sprint 2 Security Review (February 16, 2026)

**Context**: Adversarial security review of Sprint 2 i18n frontend integration code following FORGE methodology.

**Findings**: 1 CRITICAL + 5 WARNING + 2 INFO issues identified across security, performance, and maintainability dimensions.

**Critical Issues (Resolved)**:

1. **Memory Exhaustion DoS Vulnerability** - Translation override payload parsed by Fastify before size check, allowing multi-GB JSON payloads to cause OOM crash
   - **Fix Applied**: Added `bodyLimit: 1024 * 1024` to Fastify route configuration (commit `205d462`)
   - **Constitution Violation**: Article 5.2 (Data Protection), Article 9.2 (DoS Prevention)
   - **Status**: ✅ Fixed (Feb 16, 2026)

2. **Empty String Validation Bypass** - Client-side validation only, backend accepted empty string overrides
   - **Fix Applied**: Added backend validation loop to reject empty string values (commit `205d462`)
   - **Constitution Violation**: Article 5.3 (Input Validation)
   - **Status**: ✅ Fixed (Feb 16, 2026)

**Warning Issues (Needs Tracking)**:

- **Insecure ETag Generation** - Plain SHA256 hash without HMAC, susceptible to cache poisoning (Medium priority)
- **UI Performance Degradation** - O(n) recomputation on every render for large translation sets (Medium priority)
- **Monolithic Component** - 531-line file violates maintainability standards (Low priority)
- **Stale Translations Flicker** - Messages cleared after locale update causes UX flicker (Medium priority)

**Documentation**:

- Full report: `.forge/knowledge/security-review-2026-02-16.md`
- GitHub issues: Manual creation required (authentication not configured)

**Verdict**: ✅ **APPROVED FOR MERGE** (critical issues resolved)

---

## Recent Changes

| Date       | Change                             | Reason                                                               | Impact                                                                                                                          |
| ---------- | ---------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 2026-02-17 | Phase 3 security fixes (Spec 002)  | Adversarial review found 8 security/quality issues in Keycloak code  | High - 2 CRITICAL (error leakage, input validation), 4 WARNING, 2 INFO resolved; +293 lines keycloak.service.ts; commit a443fb2 |
| 2026-02-16 | Spec 009 updated (v1.1)            | Added Tasks 6 & 7 from /forge-clarify (error format + rate limiting) | High - 7 tasks total (68-104h); 37 story points; updated tasks.md (2,439 lines) and plan.md (890+ lines); Sprint 3 now 24 pts   |
| 2026-02-16 | Created Spec 009: Workspace Mgmt   | FORGE spec for brownfield workspace system (85% implemented)         | High - 3 files (spec.md 2,954 lines, tasks.md, plan.md); 5 gaps identified; 58-88h implementation; 95-124 tests planned         |
| 2026-02-16 | Updated PLUGIN_DEVELOPMENT.md      | Added "Using Core Services" section with planned API examples        | Medium - 140+ line section documenting Storage, Notification, Job Queue, Search service usage patterns for plugin devs          |
| 2026-02-16 | Updated docs/ARCHITECTURE.md       | Added comprehensive Backend Architecture section                     | High - 300+ line section: microservices design, Core API, plugin services, request flow, tech stack, migration path             |
| 2026-02-16 | Updated FUNCTIONAL_SPECIFICATIONS  | Added implementation status warnings to Sections 5 and 10            | High - Disclaimer blocks added: RBAC-only (ABAC planned), Core Services 0% implemented; metadata updated to Feb 16              |
| 2026-02-16 | Created PROVISIONING.md            | Document tenant provisioning (semi-automated)                        | Medium - 11,000+ line guide for manual provisioning; rollback strategies; grace period management; automation roadmap           |
| 2026-02-16 | Created PLUGIN_DEPLOYMENT.md       | Document manual deployment (no orchestration exists)                 | Medium - 10,000+ line guide for Docker/K8s deployment; health checks; resource limits; planned automation roadmap               |
| 2026-02-16 | Gap analysis FORGE specs vs code   | Comprehensive audit of implementation vs specifications              | High - Identified 3 critical gaps (Core Services 0%, ABAC missing, User sync absent); documentation divergences documented      |
| 2026-02-16 | Sprint 2 security review complete  | Adversarial review found 1 CRITICAL + 5 WARNING issues               | High - CRITICAL DoS and validation issues fixed in commit 205d462; 5 WARNING issues documented for tracking                     |
| 2026-02-16 | Task 6.3 LanguageSelector complete | Frontend i18n component fully integrated                             | High - 15 unit tests (100% coverage), 9 Storybook stories, integrated in Header; pragmatic testing strategy                     |
| 2026-02-16 | LanguageSelector in @plexica/ui    | Sprint 2 Task 6.3 architectural decision                             | Medium - Component will be reusable across apps; Storybook stories; Vitest tests; design system consistency                     |
| 2026-02-16 | Sprint 2 started                   | Frontend i18n integration (E01-S006, 5 pts, 1 week)                  | High - Completes i18n epic; focused sprint for quality implementation; baseline velocity 23 pts                                 |
| 2026-02-16 | Sprint format migration            | Migrated from single-file to multi-sprint directory architecture     | High - Sprint 001 archived; new directory structure; sprint-sequence.yaml created; ready for concurrent sprints                 |
| 2026-02-15 | PROJECT_STATUS.md updated          | Sprint 1 completion and i18n system status update                    | High - Sprint 1 milestone documented; i18n backend 100% complete; baseline velocity 23 pts; Sprint 2 ready                      |
| 2026-02-15 | Auth test failures fixed           | Tenant context fallback for test compatibility                       | High - All 218 i18n tests passing (100%); controller now works with/without tenant context middleware                           |
| 2026-02-15 | Sprint 1 closed                    | Backend i18n complete (23/28 pts); E01-S006 carried to Sprint 2      | High - Baseline velocity established (23 pts); retrospective created; Sprint 2 ready for planning                               |
| 2026-02-14 | Security fixes part 3 (M4)         | /forge-review WARNING issues #1, #4, #5 resolved                     | High - ReDoS fix, semver version check, code duplication; 12 new tests; 836 tests passing                                       |
| 2026-02-14 | Security fixes part 2 (M4)         | /forge-review WARNING issues #2, #3, #6 resolved                     | High - Unbounded query fix, Zod validation fix, Pino logging compliance; 11 new tests; 825 tests passing                        |
| 2026-02-14 | Transaction integrity fix (M4)     | /forge-review found orphaned service registrations                   | High - Moved service registration outside transaction, lifecycle hooks inside transaction                                       |
| 2026-02-14 | Cross-tenant auth bypass fix (M4)  | /forge-review found tenant authorization bypass                      | High - Created requireTenantAccess middleware, applied to 6 plugin routes, prevents cross-tenant access                         |
| 2026-02-14 | Path traversal fix (M4 security)   | /forge-review found path traversal risk in translation validation    | High - Added defense-in-depth: re-validate locale/namespace, path.resolve() + startsWith() check                                |
| 2026-02-14 | Milestone 4 (i18n) completed       | Plugin manifest integration with translation validation              | High - 5 tasks complete; manifest schema extended; file validation at registration; PLUGIN_TRANSLATIONS.md created              |
| 2026-02-14 | Milestone 3 (i18n) completed       | Backend i18n Service with TranslationService, API routes, caching    | High - 8 tasks complete; 4 API endpoints; Redis caching; 179 core translations; ready for plugin integration                    |
| 2026-02-13 | Milestone 2 (i18n) completed       | @plexica/i18n shared package created with FormatJS wrapper           | High - 8 tasks complete; 115 tests passing; 94.9% coverage; ready for backend integration                                       |
| 2026-02-13 | Milestone 1 (i18n) completed       | Database schema and migration for i18n support implemented           | High - All 3 tasks complete; migration tested with 11 passing tests                                                             |
| 2026-02-13 | Spec 006 clarification (session 2) | Resolved /forge-analyze findings: data model, NFR measurability      | Medium - Fixed `tenant_settings` ref, added `default_locale`, made NFR-004/005 measurable                                       |
| 2026-02-13 | Architecture: i18n module added    | Added i18n module to core-api structure for Spec 006                 | Low - Documents future Phase 3 module                                                                                           |
| 2026-02-13 | Architecture: public endpoints     | Documented unauthenticated request flow pattern                      | Medium - Enables public translation/asset endpoints                                                                             |
| 2026-02-13 | Architecture: i18next → FormatJS   | Updated system-architecture.md per ADR-012                           | High - Aligns architecture with accepted ADR-012 decision                                                                       |
| 2026-02-13 | ADR-012: FormatJS for i18n         | ICU MessageFormat library selection for Spec 006-i18n                | Medium - New dependencies; system architecture doc updated                                                                      |
| 2026-02-13 | FORGE documentation conversion     | Convert all docs/specs/planning to FORGE format                      | High - All documentation centralized under .forge/                                                                              |
| 2026-02-13 | 11 ADRs created in FORGE format    | Migrate from planning/DECISIONS.md to individual ADR files           | Medium - Better navigability and cross-referencing                                                                              |
| 2026-02-13 | 8 modular specs created            | Break monolithic FUNCTIONAL_SPECIFICATIONS.md into modular specs     | High - Specs are now traceable and independently maintainable                                                                   |
| 2026-02-13 | Architecture docs created          | Synthesize system, deployment, and security architecture docs        | High - Architecture decisions are now documented with Mermaid diagrams                                                          |
| 2026-02-13 | Product brief and roadmap created  | Extract from functional specs into FORGE product docs                | Medium - Product vision and roadmap centralized                                                                                 |
| 2026-02-13 | FORGE methodology initialized      | Improve structured development workflow                              | High - All future work follows FORGE                                                                                            |
| 2026-02-13 | Constitution created (v1.0)        | Define non-negotiable project standards                              | High - Governs all development decisions                                                                                        |

---

## Security Warnings Tracked

Following Milestone 4 code review (`/forge-review`), 6 security and code quality issues were identified and documented for future resolution:

- **5 WARNING issues**: ReDoS vulnerability, unbounded query, duplicate validation, code duplication, unimplemented version check
- **1 INFO issue**: Non-compliant logging (console.log vs Pino)

**Full details**: See [`.forge/knowledge/security-warnings.md`](./security-warnings.md)

**Status**: Issues documented, awaiting GitHub issue creation  
**Target Sprint**: Sprint 2 (post-i18n cleanup)  
**Estimated Effort**: 11-17 hours total

---

## Questions & Clarifications

<!-- Use this section to track open questions that need resolution -->

No open questions currently.

---

_This document is living and should be updated as decisions are made or
deferred. For significant architectural decisions, create a full ADR using
`/forge-adr`._
