# Agent Guidelines for Plexica

This file provides essential guidelines for AI coding agents working in the Plexica repository, including build/test commands, code style, and best practices.

---

## FORGE Governance

This project uses the **FORGE methodology** (Framework for Orchestrated Requirements, Governance & Engineering) for all structured AI-assisted development. Every implementation, review, and architectural decision must follow FORGE conventions.

### Constitution

All architectural and design decisions must comply with the project constitution at [`.forge/constitution.md`](.forge/constitution.md). The constitution defines non-negotiable principles for:

- Technology choices and dependency policy (Article 2)
- Architecture patterns — microservices, layered architecture, DDD (Article 3)
- Code quality and test coverage thresholds (Article 4)
- Security — tenant isolation, RBAC, parameterized queries, input validation (Article 5)
- Error handling, logging standards (Article 6)
- Naming and API conventions (Articles 7–8)
- Operational requirements — zero-downtime deployments, monitoring, alerting (Article 9)

> **Before any implementation, review the constitution to ensure compliance.**

### Knowledge Base

Before making architectural decisions, always check existing decisions:

| Location                              | Contents                                                           |
| ------------------------------------- | ------------------------------------------------------------------ |
| `.forge/knowledge/adr/`               | Formal Architectural Decision Records (ADR-001 through ADR-030)    |
| `.forge/knowledge/decision-log.md`    | Session-level decisions and active technical debt (TD-xxx, DD-xxx) |
| `.forge/knowledge/lessons-learned.md` | Past mistakes, insights, and anti-patterns to avoid                |

**ADRs in force cover** (among others): monorepo strategy (ADR-001), multi-tenancy schema (ADR-002), plugin lifecycle (ADR-018/019), Module Federation (ADR-004/011), event system (ADR-005), Fastify (ADR-006), Prisma (ADR-007), font hosting (ADR-020), ABAC engine (ADR-017), team-member roles vs Keycloak (ADR-024), audit logs placement (ADR-025), SSE notifications (ADR-023), and the full observability stack (ADR-026–030).

> Any new dependency or technology change requires an ADR **before** implementation (Constitution Art. 2.2).

### Spec-Code Traceability

Every implementation **must** trace back to a spec or story. Unspecified changes are only permitted in the **Hotfix track**.

| Artifact     | Location                                | Purpose                                       |
| ------------ | --------------------------------------- | --------------------------------------------- |
| Feature spec | `.forge/specs/NNN-slug/spec.md`         | Requirements and acceptance criteria          |
| Plan         | `.forge/specs/NNN-slug/plan.md`         | Architecture decisions and task breakdown     |
| Tasks        | `.forge/specs/NNN-slug/tasks.md`        | Implementation tracking (check off as you go) |
| Design spec  | `.forge/specs/NNN-slug/design-spec.md`  | UX wireframes and component specs             |
| User journey | `.forge/specs/NNN-slug/user-journey.md` | User flows and personas                       |
| Sprint files | `.forge/sprints/active/`                | Active sprint story tracking                  |

All 12 specs (001–012) are complete. New work must start with `/forge-specify` to create a new spec.

### Review Standards

All code changes go through a **mandatory dual-review process**:

1. **AI adversarial review** — run `/forge-review` before human review. Invokes both `forge-reviewer` (Claude) and `forge-reviewer-codex` (GPT-Codex) in parallel across 7 dimensions: correctness, security, performance, maintainability, test-spec coherence, UX quality, and constitution compliance.
2. **Human review** — a team member reviews the code and the AI review findings. All HIGH-severity findings must be resolved before merge.

> **PRs that skip `/forge-review` will be rejected.** This rule cannot be bypassed without explicit team confirmation.

### FORGE Commands

| Command            | Purpose                                                    | Track    |
| ------------------ | ---------------------------------------------------------- | -------- |
| `/forge-specify`   | Create or update a feature spec                            | Feature+ |
| `/forge-plan`      | Generate implementation plan + ADRs                        | Feature+ |
| `/forge-tasks`     | Break plan into sprint tasks                               | Feature+ |
| `/forge-implement` | Implement tasks (auto-chains `/forge-review`)              | All      |
| `/forge-review`    | Dual-model adversarial code review                         | All      |
| `/forge-test`      | Generate and validate test strategy                        | All      |
| `/forge-hotfix`    | Single-file emergency fix (auto-chains `/forge-review`)    | Hotfix   |
| `/forge-quick`     | Lightweight feature ≤5 tasks (auto-chains `/forge-review`) | Quick    |
| `/forge-adr`       | Create a formal Architectural Decision Record              | Any      |
| `/forge-analyze`   | Validate spec/plan consistency before implementation       | Feature+ |
| `/forge-sprint`    | Plan or update a sprint                                    | Epic+    |
| `/forge-status`    | Show current sprint dashboard                              | Any      |

---

## Quick Start - Essential Commands

```bash
# Setup and development
pnpm install                    # Install dependencies
pnpm dev                        # Start development servers (all packages)
pnpm build                      # Build all packages
pnpm lint                       # Run linting across all packages
pnpm format                     # Format code with Prettier
```

## Current Test Status

**For current test statistics and coverage details, see [docs/TESTING.md](docs/TESTING.md#test-suite-overview)**

Quick summary:

- 2,200+ total tests (backend + i18n + observability)
- ≥80% overall coverage ✅ (TD-001 resolved in Sprint 009)
- i18n system: 95%+ average coverage ✅
- 100% pass rate when infrastructure running

## Quick Test Commands

```bash
cd apps/core-api

# Run ALL tests (~3-5 min)
pnpm test

# By test type
pnpm test:unit                  # Unit tests only (~30s)
pnpm test:integration           # Integration tests (~90s)
pnpm test:e2e                   # E2E tests (~2 min)

# Coverage report
pnpm test:coverage

# Watch mode (for TDD development)
pnpm test --watch

# Interactive UI dashboard
pnpm test --ui

# Single test file
pnpm test path/to/specific.test.ts

# Specific module
pnpm test -- auth/              # Auth module only
pnpm test -- tenant/            # Tenant module only
pnpm test -- workspace/         # Workspace module only
pnpm test -- plugin/            # Plugin module only
```

## Test Infrastructure Setup

```bash
# Start test services (PostgreSQL, Keycloak, Redis, MinIO)
cd test-infrastructure
./scripts/test-setup.sh

# Check services are running
./scripts/test-check.sh

# Reset test data between runs
./scripts/test-reset.sh

# Stop services
./scripts/test-teardown.sh
```

## Database Operations

```bash
pnpm db:migrate                # Apply migrations
pnpm db:generate               # Generate Prisma client
pnpm db:seed                   # Seed test data
```

## Testing Resources

- **Quick Start**: [`docs/TESTING.md`](docs/TESTING.md)
- **Backend Testing**: [`docs/testing/BACKEND_TESTING.md`](docs/testing/BACKEND_TESTING.md)
- **Coverage Improvement Plan**: [`specs/TEST_COVERAGE_IMPROVEMENT_PLAN.md`](specs/TEST_COVERAGE_IMPROVEMENT_PLAN.md)
- **Test Directory**: [`apps/core-api/src/__tests__/README.md`](apps/core-api/src/__tests__/README.md)

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
- **REST API**: Use `Dto` suffix for data transfer objects (e.g., `CreateUserDto`)

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
├── apps/
│   ├── core-api/                     # Main backend application
│   │   ├── src/
│   │   │   ├── modules/              # Feature modules
│   │   │   ├── services/             # Shared services
│   │   │   ├── middleware/           # Request middleware
│   │   │   ├── lib/                  # Utilities and helpers
│   │   │   ├── __tests__/            # Test suite (2,200+ tests)
│   │   │   │   ├── setup/            # Test utilities and setup
│   │   │   │   ├── auth/             # Auth module tests
│   │   │   │   ├── authorization/    # Authorization tests
│   │   │   │   ├── tenant/           # Tenant module tests
│   │   │   │   ├── workspace/        # Workspace module tests
│   │   │   │   ├── plugin/           # Plugin module tests
│   │   │   │   ├── i18n/             # i18n module tests
│   │   │   │   ├── observability/    # Observability tests
│   │   │   │   ├── services/         # Shared service tests
│   │   │   │   └── unit/integration/e2e/ # Test organization
│   │   │   └── index.ts              # Entry point
│   │   ├── test/                     # Vitest configurations
│   │   └── package.json              # Scripts and deps
│   ├── web/                          # Tenant-facing frontend (React + Vite)
│   ├── super-admin/                  # Super-admin frontend
│   ├── plugin-analytics/             # Analytics plugin app
│   ├── plugin-crm/                   # CRM plugin app
│   └── plugins/                      # Shared plugin utilities
├── packages/
│   ├── database/                     # Prisma schema and migrations
│   ├── event-bus/                    # Event system (KafkaJS)
│   ├── i18n/                         # i18n package (@plexica/i18n)
│   ├── ui/                           # Shared UI components (@plexica/ui)
│   ├── sdk/                          # Plugin SDK (@plexica/sdk)
│   ├── api-client/                   # Typed API client
│   ├── types/                        # Shared TypeScript types
│   ├── config/                       # Shared configuration
│   └── lib/                          # Shared utilities
├── docs/                             # Developer guides and references
├── specs/                            # Functional/technical specifications
├── planning/                         # Project planning and ADRs
├── .forge/                           # FORGE methodology artifacts
│   ├── specs/                        # Feature specs (001–012)
│   ├── knowledge/                    # ADRs and decision log
│   └── sprints/                      # Sprint files
└── test-infrastructure/              # Docker and test utilities
```

## Documentation Standards

- **Language**: English only (US spelling)
- **Format**: Markdown (.md)
- **Terminology**: Use `tenant`, `plugin`, `multi-tenancy`, `core-api`, not alternatives
- **Code examples**: Include language identifier (typescript, bash, sql, etc.)
- **File paths**: Include as comments in code blocks

## Documentation Management

Comprehensive documentation is critical for maintainability and team knowledge sharing. All documentation changes must accompany related code changes.

### Documentation Structure

The project maintains documentation across three main directories:

| Directory     | Purpose                                                            | Target Audience          | Update Frequency    |
| ------------- | ------------------------------------------------------------------ | ------------------------ | ------------------- |
| **specs/**    | Functional & technical specifications, architecture, system design | Developers, Architects   | When design changes |
| **docs/**     | Developer guides, setup, security, contribution guidelines         | Developers, Contributors | With code changes   |
| **planning/** | Roadmap, milestones, architectural decisions (ADRs)                | Team, Stakeholders       | When decisions made |

### General Documentation Guidelines

**File Structure**:

- Use clear, hierarchical headings (H2 for sections, H3 for subsections)
- Include a Table of Contents for documents >2000 lines
- Add metadata at the top (Date, Status, Author/Team when relevant)
- Use consistent formatting: tables, code blocks with language identifiers, bullet lists

**Content Standards**:

- **Language**: English (US spelling only)
- **Audience**: Assume readers are technical developers or architects
- **Length**: Keep documents focused; split long docs into related files
- **Links**: Use relative paths for internal references (e.g., `[Security Guidelines](../docs/SECURITY.md)`)
- **Code examples**: Always include language identifier and file path comment
- **Terminology**: Maintain consistency with project vocab (see [Terminology](#terminology))

**Correct Code Example Format**:

```typescript
// File: src/modules/auth/auth.service.ts
export class AuthService {
  async authenticate(email: string, password: string) {
    // Implementation with clear purpose
  }
}
```

```bash
# Database setup example
pnpm db:migrate
pnpm db:seed
```

### When to Update Documentation

**Update `specs/` when:**

- Architecture or design changes significantly
- New system components are added
- Technology stack decisions change
- Technical specifications are clarified or expanded

**Update `docs/` when:**

- Code features are added or modified (even for internal services)
- Setup procedures or configuration changes
- Security best practices are updated or refined
- Contribution guidelines need updates
- New guides or tutorials are added

**Update `planning/` when:**

- Significant architectural decisions are made (create new ADR)
- Project roadmap or milestones change
- Previous decisions become deprecated or superseded
- Major strategic shifts occur
- **⭐ CRITICAL: Any milestone is completed or a new milestone is started** → Update `planning/PROJECT_STATUS.md` immediately

### ⭐ Project Status Update Directive

**Every time you plan or complete work:**

1. **Starting a new milestone/task**: Update `planning/PROJECT_STATUS.md`
   - Change milestone status from "⚪ Not Started" to "🟡 In Progress"
   - Update "Current Milestone" field at the top
   - Add start date to the milestone record
   - Update overall phase progress percentage

2. **Completing a milestone/task**: Update `planning/PROJECT_STATUS.md`
   - Change milestone status to "✅ Completed"
   - Add completion date
   - Update phase progress percentage
   - Create new section under "Completed" milestones
   - Update "Last Updated" field with today's date
   - Update "Current Milestone" to next pending milestone
   - Update version if major milestone completed

3. **Consistency Check Before Committing**:
   - Run: `grep "Last Updated\|Version\|Current Phase\|Current Milestone" planning/PROJECT_STATUS.md README.md`
   - Ensure dates, versions, and milestone names match across both files
   - All file dates should be current (same day)
   - Version should match README.md

**Example workflow:**

```bash
# After completing M2.3
1. Edit planning/PROJECT_STATUS.md:
   - Change M2.3: "🟡 In Progress" → "✅ Completed"
   - Set completion date: "Jan 23, 2026"
   - Change Current Milestone: "M2.3" → "M2.4"
   - Update Version if needed
   - Update Last Updated: "Feb 3, 2026"

2. Verify consistency:
   grep "Last Updated\|Version" planning/PROJECT_STATUS.md README.md

3. Commit with clear message:
   git commit -m "docs: complete M2.3 milestone and update PROJECT_STATUS.md"
```

**Why this matters:**

- ✅ Single source of truth for project status
- ✅ Prevents documentation drift
- ✅ Helps team understand current progress
- ✅ Enables accurate milestone tracking
- ✅ Ensures README and status files stay in sync

**Cross-Reference Rule**: If you modify code, verify related documentation is current:

```bash
# Example: Updated auth service? Check what needs updating:
grep -r "AuthService\|auth.service" docs/ specs/ planning/
```

### Documentation Templates

To maintain consistency across the project, use these templates when creating documentation:

**Technical Specifications** (for `specs/`):

- Template: [`.github/docs/TEMPLATE_TECHNICAL_SPECIFICATION.md`](.github/docs/TEMPLATE_TECHNICAL_SPECIFICATION.md)
- Use for: System design, architecture details, technical implementation
- Includes: Components, tech stack, implementation details, testing strategy

**Architectural Decision Records** (for `planning/DECISIONS.md`):

- Template: [`.github/docs/TEMPLATE_ARCHITECTURAL_DECISION.md`](.github/docs/TEMPLATE_ARCHITECTURAL_DECISION.md)
- Use for: Significant architectural choices, technology selections
- Includes: Context, decision, consequences, alternatives, related decisions

**Developer Guides** (for `docs/`):

- Template: [`.github/docs/TEMPLATE_DEVELOPER_GUIDE.md`](.github/docs/TEMPLATE_DEVELOPER_GUIDE.md)
- Use for: Setup guides, feature tutorials, how-to documentation
- Includes: Quick start, concepts, common tasks, troubleshooting, FAQ

### Deprecating Documentation

Documentation that is no longer accurate must be marked as deprecated to avoid confusion.

**Deprecation Process**:

1. **Add Deprecation Notice** at the top of the document:

```markdown
# [Feature Name] Guide

⚠️ **DEPRECATED** (as of YYYY-MM-DD)

This document is no longer maintained. See [Replacement Document](./NEW_GUIDE.md) instead.

---

[Rest of document...]
```

2. **Update Related Documents** to link to the replacement:

- Search for references to the deprecated doc
- Update all links to point to the replacement
- Add a "See Also" section in related docs

3. **Deprecation Timeline**:

- **Announce**: Update header with deprecation notice
- **Wait**: Keep for 2-4 weeks for team notification
- **Archive**: Move to `.github/docs/deprecated/` directory
- **Clean**: Remove completely after 3 months with no references

4. **Example Deprecation**:

```markdown
# Old Multi-Tenancy Guide

⚠️ **DEPRECATED** (as of 2025-02-01)

This document describes the old multi-tenancy implementation. The system has been redesigned.

**See instead**: [Multi-Tenancy Architecture](./ARCHITECTURE.md#multi-tenancy)

**Migration Guide**: [Migrating from v1 to v2](./MIGRATION_GUIDE.md)

**Questions?** Search [GitHub Issues](https://github.com/plexica/plexica/issues) or ask in [Discussions](https://github.com/plexica/plexica/discussions).

---

## Old Content (For Reference Only)

[Original document content...]
```

5. **Superseded Decisions** (in ADRs):

```markdown
## ADR-003: Old Architecture Choice

**Date**: 2024-01-15  
**Status**: ❌ Superseded by ADR-012  
**Superseded By**: [ADR-012: New Architecture Decision](./DECISIONS.md#adr-012)

### Why Superseded

[Explain what changed and why the old decision no longer applies]

[Rest of ADR...]
```

### Documentation Review Checklist

When creating or updating documentation:

**Content Quality**:

- ✅ Is the metadata (Date, Status, Author) current and accurate?
- ✅ Are all code examples correct, tested, and working?
- ✅ Do all internal links work (use relative paths)?
- ✅ Is terminology consistent with project standards?
- ✅ Are there cross-references to related documents?
- ✅ Is the language clear, concise, and audience-appropriate?

**Formatting & Style**:

- ✅ Is formatting consistent (headings, tables, code blocks)?
- ✅ Does the document follow the appropriate template?
- ✅ Are code blocks labeled with language identifiers?
- ✅ Are file paths included as comments in code examples?

**Completeness**:

- ✅ Does the document cover all necessary aspects?
- ✅ Are deprecated sections clearly marked?
- ✅ Are related documents linked appropriately?
- ✅ Does the Table of Contents match the structure?

### Common Documentation Mistakes

- ❌ Documentation outdated (>3 months old without review)
- ❌ Using terminology inconsistently (e.g., `module` vs `plugin`, `extension` vs `plugin`)
- ❌ Code examples that don't work or are untested
- ❌ Broken internal links or incorrect relative paths
- ❌ Missing language identifiers on code blocks (e.g., ` ```typescript `)
- ❌ No metadata (Date, Status) on specifications or guides
- ❌ Assuming reader knowledge without explaining concepts
- ❌ Leaving outdated docs without deprecation notice
- ❌ Not linking related documentation together
- ❌ Documenting desired behavior instead of actual behavior

### Documentation for AI Agents

**Critical Documentation Requirements**:

- ✅ **Update alongside code**: Always update relevant docs when code changes
- ✅ **Use templates**: Follow the appropriate template from `.github/docs/`
- ✅ **Maintain consistency**: Use approved terminology and style
- ✅ **Include examples**: All technical docs need working code examples
- ✅ **Cross-reference**: Link related documents to help readers navigate
- ✅ **Test your examples**: Verify all code snippets actually work
- ✅ **Mark deprecations**: Clearly indicate outdated content
- ✅ **Update metadata**: Keep Date/Status/Author fields current

## Git Workflow

### Branch Naming

| Type    | Pattern                 | Example                            |
| ------- | ----------------------- | ---------------------------------- |
| Feature | `feat/<spec-id>-<slug>` | `feat/012-observability-dashboard` |
| Fix     | `fix/<spec-id>-<slug>`  | `fix/006-translation-cache`        |
| Hotfix  | `hotfix/<slug>`         | `hotfix/tenant-isolation-leak`     |
| Epic    | `epic/<epic-id>-<slug>` | `epic/E01-plugin-system`           |

### Commit Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`

**Examples:**

```bash
feat(plugin): add lifecycle status transitions
fix(i18n): reject null bytes in translation keys
test(workspace): add contract tests for plugin scoping API
docs(adr): add ADR-031 for new dependency decision
```

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
- **Project Status**: See `planning/PROJECT_STATUS.md` for current sprint and milestone status
- **Full Guidelines**: The longer AGENTS.md sections below contain comprehensive test policy, documentation standards, and development guidelines
- **Test Documentation**: [`docs/TESTING.md`](docs/TESTING.md) for testing guide and current stats
- **Quick Start**: [`docs/QUICKSTART.md`](docs/QUICKSTART.md) for 5-10 minute setup

### Sprint Status

For the full sprint history and current progress, see [`planning/PROJECT_STATUS.md`](planning/PROJECT_STATUS.md).

All 12 specs (001–012) are complete. The project is at version 0.12.0 with ≥80% test coverage and 0 known security vulnerabilities.

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

**Step 1 — FORGE review (MANDATORY)**: Run `/forge-review` before requesting human review.
Both `forge-reviewer` (Claude) and `forge-reviewer-codex` (GPT-Codex) must complete in parallel.
All HIGH-severity findings must be resolved before merge. MEDIUM-severity findings require
documented justification if not fixed. **PRs that skip `/forge-review` will be rejected.**
This rule cannot be bypassed without explicit team confirmation.

**Step 2 — Human review**: At least one team member reviews the code together with the AI
review findings. The PR description must reference the spec ID or story ID
(e.g., `Closes spec 012, task T012-18`).

**ALL pull requests will also be rejected if:**

- ❌ `/forge-review` was not run or HIGH-severity findings are unresolved
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
- **Project Status**: [`planning/PROJECT_STATUS.md`](planning/PROJECT_STATUS.md) — all 12 specs complete, Sprint 009 closed
- **Specifications**: `specs/FUNCTIONAL_SPECIFICATIONS.md`, `specs/TECHNICAL_SPECIFICATIONS.md`
- **CI/CD**: `.github/workflows/` and `.github/docs/CI_CD_DOCUMENTATION.md`
- **Planning**: `planning/MILESTONES.md`, `planning/ROADMAP.md`, `planning/DECISIONS.md`

_Plexica Development Guidelines v3.0_  
_Last updated: March 2026_  
_Optimized for Agentic Coding_
