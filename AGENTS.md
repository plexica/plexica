# Agent Guidelines for Plexica

This file provides essential guidelines for AI coding agents working in the Plexica repository, including build/test commands, code style, and best practices.

## Quick Start - Essential Commands

```bash
# Setup and development
pnpm install                    # Install dependencies
pnpm dev                        # Start development servers (all packages)
pnpm build                      # Build all packages
pnpm lint                       # Run linting across all packages
pnpm format                     # Format code with Prettier

# Testing - Core API (main package)
cd apps/core-api
pnpm test                       # Run all tests (vitest)
pnpm test:unit                  # Unit tests only
pnpm test:integration           # Integration tests only
pnpm test:e2e                   # E2E tests only
pnpm test:coverage              # All tests with coverage
pnpm test path/to/specific.test.ts  # Run single test file
pnpm test --watch              # Watch mode (TDD)
pnpm test --ui                 # Interactive UI dashboard

# Database
pnpm db:migrate                # Apply migrations
pnpm db:generate               # Generate Prisma client
pnpm db:seed                   # Seed test data
```

## Code Style Guidelines

### TypeScript & Formatting

- **Target**: ES2022, CommonJS modules
- **Strict mode**: `strict: true` - all flags enabled
- **Format tool**: Prettier (auto-format with `pnpm format`)
- **Linter**: ESLint for code quality
- **Imports**: Use ES6 imports with explicit paths, no barrel exports for circular deps
- **File extensions**: Always include `.js`/`.ts` in relative imports (e.g., `'./lib/db.js'`)

### Naming Conventions

- **Files**: kebab-case for services/controllers (e.g., `auth.service.ts`, `user.controller.ts`)
- **Classes/Interfaces**: PascalCase (e.g., `WorkspaceService`, `CreateWorkspaceDto`)
- **Functions/Variables**: camelCase (e.g., `getUserById`, `tenantContext`)
- **Constants**: SCREAMING_SNAKE_CASE for module-level constants
- **Database tables**: snake_case (e.g., `workspace_members`, `created_at`)
- **GraphQL/API**: Use `Dto` suffix for data transfer objects (e.g., `CreateUserDto`)

### Error Handling

- Always throw descriptive errors with context
- Use custom error classes for domain-specific errors
- Include error messages suitable for logging/debugging
- Example: `throw new Error('Workspace with slug already exists in tenant ${tenantId}')`
- Validate input data early in functions (fail fast)
- Use try-catch only around async operations that may fail

### Type Safety

- **No `any` types** (except unavoidable Prisma/ORM cases, document with `// @ts-expect-error`)
- **Use strict types**: Define interfaces for all DTOs and responses
- **Generics**: Use for reusable service methods
- **Enums**: Define using `as const` for better type inference (TypeScript best practice)
- **Database types**: Import from `@plexica/database` package

### Testing Standards (CRITICAL - Test-Driven)

**Every feature MUST have tests.** Minimum requirements:

1. **Unit tests**: For all business logic and services
2. **Integration tests**: For API endpoints and database operations
3. **E2E tests**: For critical user workflows

**Test structure:**

```typescript
describe('ServiceName.methodName', () => {
  it('should [expected behavior] when [condition]', async () => {
    // Arrange
    const input = {
      /* test data */
    };

    // Act
    const result = await service.method(input);

    // Assert
    expect(result).toBe(expectedValue);
  });
});
```

**Coverage thresholds (enforced by CI):**

- Overall: ≥80%
- Auth/Tenant/Workspace modules: ≥85%
- New features: ≥80% minimum

### Testing Configuration

- **Framework**: Vitest (modern, fast Jest alternative)
- **Unit tests**: `src/__tests__/**/unit/**/*.test.ts` or `*.unit.test.ts`
- **Integration tests**: `src/__tests__/**/integration/**/*.test.ts` or `*.integration.test.ts`
- **E2E tests**: `src/__tests__/**/e2e/**/*.test.ts` or `*.e2e.test.ts`
- **Config files**: `test/vitest.config.*.ts` (separate configs for each type)
- **Timeouts**: 5s for unit, 15s for integration/E2E
- **Setup files**: `src/__tests__/setup/` for test utilities and mocks

## Repository Structure

```
plexica/
├── apps/core-api/                    # Main backend application
│   ├── src/
│   │   ├── modules/                  # Feature modules
│   │   ├── services/                 # Shared services
│   │   ├── middleware/               # Request middleware
│   │   ├── lib/                      # Utilities and helpers
│   │   ├── __tests__/                # Test suite (~870 tests)
│   │   │   ├── setup/                # Test utilities and setup
│   │   │   ├── auth/                 # Auth module tests
│   │   │   ├── tenant/               # Tenant module tests
│   │   │   ├── workspace/            # Workspace module tests
│   │   │   ├── plugin/               # Plugin module tests
│   │   │   └── unit/integration/e2e/ # Test organization
│   │   └── index.ts                  # Entry point
│   ├── test/                         # Vitest configurations
│   └── package.json                  # Scripts and deps
├── packages/
│   ├── database/                     # Prisma schema and migrations
│   └── event-bus/                    # Event system
├── specs/                            # Technical specifications
├── planning/                         # Project planning documents
└── test-infrastructure/              # Docker and test utilities
```

## Documentation Standards

- **Language**: English only (US spelling)
- **Format**: Markdown (.md)
- **Terminology**: Use `tenant`, `plugin`, `multi-tenancy`, `core-api`, not alternatives
- **Code examples**: Include language identifier (typescript, bash, sql, etc.)
- **File paths**: Include as comments in code blocks

## CI/CD Integration

All pull requests must pass automated checks:

- ✅ All tests pass (unit, integration, E2E)
- ✅ Coverage meets thresholds
- ✅ No coverage decrease
- ✅ Linting passes
- ✅ TypeScript compilation succeeds

See `.github/workflows/` for pipeline details.

## Common Patterns & Best Practices

### Service Implementation

```typescript
// File: src/modules/auth/auth.service.ts
import { PrismaClient } from '@plexica/database';
import { db } from '../../lib/db.js';

export class AuthService {
  private db: PrismaClient;

  constructor() {
    this.db = db;
  }

  async authenticate(email: string, password: string) {
    // Implementation
  }
}
```

### Running Tests Effectively

```bash
# Run tests and watch for changes (TDD workflow)
pnpm test --watch

# Run single test file
pnpm test src/__tests__/auth/unit/auth.service.test.ts

# Run tests matching pattern
pnpm test --grep "should create tenant"

# Generate HTML coverage report
pnpm test:coverage
# Open coverage/index.html in browser

# Run tests in UI (visual dashboard)
pnpm test --ui
```

### Common Mistakes to Avoid

- ❌ No tests for new features (MANDATORY - will be rejected)
- ❌ Not using explicit file extensions in imports (use `./lib/db.js` not `./lib/db`)
- ❌ Using `any` type without justification
- ❌ Database calls outside of tests without transaction rollback
- ❌ Skipping error case testing
- ❌ Tests that depend on execution order
- ❌ Not cleaning up test data after execution

### Security Best Practices

**🔒 CRITICAL: Always follow security guidelines in [docs/SECURITY.md](docs/SECURITY.md)**

**SQL Injection Prevention (MANDATORY):**

```typescript
// ❌ NEVER: String interpolation in SQL
await db.$queryRawUnsafe(`SELECT * FROM users WHERE email = '${email}'`);

// ✅ ALWAYS: Use parameterized queries
await db.$queryRaw`SELECT * FROM users WHERE email = ${email}`;
```

**Key Security Rules:**

- ✅ **Always use parameterized queries** - never concatenate user input into SQL
- ✅ **Validate tenant context** before accessing data
- ✅ **Check user permissions** before sensitive operations
- ✅ **Validate all user input** with Zod schemas
- ✅ **Never commit secrets** - use environment variables
- ✅ **Review [docs/SECURITY.md](docs/SECURITY.md)** before implementing features

### Best Practices

- ✅ Write tests BEFORE code (test-driven development)
- ✅ Run `pnpm test --watch` while developing
- ✅ Keep tests focused and isolated (single responsibility)
- ✅ Use descriptive test names explaining the expected behavior
- ✅ Test both success and failure paths
- ✅ Verify tests pass locally before committing
- ✅ Run full test suite before creating pull request
- ✅ Follow AAA pattern (Arrange, Act, Assert)
- ✅ **Follow security guidelines** in docs/SECURITY.md

## Key Resources

- **Security Guidelines**: 🔒 **[docs/SECURITY.md](docs/SECURITY.md)** - **MANDATORY** security best practices (SQL injection prevention, authentication, multi-tenant security)
- **Full Guidelines**: The longer AGENTS.md sections below contain comprehensive test policy, documentation standards, and development guidelines
- **Project Status**: See `PROJECT_COMPLETE.md` for full project overview (~870 tests implemented)
- **Test Documentation**: `TEST_IMPLEMENTATION_PLAN.md` for testing strategies
- **Quick Start**: `QUICKSTART_GUIDE.md` for 5-10 minute setup

---

## ⚠️ CRITICAL: Test-Driven Development Policy

**MANDATORY RULE**: Every new feature or modification MUST include corresponding tests.

### Test Requirements for All Changes

When implementing ANY new feature or modifying existing code:

1. **Write Tests FIRST** (Test-Driven Development preferred)
   - Write failing tests that define expected behavior
   - Implement the feature to make tests pass
   - Refactor while keeping tests green

2. **Minimum Test Coverage by Type**

   ```
   Unit Tests:        REQUIRED for all business logic
   Integration Tests: REQUIRED for API endpoints and database operations
   E2E Tests:         REQUIRED for critical user workflows
   ```

3. **Coverage Thresholds** (enforced by CI)

   ```
   Overall Project:  ≥80%
   Auth Module:      ≥85%
   Tenant Module:    ≥85%
   Workspace Module: ≥85%
   Plugin Module:    ≥80%
   New Features:     ≥80%
   ```

4. **Test Organization**
   ```
   apps/core-api/src/__tests__/
   └── <module>/
       ├── unit/              # Fast, isolated tests
       ├── integration/       # Database/service integration
       └── e2e/              # Full user scenarios
   ```

### Examples of Required Tests

**Adding a new API endpoint:**

```typescript
// ✅ REQUIRED: Unit test for service logic
describe('UserService.createUser', () => {
  it('should create user with valid data', async () => {
    // Test implementation
  });
});

// ✅ REQUIRED: Integration test for endpoint
describe('POST /api/users', () => {
  it('should create user in database', async () => {
    // Test with real database
  });
});

// ✅ REQUIRED: E2E test for critical flows
describe('User Registration Flow', () => {
  it('should allow new user to register and login', async () => {
    // Full user journey
  });
});
```

**Modifying existing functionality:**

```typescript
// ✅ REQUIRED: Update existing tests
// ✅ REQUIRED: Add new tests for new behavior
// ✅ REQUIRED: Ensure all existing tests still pass
```

### Test Quality Standards

**All tests must:**

- ✅ Have descriptive names explaining what is being tested
- ✅ Follow AAA pattern (Arrange, Act, Assert)
- ✅ Be independent (no test dependencies)
- ✅ Clean up after themselves
- ✅ Use realistic test data
- ✅ Include both success and error cases
- ✅ Test edge cases and boundary conditions

**Example:**

```typescript
describe('TenantService.createTenant', () => {
  // ✅ Good: Descriptive name, clear test
  it('should create tenant with unique slug', async () => {
    // Arrange
    const tenantData = { name: 'Test Corp', slug: 'test-corp' };

    // Act
    const tenant = await service.createTenant(tenantData);

    // Assert
    expect(tenant.slug).toBe('test-corp');
    expect(tenant.status).toBe('ACTIVE');
  });

  // ✅ Good: Tests error case
  it('should throw error for duplicate slug', async () => {
    // Arrange
    await service.createTenant({ name: 'Test', slug: 'test' });

    // Act & Assert
    await expect(service.createTenant({ name: 'Test2', slug: 'test' })).rejects.toThrow(
      'Tenant with slug already exists'
    );
  });
});
```

## Pull Request Policy

**ALL pull requests will be rejected if:**

- ❌ New features/changes lack tests
- ❌ Coverage drops below thresholds (≥80%)
- ❌ Tests don't follow quality standards
- ❌ Existing tests are broken
- ❌ CI pipeline fails (lint, TypeScript, tests)

## Documentation & Terminology

- **Language**: English only (US spelling) - all documents and comments
- **Format**: Markdown (.md), UTF-8, LF line endings
- **Code blocks**: Always include language identifier (typescript, bash, sql, json, etc.)
- **File paths in code**: Include as comments (e.g., `// src/modules/auth/auth.service.ts`)

**Terminology** (maintain consistency):

- Use: `tenant`, `plugin`, `multi-tenancy`, `core-api`, `workspace`
- Not: `customer`/`client`, `module`/`extension`, `api`/`backend`, `shell`

## Notes for AI Agents

**Critical rules:**

- ✅ **Security first**: Follow [docs/SECURITY.md](docs/SECURITY.md) - use parameterized queries, validate input, check permissions
- ✅ **Test-first development**: Write tests BEFORE code (failing tests → implementation)
- ✅ **Three test types**: Unit, integration, and E2E tests as appropriate
- ✅ **Coverage**: Maintain ≥80% overall, ≥85% in core modules (auth, tenant, workspace)
- ✅ **CI must pass**: All tests, linting, TypeScript compilation, coverage thresholds
- ✅ **Update docs**: Whenever code changes, update relevant documentation
- ✅ **Use explicit imports**: Always include file extensions (`.js`/`.ts` in paths)

**Common mistakes to avoid:**

- ❌ **SQL injection vulnerabilities** (string interpolation in queries)
- ❌ No tests for new features (automatic PR rejection)
- ❌ Using `any` type without strong justification
- ❌ Tests that depend on execution order
- ❌ Not cleaning up test data
- ❌ Missing error case testing
- ❌ Documentation out of sync with code
- ❌ Skipping security review ([docs/SECURITY.md](docs/SECURITY.md))

---

## Resources

- **Security Guidelines**: 🔒 **[docs/SECURITY.md](docs/SECURITY.md)** - SQL injection prevention, authentication, authorization, multi-tenant security
- **Project Status**: `PROJECT_COMPLETE.md` (~870 tests implemented)
- **Test Strategy**: `TEST_IMPLEMENTATION_PLAN.md`
- **Specifications**: `specs/FUNCTIONAL_SPECIFICATIONS.md`, `specs/TECHNICAL_SPECIFICATIONS.md`
- **CI/CD**: `.github/workflows/` and `.github/docs/CI_CD_DOCUMENTATION.md`
- **Planning**: `planning/MILESTONES.md`, `planning/ROADMAP.md`, `planning/DECISIONS.md`

_Plexica Development Guidelines v3.0_  
_Last updated: February 2025_  
_Optimized for Agentic Coding_
