# Agent Guidelines for Plexica

This repository contains the functional and technical specifications for the Plexica platform. These guidelines help AI coding agents work effectively with this documentation and codebase.

## 🎉 Project Status Update (January 2025)

**The Plexica test implementation project is now 100% complete!**

All 7 phases of comprehensive test infrastructure have been implemented:

- ✅ **Phase 1**: Infrastructure base with Docker services
- ✅ **Phase 2**: Auth module tests (100+ tests)
- ✅ **Phase 3**: Tenant module tests (226 tests)
- ✅ **Phase 4**: Workspace module tests (255 tests)
- ✅ **Phase 5**: Plugin module tests (~290 tests)
- ✅ **Phase 6**: CI/CD pipeline with GitHub Actions
- ✅ **Phase 7**: Quickstart data & automated setup

**Total delivered:**

- ~870 comprehensive tests (unit/integration/e2e)
- Automated CI/CD pipeline with quality gates
- Professional quickstart experience (5-10 min setup)
- Extensive documentation (10+ documents)

See `PROJECT_COMPLETE.md` for full details.

## Repository Structure

```
plexica/
├── README.md                      # Overview and navigation
├── AGENTS.md                      # This file
├── PROJECT_COMPLETE.md            # 🆕 Project completion summary
├── QUICKSTART_GUIDE.md            # 🆕 Quick setup guide (5-10 min)
├── TEST_IMPLEMENTATION_PLAN.md    # 🆕 Test strategy overview
│
├── specs/                         # Core specifications
│   ├── FUNCTIONAL_SPECIFICATIONS.md
│   ├── TECHNICAL_SPECIFICATIONS.md
│   ├── PROJECT_STRUCTURE.md
│   └── PLUGIN_STRATEGY.md
│
├── planning/                      # Project planning and tracking
│   ├── ROADMAP.md                 # Phase roadmap and timeline
│   ├── DEVELOPMENT_PLAN.md        # Detailed MVP development plan
│   ├── MILESTONES.md              # Milestone tracking
│   ├── DECISIONS.md               # Architectural Decision Records (ADR)
│   └── tasks/
│       └── phase-1-mvp.md         # Granular task breakdown
│
├── apps/core-api/                 # Backend API
│   └── src/__tests__/             # 🆕 45 test files (~870 tests)
│       ├── auth/                  # Auth module (11 files, 100+ tests)
│       ├── tenant/                # Tenant module (10 files, 226 tests)
│       ├── workspace/             # Workspace module (11 files, 255 tests)
│       ├── plugin/                # Plugin module (13 files, ~290 tests)
│       └── setup/                 # Test configurations
│
├── test-infrastructure/           # 🆕 Test infrastructure
│   ├── docker/                    # Docker services (Postgres, Redis, etc.)
│   ├── helpers/                   # Test utilities
│   └── scripts/                   # Setup/teardown scripts
│
├── scripts/
│   └── quickstart-setup.sh        # 🆕 One-command setup
│
├── .github/
│   ├── workflows/                 # 🆕 CI/CD pipelines
│   │   ├── ci-tests.yml           # Main test workflow
│   │   └── coverage.yml           # Coverage reporting
│   └── docs/
│       └── CI_CD_DOCUMENTATION.md # 🆕 CI/CD guide
│
├── PHASE_*_COMPLETE.md            # 🆕 Phase completion reports (7 files)
├── changelog/                     # Version history
│   └── CHANGELOG.md
│
└── templates/                     # Document templates (future)
```

### Document Types

**Specifications (`specs/`)**: Authoritative technical and functional documentation

- These define WHAT the system should do and HOW it should work
- Changes require careful review as they impact implementation

**Planning (`planning/`)**: Project management and decision tracking

- Roadmaps, timelines, task breakdowns
- Living documents that evolve as project progresses
- Should be updated as milestones are completed

**Tests (`apps/core-api/src/__tests__/`)**: Comprehensive test suite

- Unit tests: Fast, isolated component tests
- Integration tests: Database and service integration
- E2E tests: Full stack user scenarios
- **~870 tests** with 80-85% coverage targets

**Test Infrastructure (`test-infrastructure/`)**: Testing utilities

- Docker services configuration
- Test helpers and utilities
- Setup/teardown scripts

**Changelog (`changelog/`)**: Historical record of changes

- Updated when significant features/versions are released

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

### CI/CD Integration

**Automated checks (cannot be bypassed):**

- ✅ All tests must pass before merge
- ✅ Coverage must meet thresholds
- ✅ No decrease in overall coverage
- ✅ Linting must pass
- ✅ TypeScript compilation must succeed

See `.github/workflows/ci-tests.yml` for pipeline details.

### Getting Started with Tests

**Quick reference:**

```bash
# Run all tests
pnpm test

# Run tests by category
pnpm test:unit
pnpm test:integration
pnpm test:e2e

# Run with coverage
pnpm test:coverage

# Run specific test file
pnpm test path/to/test.test.ts

# Watch mode (for TDD)
pnpm test:watch
```

**Documentation:**

- Overall strategy: `TEST_IMPLEMENTATION_PLAN.md`
- Quick reference: `PHASE_5_QUICK_REFERENCE.md`
- CI/CD guide: `.github/docs/CI_CD_DOCUMENTATION.md`

### Consequences of Not Writing Tests

**Pull requests will be rejected if:**

- ❌ New features lack tests
- ❌ Coverage drops below thresholds
- ❌ Tests don't follow quality standards
- ❌ Existing tests are broken

**Remember:** Tests are not optional. They are a core part of the codebase and essential for:

- Preventing regressions
- Documenting behavior
- Enabling refactoring
- Ensuring quality
- Building confidence

---

## Documentation Standards

### Language Policy

**IMPORTANT**: All documentation in this repository MUST be written in **English only**.

- ✅ **English**: Required for all documents (specs, planning, changelog, templates, comments)
- ❌ **Italian or other languages**: Not permitted (except for specific business terms if necessary)
- **Rationale**: English ensures accessibility for international teams, easier collaboration, and industry-standard practices

**Note**: Previous versions of this documentation used Italian. All documents have been translated to English as of January 2025.

### File Format

- **Format**: Markdown (.md)
- **Encoding**: UTF-8
- **Line endings**: LF (Unix-style)
- **Max line length**: No hard limit, but aim for readability (~120 chars)

### Writing Style

**Language**: English (US spelling preferred)

**Tone**:

- Clear and concise
- Technical but accessible
- Use bullet points for lists
- Use tables for structured data

**Formatting**:

```markdown
# H1: Main sections (##, ###, etc. for subsections)

- Use `-` for unordered lists
- Use `1.` for ordered lists
- Use **bold** for emphasis
- Use `code` for technical terms
- Use triple backticks for code blocks with language identifier
```

### Code Examples

Always include language identifier in code blocks:

````typescript
// ✅ Good
```typescript
interface Example {
  id: string;
}
````

// ❌ Bad

```
interface Example {
  id: string;
}
```

```

Supported languages: `typescript`, `javascript`, `python`, `sql`, `yaml`, `bash`, `json`

### Technical Specifications Format

**Architecture Diagrams**: Use ASCII art for simple diagrams
```

┌─────────────┐
│ Service │
└─────────────┘
↓
┌─────────────┐
│ Database │
└─────────────┘

````

**Configuration Examples**: Always include:
- File path as comment
- Complete, working examples
- Explanation of key parameters

**Code Snippets**: Must include:
- File path in comment (e.g., `// src/modules/auth/auth.service.ts`)
- Correct TypeScript syntax (Python deferred to future phases)
- Meaningful variable names
- Brief inline comments for complex logic

**Note on Python**: Python support has been deferred to Phase 5+. All MVP documentation (Phases 1-4) should reference TypeScript only.

### Naming Conventions

**Files**: Use SCREAMING_SNAKE_CASE for top-level docs
- ✅ `FUNCTIONAL_SPECIFICATIONS.md`
- ❌ `functional-specifications.md`

**Headings**: Use Title Case for main sections, Sentence case for subsections
- ✅ `## 2. Database Architecture`
- ✅ `### 2.1.1 Isolation strategy`

**Technical Terms**: Maintain consistency
- Use `tenant` (not `customer`, `client`, `organization`)
- Use `plugin` (not `module`, `extension`, `add-on`)
- Use `multi-tenancy` (with hyphen)
- Use `web` for frontend app (not `shell`, which was renamed)
- Use `core-api` for backend service (not just `api` or `backend`)
- Use `TypeScript` (not `TS` in formal docs)

### Tables

Use consistent table formatting:
```markdown
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Value 1  | Value 2  | Value 3  |
````

Align pipes for better readability in source.

## Editing Guidelines

### When Adding New Sections

1. **Check consistency**: Ensure terminology matches existing content
2. **Update table of contents**: If document has ToC, update it
3. **Cross-reference**: Link to related sections when relevant (use relative paths)
4. **Version info**: Update "Ultimo aggiornamento" at document end
5. **Update README.md**: Add links to new documents in main navigation

### When Modifying Existing Content

1. **Preserve structure**: Don't change numbering unless reorganizing
2. **Maintain examples**: Ensure code examples still work with changes
3. **Update dependencies**: If changing architecture, update related sections
4. **Check references**: Update all sections that reference modified content

### When Adding Code Examples

**TypeScript/JavaScript**:

- Use ES6+ syntax
- Include type annotations
- Use async/await (not callbacks)
- Follow decorators pattern for services/controllers

**Python** (Phase 5+ only):

- Use type hints
- Follow PEP 8
- Use async/await for async operations
- **Note**: Python examples should only appear in future-phase planning docs

**SQL**:

- Uppercase keywords: `SELECT`, `FROM`, `WHERE`
- Include schema name when relevant
- Add comments for complex queries

**YAML**:

- Use 2-space indentation
- Include comments for non-obvious config

## Common Patterns

### Service Example Template

```typescript
// File: apps/core-api/src/modules/<module>/<module>.service.ts

@Injectable()
export class ExampleService {
  constructor(
    private readonly dependency: DependencyService,
    @Inject('CONFIG') private config: Config
  ) {}

  async methodName(param: Type): Promise<ReturnType> {
    // Implementation
  }
}
```

**Note**: This path references the monorepo structure described in `specs/PROJECT_STRUCTURE.md`

### Database Schema Template

```prisma
// File: packages/database/prisma/schema.prisma

model EntityName {
  id        String   @id @default(uuid())
  field     String
  createdAt DateTime @default(now()) @map("created_at")

  @@map("entity_names")
  @@schema("schema_name")
}
```

**Note**: This path references the monorepo structure described in `specs/PROJECT_STRUCTURE.md`

## Quality Checklist

Before finalizing changes:

**Code Quality:**

- [ ] All code blocks have language identifiers
- [ ] File paths are included in code comments
- [ ] Technical terms are consistent throughout
- [ ] Examples are complete and correct
- [ ] Document structure follows existing pattern
- [ ] Version/date updated if significant changes

**Test Quality:** ⚠️ **CRITICAL**

- [ ] **Unit tests** written for all business logic
- [ ] **Integration tests** written for API endpoints and database operations
- [ ] **E2E tests** written for critical user workflows
- [ ] All tests follow AAA pattern (Arrange, Act, Assert)
- [ ] Tests have descriptive names
- [ ] Both success and error cases covered
- [ ] Edge cases and boundary conditions tested
- [ ] Test coverage meets thresholds (≥80%)
- [ ] All existing tests still pass
- [ ] No decrease in overall coverage

**Documentation:**

- [ ] Tables are properly formatted
- [ ] Cross-references are valid
- [ ] All text is in English (no Italian or other languages)

**CI/CD:**

- [ ] Tests pass locally before commit
- [ ] Linting passes
- [ ] TypeScript compilation succeeds
- [ ] Coverage report generated and reviewed

## Working with Planning Documents

### Before Starting Development

When beginning work on a milestone or task:

1. **Check current status**: Read `planning/MILESTONES.md` to understand current phase/milestone
2. **Review decisions**: Check `planning/DECISIONS.md` for architectural decisions (ADRs)
3. **Understand roadmap**: Read `planning/ROADMAP.md` for timeline and dependencies
4. **Task breakdown**: Use `planning/tasks/phase-X-*.md` for granular task lists

### During Development

1. **Update milestone status**: Mark tasks as in-progress/completed in `planning/MILESTONES.md`
2. **Document decisions**: Add new ADRs to `planning/DECISIONS.md` when making architectural choices
3. **Track blockers**: Update `planning/MILESTONES.md` with any blockers or risks
4. **Update task lists**: Check off completed tasks in `planning/tasks/` files
5. **Write tests**: ⚠️ **MANDATORY** - Write tests alongside code (see Test-Driven Development Policy above)

### After Completing Features

1. **Verify tests pass**: Ensure all tests pass locally and in CI
2. **Check coverage**: Verify coverage meets thresholds (≥80%)
3. **Update changelog**: Add entry to `changelog/CHANGELOG.md` with version and changes
4. **Review specs**: Ensure `specs/` documents reflect any implementation changes
5. **Update README**: Add any new documentation or navigation links
6. **Update test documentation**: If adding new test patterns, update `TEST_IMPLEMENTATION_PLAN.md`
7. **⚠️ UPDATE DOCUMENTATION** (MANDATORY): Update all relevant documentation to reflect changes made:
   - Update technical documentation in `docs/` if architecture or design changed
   - Update `test-infrastructure/README.md` if test infrastructure was modified
   - Update API documentation if endpoints were added/modified
   - Update configuration examples if new services or settings were added
   - Ensure all code examples in documentation are up-to-date
   - Update diagrams and schemas if data models changed

## Notes for AI Agents

### General Guidelines

- **Be cautious with edits**: These are reference documents; accuracy is critical
- **Maintain consistency**: Don't introduce new terminology without reason
- **Ask before major restructuring**: Large changes need human review
- **Preserve formatting**: Existing structure is intentional
- **Consider impact**: Changes may affect implementation teams
- **Use relative paths**: When cross-referencing, use `specs/`, `planning/`, etc.
- **Update planning docs proactively**: Keep milestone and task tracking current

### Test-First Development ⚠️ **CRITICAL**

- **Never skip tests**: Every feature and modification MUST include tests
- **Test before code**: Prefer TDD approach (write failing tests first)
- **Three levels**: Write unit, integration, and E2E tests as appropriate
- **Coverage matters**: Maintain ≥80% coverage, aim for ≥85% in core modules
- **Quality over quantity**: Well-written tests that catch bugs are better than many shallow tests
- **Document test patterns**: If introducing new testing approaches, document them

### Common Mistakes to Avoid

- ❌ Implementing features without writing tests
- ❌ Writing tests after PR is submitted
- ❌ Skipping integration or E2E tests
- ❌ Not testing error cases
- ❌ Ignoring coverage reports
- ❌ Breaking existing tests without fixing them
- ❌ Writing tests that depend on each other
- ❌ Not cleaning up test data

### Best Practices

- ✅ Write tests in TDD style (test → code → refactor)
- ✅ Run tests frequently during development
- ✅ Keep tests fast and focused
- ✅ Use descriptive test names
- ✅ Follow existing test patterns in the codebase
- ✅ Test both happy paths and error cases
- ✅ Verify tests in CI before merging
- ✅ Update test documentation when needed
- ✅ **Update all relevant documentation after completing any task**
- ✅ **Keep documentation in sync with code changes**
- ✅ **Document new patterns, services, or configurations immediately**

## Version Control

**Date Format**: `DD MMM YYYY` (e.g., "13 Jan 2025")

**Version Format**:

- Major version for complete rewrites
- Minor version for new sections
- Patch for corrections/clarifications

Current version indicators at document end:

```markdown
---

_Plexica Development Guidelines v2.0_  
_Last updated: January 2025_  
_Project Status: Test Infrastructure Complete (100%)_
```

---

## Quick Reference Links

### Essential Documentation

- **Getting Started**: `QUICKSTART_GUIDE.md` - 5-10 minute setup
- **Project Status**: `PROJECT_COMPLETE.md` - Full project summary
- **Test Strategy**: `TEST_IMPLEMENTATION_PLAN.md` - Testing approach

### Test Documentation

- **Phase Reports**: `PHASE_2_COMPLETE.md` through `PHASE_7_COMPLETE.md`
- **Quick Reference**: `PHASE_5_QUICK_REFERENCE.md` - Plugin testing patterns
- **CI/CD Guide**: `.github/docs/CI_CD_DOCUMENTATION.md`

### Specifications

- **Functional Specs**: `specs/FUNCTIONAL_SPECIFICATIONS.md`
- **Technical Specs**: `specs/TECHNICAL_SPECIFICATIONS.md`
- **Plugin Strategy**: `specs/PLUGIN_STRATEGY.md`

### Development

- **Roadmap**: `planning/ROADMAP.md`
- **Milestones**: `planning/MILESTONES.md`
- **Decisions (ADR)**: `planning/DECISIONS.md`

---

_Plexica Development Guidelines v2.0_  
_Last updated: 31 January 2025_  
_Project Status: Test Infrastructure Complete (100%)_
