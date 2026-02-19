# ADR-008: Playwright for Frontend E2E Testing

**Date**: 2026-02-11  
**Status**: Accepted  
**Deciders**: Frontend Team  
**Context**: E2E testing framework selection for frontend applications

## Context and Problem Statement

Plexica's frontend applications (web tenant app, super-admin panel) require comprehensive E2E test coverage to ensure quality as features grow. We need a testing framework that supports TypeScript, provides cross-browser testing, and integrates well with the existing Vitest unit/integration test setup.

## Decision Drivers

- Fast test execution (<200ms per test)
- Excellent TypeScript support (matches project stack)
- Cross-browser testing capability (Chromium, Firefox)
- API mocking support (for isolated frontend testing)
- IDE integration and debugging tools
- Compatibility with CI/CD pipeline (GitHub Actions)

## Considered Options

1. **Playwright** (chosen)
2. **Cypress**
3. **Selenium/WebDriver**
4. **Manual testing only**

## Decision Outcome

**Chosen option**: Playwright — provides the fastest execution, best TypeScript support, cross-browser capability, and rich debugging/recording features. Uses Chromium for development/CI and Firefox for production validation.

### Positive Consequences

- Fast execution (<200ms per test)
- Excellent TypeScript support (native)
- Cross-browser testing (Chromium, Firefox, WebKit)
- Rich debugging and recording features (trace viewer, codegen)
- Native support for mocking API responses
- Better IDE integration than alternatives
- Parallel test execution out of the box

### Negative Consequences

- Learning curve for team members new to Playwright
- Setup/teardown complexity for stateful tests (auth, tenant context)
- Requires separate test data fixtures from Vitest tests

## Implementation Notes

- E2E test suite: 169 tests (64 web app + 105 super-admin)
- Test organization: `apps/web/e2e/`, `apps/super-admin/e2e/`
- Completed as part of Frontend Consolidation Phase D5 (February 11, 2026)
- Test coverage includes: dashboard, auth flow, plugin lifecycle, workspace management, settings, navigation
- Per Constitution Article 8.1: E2E tests required for critical user flows

## Related Decisions

- ADR-009: TailwindCSS v4 Semantic Tokens (E2E tests validate themed UI)
- ADR-010: @plexica/types Shared Package (types used in test fixtures)
- Constitution Article 4.1: Test coverage requirements
- Constitution Article 8.1: Required test types

## References

- Source: `planning/DECISIONS.md` (ADR-008)
- `planning/ROADMAP.md`: Frontend Consolidation Phase D5
- `docs/TESTING.md`: Testing documentation
- [Playwright Documentation](https://playwright.dev/)
