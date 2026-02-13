# Lessons Learned

> This document captures insights, best practices discovered during
> development, and mistakes to avoid in the future.

**Last Updated**: February 13, 2026

---

## Lessons from Development

### Testing Infrastructure

**Date**: January-February 2026  
**Context**: Test suite implementation (1,855+ tests)

**What Worked Well**:

- ✅ Vitest for modern TypeScript testing (fast, native ESM support)
- ✅ Separate test configs for unit/integration/E2E (clear separation)
- ✅ Docker-based test infrastructure (consistent environment)
- ✅ Test setup scripts (`test-setup.sh`) for reproducible environment

**What Could Be Improved**:

- ⚠️ Test coverage tracking started late (currently 63%, target 80%)
- ⚠️ Some integration tests depend on infrastructure state (flakiness risk)
- ⚠️ Test data cleanup not consistently implemented in early tests

**Recommendations**:

- 📝 Start with test coverage tracking from day one
- 📝 Use test transactions for database isolation (rollback after each test)
- 📝 Implement test factories early for consistent test data

---

### Multi-Tenancy Implementation

**Date**: December 2025 - January 2026  
**Context**: Tenant isolation and row-level security

**What Worked Well**:

- ✅ Tenant context middleware automatically enforces isolation
- ✅ Prisma schema extensions for tenant-scoped queries
- ✅ Keycloak realm-per-tenant strategy for auth isolation

**What Could Be Improved**:

- ⚠️ Initially forgot tenant context in some service methods (caught in review)
- ⚠️ Cross-tenant data leak testing added late

**Recommendations**:

- 📝 Code review checklist: "Does this query include tenant context?"
- 📝 Write security-focused integration tests alongside feature implementation
- 📝 Use `/forge-review` with focus on tenant isolation

---

### Plugin System Architecture

**Date**: November 2025 - January 2026  
**Context**: Plugin isolation and communication

**What Worked Well**:

- ✅ Service registry pattern enables plugin discovery
- ✅ Event bus (KafkaJS) for async plugin-to-core communication
- ✅ MinIO for isolated plugin asset storage

**What Could Be Improved**:

- ⚠️ Plugin dependency resolution added later (should be in initial design)
- ⚠️ Plugin versioning strategy evolved over time

**Recommendations**:

- 📝 Design plugin lifecycle (install, enable, disable, upgrade) upfront
- 📝 Define plugin manifest schema early with versioning built in
- 📝 Document plugin API contracts as OpenAPI specs

---

## Common Mistakes to Avoid

### Security

| Mistake                             | Why It's Bad                | How to Avoid                                                    |
| ----------------------------------- | --------------------------- | --------------------------------------------------------------- |
| String concatenation in SQL queries | SQL injection vulnerability | **Always use parameterized queries** (Constitution Article 5.3) |
| Missing tenant context validation   | Cross-tenant data leak      | Middleware enforces context; review all queries                 |
| PII in logs or error messages       | Privacy violation           | Log sanitization; never log sensitive fields                    |
| Hardcoded secrets in code           | Exposed credentials         | Use environment variables; scan with tools                      |

### Testing

| Mistake                            | Why It's Bad                      | How to Avoid                                    |
| ---------------------------------- | --------------------------------- | ----------------------------------------------- |
| Writing tests after implementation | Lower coverage, missed edge cases | **Test-Driven Development** (write tests first) |
| Shared test state between tests    | Flaky tests, hard to debug        | Independent tests; clean up after each test     |
| Hardcoded UUIDs and timestamps     | Tests break when data changes     | Use factories with randomized data              |
| No E2E tests for critical flows    | User-facing bugs in production    | E2E tests for auth, tenant creation, plugins    |

### Architecture

| Mistake                                 | Why It's Bad                           | How to Avoid                                      |
| --------------------------------------- | -------------------------------------- | ------------------------------------------------- |
| Direct database access from controllers | Tight coupling, hard to test           | Use service layer (Constitution Article 3.3)      |
| Missing API versioning                  | Breaking changes for clients           | All endpoints versioned (`/api/v1/...`)           |
| No pagination on list endpoints         | Performance issues with large datasets | Max 100 items per page (Constitution Article 3.4) |
| Ignoring backward compatibility         | Deployment downtime                    | Feature flags, gradual rollout                    |

---

## Best Practices Discovered

### Code Organization

- ✅ **Feature modules** over technical layers (auth/, tenant/, workspace/ instead of controllers/, services/)
- ✅ **Colocation**: Keep related code together (service, controller, tests in same directory)
- ✅ **Explicit imports**: Always include file extensions (`.js`/`.ts`) for ESM compatibility

### Development Workflow

- ✅ **Test watch mode**: `pnpm test --watch` for TDD (fast feedback loop)
- ✅ **Pre-commit hooks**: Run linting and type-checking automatically
- ✅ **Incremental adoption**: Start with modular monolith, extract microservices later

### Documentation

- ✅ **Code-adjacent docs**: README in each major module explaining purpose
- ✅ **OpenAPI specs**: Auto-generated from Fastify routes (living documentation)
- ✅ **AGENTS.md**: Single source of truth for AI coding agents

---

## Retrospective Themes

### What's Working

1. **FORGE Methodology**: Structured approach to requirements, architecture, and governance
2. **Constitution**: Clear decision framework reduces bikeshedding
3. **Comprehensive Testing**: High test count (1,855+) provides confidence
4. **Strong Security Focus**: Multi-tenancy isolation and auth built in from start

### What Needs Improvement

1. **Test Coverage**: Currently 63%, need to reach 80% target
2. **Documentation**: Some modules lack detailed inline documentation
3. **Performance Monitoring**: Need observability stack (metrics, tracing)

### Action Items

- [ ] Implement test coverage improvement plan (see `specs/TEST_COVERAGE_IMPROVEMENT_PLAN.md`)
- [ ] Add JSDoc comments to all public APIs
- [ ] Set up observability stack (Prometheus, Grafana, Jaeger)
- [ ] Create runbooks for incident response

---

_This document should be updated after each sprint retrospective or when
significant lessons are learned. Use `/forge-retro` to conduct structured
retrospectives._

---

## Related Documents

- [Constitution](../constitution.md) — Non-negotiable project standards referenced in lessons
- [Decision Log](decision-log.md) — Active decisions, technical debt, and deferred decisions
- [ADR Index](adr/README.md) — All 11 architectural decision records
- [ADR-002: Database Multi-Tenancy](adr/adr-002-database-multi-tenancy.md) — Multi-tenancy lessons
- [ADR-005: Event System](adr/adr-005-event-system-redpanda.md) — Plugin event system lessons
- [ADR-007: Prisma ORM](adr/adr-007-prisma-orm.md) — ORM and query safety lessons
- [ADR-008: Playwright E2E](adr/adr-008-playwright-e2e.md) — E2E testing lessons
- [Spec 001: Multi-Tenancy](../specs/001-multi-tenancy/spec.md) — Tenant isolation spec
- [Spec 002: Authentication](../specs/002-authentication/spec.md) — Auth spec
- [Spec 004: Plugin System](../specs/004-plugin-system/spec.md) — Plugin architecture spec
- [Security Architecture](../architecture/security-architecture.md) — Security patterns and anti-patterns
- [System Architecture](../architecture/system-architecture.md) — Overall system design
- [Product Roadmap](../product/roadmap.md) — Phase timeline and milestones
