# Plexica Project Constitution

> This document defines the non-negotiable principles, standards, and
> constraints for the Plexica project. All agents, all code, and all decisions
> must comply with these articles.
>
> **This document is immutable.** Changes are made only through the formal
> amendment process documented at the bottom.

**Version**: 1.0  
**Last Updated**: February 13, 2026  
**Status**: Active

---

## Article 1: Core Principles

### 1.1 Mission

Plexica is a modular, extensible multi-tenant SaaS platform enabling organizations to build and deploy tenant-isolated applications with plugin-based extensibility.

### 1.2 Non-Negotiable Principles

The following principles must never be violated:

1. **Security First**  
   No feature ships without security review. All code must follow SQL injection prevention, RBAC enforcement, and tenant isolation standards documented in `docs/SECURITY.md`.

2. **Multi-Tenancy Isolation**  
   Complete tenant data isolation at database and application level. Cross-tenant data leakage is a critical security violation that blocks all releases.

3. **API-First Design**  
   All functionality must be exposed through versioned REST APIs with backward compatibility. Breaking changes require a new API version.

4. **Plugin System Integrity**  
   Plugin isolation, dependency resolution, and secure plugin-to-core communication must be maintained. Plugins must not bypass core security controls.

5. **Test-Driven Development**  
   Minimum 80% test coverage enforced by CI. All new features require unit, integration, and E2E tests before merge.

6. **Zero-Downtime Deployments**  
   All changes must be backward compatible. Feature flags must be used for gradual rollout of user-facing changes.

### 1.3 User Experience Standards

Minimum UX quality bar:

- **Fast Page Loads**: Page load time < 2 seconds on 3G connections
- **Actionable Errors**: All user-facing errors must have clear, actionable messages
- **Form Validation**: All forms must have client-side validation with real-time error feedback
- **Accessibility Compliance**: WCAG 2.1 AA compliance required for all user interfaces
- **Mobile Responsiveness**: All interfaces must be responsive and usable on mobile devices

---

## Article 2: Technology Stack

### 2.1 Approved Stack

| Layer              | Technology                   | Version | Rationale                                       |
| ------------------ | ---------------------------- | ------- | ----------------------------------------------- |
| Runtime            | Node.js                      | ≥20.0.0 | Modern LTS with native ESM support              |
| Language           | TypeScript                   | ^5.9    | Type safety and developer productivity          |
| Package Manager    | pnpm                         | ≥8.0    | Efficient monorepo management                   |
| Backend Framework  | Fastify                      | ^5.7    | High performance, plugin architecture           |
| Frontend Framework | React                        | ^19.2   | Component model, ecosystem maturity             |
| Frontend Routing   | TanStack Router              | Latest  | Type-safe routing with data loading             |
| Frontend Build     | Vite                         | Latest  | Fast dev server, optimized production builds    |
| Database           | PostgreSQL                   | 15+     | Robust ACID compliance, JSON support            |
| ORM                | Prisma                       | ^6.8    | Type-safe queries, migration management         |
| Auth Provider      | Keycloak                     | 26+     | Enterprise SSO, RBAC, multi-tenancy             |
| Cache              | Redis / ioredis              | ^5.9    | Session storage, rate limiting, caching         |
| Object Storage     | MinIO                        | ^8.0    | S3-compatible storage for plugin assets         |
| Event Bus          | KafkaJS (internal workspace) | ^2.2    | Plugin event system, async communication        |
| Testing Framework  | Vitest                       | ^4.0    | Fast, Jest-compatible, native ESM support       |
| CI/CD              | GitHub Actions               | N/A     | Integrated with repository, workflow automation |

### 2.2 Dependency Policy

Rules for adding new dependencies:

1. **Popularity**: New npm packages must have >1000 weekly downloads or strong community backing
2. **Vulnerability Scanning**: No packages with known critical or high vulnerabilities
3. **TypeScript Support**: Prefer packages with TypeScript type definitions
4. **ADR Approval**: All new dependencies must be approved via Architectural Decision Record (ADR)

### 2.3 Technology Changes

Any change to the approved stack requires:

1. An ADR documenting the decision (via `/forge-adr`)
2. A constitutional amendment (see Amendments Log below)
3. Approval from the technical lead or architecture review board

---

## Article 3: Architecture Patterns

### 3.1 System Architecture

**Architecture Type**: Microservices

Plexica uses a microservices architecture where the core platform and plugins can be deployed as independent services with well-defined API contracts and service boundaries.

### 3.2 Code Organization

Enforced patterns:

1. **Feature Modules**: Code organized by feature (auth, tenant, workspace, plugin modules)
2. **Layered Architecture**: Controllers → Services → Repositories (data access layer)
3. **Service Registry**: Plugin discovery and communication via centralized service registry
4. **Domain-Driven Design**: Bounded contexts for clear module boundaries

### 3.3 Data Patterns

Required data access patterns:

1. **Prisma ORM**: All database access via Prisma; no raw SQL except parameterized queries
2. **Service Layer**: No direct database access from controllers; business logic in services
3. **Parameterized Queries**: All queries must use parameterized inputs (SQL injection prevention)
4. **Tenant Context**: Tenant context middleware automatically enforces row-level security
5. **Repository Pattern**: Complex data access logic encapsulated in repository classes

### 3.4 API Standards

Enforced API design standards:

1. **REST Conventions**: RESTful resource naming (`/api/v1/tenants`, `/api/v1/workspaces/:id/members`)
2. **API Versioning**: All endpoints versioned (`v1`, `v2`) for backward compatibility
3. **Pagination**: List endpoints must support pagination (max 100 items per page)
4. **Error Format**: Standard error response: `{ error: { code: string, message: string, details?: object } }`
5. **API Documentation**: All endpoints documented with OpenAPI/Swagger

---

## Article 4: Quality Standards

### 4.1 Test Coverage

Minimum test coverage requirements (enforced by CI):

- **Overall Coverage**: ≥80% line coverage for all code (current target per `AGENTS.md`)
- **Core Modules**: ≥85% coverage for auth, tenant, workspace modules
- **Security Code**: 100% coverage for authentication, authorization, tenant isolation logic
- **No Regressions**: PRs that decrease coverage will be rejected by CI

### 4.2 Code Review

All code must pass:

1. **Adversarial AI Review**: Run `/forge-review` before human review
2. **HIGH Severity Findings**: Must be resolved before merge
3. **MEDIUM Severity Findings**: Must have documented justification if not fixed
4. **Human Review**: At least one human approval required after AI review passes

### 4.3 Performance Targets

Enforced performance SLAs:

- **P95 API Response Time**: < 200ms for standard API endpoints
- **Database Queries**: < 50ms (P95) for all queries
- **Page Load Time**: < 2 seconds on 3G connections

### 4.4 Technical Debt

Technical debt management:

1. **Tracked TODOs**: No TODO/FIXME comments without a linked issue or spec
2. **Debt Tracking**: All technical debt tracked in `.forge/knowledge/decision-log.md`
3. **Debt Reduction**: Allocate 20% of each sprint to addressing technical debt

---

## Article 5: Security

### 5.1 Authentication & Authorization

Required authentication and authorization:

1. **Keycloak Auth**: Keycloak for all authentication and identity management
2. **Default Auth**: All endpoints require authentication unless explicitly marked `public`
3. **RBAC**: Role-based access control for all protected resources
4. **Token Expiry**: Session tokens expire after 24 hours of inactivity
5. **Tenant Validation**: Tenant context validated on every request

### 5.2 Data Protection

Data protection standards:

1. **TLS Required**: All data in transit over TLS 1.2+
2. **No PII in Logs**: Personally identifiable information must never appear in logs or error messages
3. **No Secrets in Git**: Secrets, API keys, and credentials must never be committed to source control
4. **Tenant Isolation**: Complete tenant data isolation at database level (row-level security)

### 5.3 Input Validation

Input validation and injection prevention:

1. **Zod Validation**: All external input validated with Zod schemas
2. **SQL Injection Protection**: SQL injection prevention via parameterized queries only (**MANDATORY** per `docs/SECURITY.md`)
3. **XSS Prevention**: Cross-site scripting prevention via output encoding
4. **CSRF Protection**: CSRF protection on all state-changing endpoints

### 5.4 Dependency Security

Supply chain security:

1. **Automated Scanning**: Vulnerability scanning in CI pipeline for all dependencies
2. **Critical: 48h**: Critical vulnerabilities must be patched within 48 hours
3. **High: 1 Week**: High vulnerabilities must be patched within 1 week
4. **Weekly Audits**: Weekly dependency audit reports reviewed by security team

---

## Article 6: Error Handling

### 6.1 Error Classification

Errors must be classified and handled appropriately:

1. **Operational Errors** (expected): Handle gracefully, return user-friendly messages (e.g., validation failures, tenant not found)
2. **Programmer Errors** (unexpected): Log with full context, return generic 500 error (e.g., null reference, type errors)
3. **Validation Errors**: Return 400 Bad Request with specific field errors
4. **Tenant Isolation Errors**: Return 403 Forbidden when cross-tenant access is attempted

### 6.2 Error Response Format

All API errors must follow this format:

```json
{
  "error": {
    "code": "TENANT_NOT_FOUND",
    "message": "The requested tenant does not exist or you do not have access",
    "details": {
      "tenantSlug": "acme-corp"
    }
  }
}
```

**Rules**:

- No stack traces in production responses
- Error codes must be stable and documented
- Messages must be actionable for end users

### 6.3 Logging Standards

Logging requirements:

1. **Pino JSON Logging**: Structured JSON logging with Pino (current implementation)
2. **Standard Fields**: Required fields in all logs: `timestamp`, `level`, `message`, `requestId`, `userId`, `tenantId`
3. **Log Levels**:
   - `error`: Alerts requiring immediate action
   - `warn`: Issues requiring investigation
   - `info`: Audit trail and important events
   - `debug`: Development-only verbose logging
4. **No Sensitive Data**: Never log passwords, tokens, PII, credit cards, API keys, or session IDs

---

## Article 7: Naming & Conventions

### 7.1 Code Naming

See `AGENTS.md` for detailed naming conventions. Key rules:

- **Files**: kebab-case (e.g., `auth.service.ts`, `tenant.controller.ts`)
- **Classes/Interfaces**: PascalCase (e.g., `AuthService`, `CreateTenantDto`)
- **Functions/Variables**: camelCase (e.g., `getUserById`, `tenantContext`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_PAGE_SIZE`, `DEFAULT_TIMEOUT`)

### 7.2 Database Naming

Database object naming conventions:

1. **Tables**: `snake_case`, plural (e.g., `users`, `workspace_members`)
2. **Columns**: `snake_case` (e.g., `created_at`, `tenant_id`)
3. **Indexes**: `idx_<table>_<column(s)>` (e.g., `idx_users_email`)
4. **Foreign Keys**: `fk_<table>_<referenced_table>` (e.g., `fk_workspaces_tenant`)

### 7.3 API Naming

API endpoint naming conventions:

1. **REST Naming**: `/api/v1/tenants`, `/api/v1/workspaces/:id/members`
2. **Plural Collections**: Use plural nouns for collections (`/tenants`, not `/tenant`)
3. **No URL Verbs**: Use HTTP methods (GET, POST, PUT, DELETE) instead of verbs in URLs
4. **Kebab-Case URLs**: Multi-word resources use kebab-case (e.g., `/workspace-settings`)

---

## Article 8: Testing Standards

### 8.1 Required Test Types

All features must include:

1. **Unit Tests**: All business logic, services, and utility functions
2. **Integration Tests**: All API endpoints and database operations
3. **E2E Tests**: Critical user flows (tenant creation, authentication, plugin installation)
4. **Contract Tests**: All plugin-to-core API interactions

### 8.2 Test Quality

Test quality requirements:

1. **Deterministic**: Tests must produce consistent results (no flaky tests)
2. **Independent**: Tests must not share state or depend on execution order
3. **Fast Tests**: Unit tests < 100ms, integration tests < 1s, E2E tests < 5s per test
4. **Descriptive Names**: Test names must describe expected behavior (use `should`/`when` pattern)
5. **AAA Pattern**: Follow Arrange-Act-Assert pattern for clarity

Example:

```typescript
describe('TenantService.createTenant', () => {
  it('should create tenant with unique slug', async () => {
    // Arrange
    const tenantData = { name: 'Test Corp', slug: 'test-corp' };

    // Act
    const tenant = await service.createTenant(tenantData);

    // Assert
    expect(tenant.slug).toBe('test-corp');
  });
});
```

### 8.3 Test Data

Test data management practices:

1. **Factories**: Use factories/fixtures for test data generation
2. **No Hardcoded Values**: Avoid hardcoded IDs, UUIDs, or timestamps
3. **Test Cleanup**: Database tests must clean up after themselves (transactions or teardown)
4. **No Prod Data**: Never use production data in tests
5. **Test Isolation**: Use isolated test databases per test run

---

## Article 9: Operational Requirements

### 9.1 Deployment

Deployment requirements:

1. **Feature Flags**: Feature flags required for all user-facing changes
2. **Fast Rollback**: Rollback must be possible within 5 minutes
3. **Safe Migrations**: Database migrations must be backward compatible (no breaking schema changes)

### 9.2 Monitoring

Monitoring requirements:

1. **Health Checks**: Health check endpoint at `/health` with dependency checks (database, Redis, Keycloak)
2. **Centralized Logs**: Structured logging (JSON format) to centralized logging platform
3. **Error Alerts**: Error rate > 1% triggers automated alert
4. **Latency Alerts**: P95 latency > 500ms triggers automated alert
5. **Isolation Monitoring**: Monitor and alert on potential cross-tenant data leaks

### 9.3 Incident Response

Incident response procedures:

1. **Severity Levels**: Incidents classified as P1 (critical), P2 (high), P3 (medium), P4 (low)
2. **Post-Incident Review**: Post-incident review required for all P1 and P2 incidents
3. **Runbooks**: Runbooks maintained for all critical services and common failure scenarios

---

## Amendments Log

> All changes to this constitution must be recorded here. Do not edit
> articles directly. Add an amendment entry, then update the article text.

| Date       | Article | Change                       | Rationale            | ADR Ref |
| ---------- | ------- | ---------------------------- | -------------------- | ------- |
| 2026-02-13 | All     | Initial constitution created | FORGE initialization | N/A     |

<!-- Future amendments will be recorded here by the FORGE methodology -->
