# ADR-022: Axe-Core and Axe-Playwright for Accessibility Testing

> Architectural Decision Record documenting the addition of `@axe-core/react`
> and `axe-playwright` as development dependencies for automated WCAG 2.1 AA
> accessibility testing. Required by Spec 010 (Frontend Production Readiness)
> Phase 5 — Accessibility Compliance.

| Field    | Value                                     |
| -------- | ----------------------------------------- |
| Status   | Proposed                                  |
| Author   | forge-architect                           |
| Date     | 2026-02-28                                |
| Deciders | Architecture Team, QA Lead, Frontend Lead |

---

## Context

Spec 010 (Frontend Production Readiness) Phase 5 targets WCAG 2.1 AA
compliance for the shell application (Constitution Art. 1.3).

Two testing layers are required:

1. **Component-level accessibility tests** (unit/integration): Run during
   Vitest test suite to catch violations at the component level.
2. **End-to-end accessibility tests** (Playwright): Run against a running
   browser to catch violations in full-page context (focus trapping, live
   regions, dynamic content).

Both `@axe-core/react` (component-level) and `axe-playwright`
(E2E-level) are the de-facto standard tools for their respective layers.

### Constitution Art. 1.3 — Accessibility Compliance

> "WCAG 2.1 AA compliance required for all user interfaces."

Automated tools are mandatory for continuous enforcement (CI pipeline
blocks merge on violations).

### Constitution Art. 2.2 — Dependency Policy

New packages require an ADR. Both packages satisfy the policy:

| Package           | Weekly Downloads | TypeScript Support | Known Critical CVEs |
| ----------------- | ---------------- | ------------------ | ------------------- |
| `@axe-core/react` | >200k            | Yes (`.d.ts`)      | None                |
| `axe-playwright`  | >150k            | Yes (`.d.ts`)      | None                |

Both are `devDependencies` only — never shipped in production builds.

---

## Decision

**Add `@axe-core/react` and `axe-playwright` as `devDependencies` in `apps/web`.**

### @axe-core/react — Component-Level Accessibility

Used in Vitest + `@testing-library/react` tests to check rendered
components for WCAG violations at the element level.

```typescript
// Example: apps/web/src/components/ErrorBoundary/PluginErrorFallback.test.tsx
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
// Note: @axe-core/react wraps axe-core; jest-axe provides the matcher

expect.extend(toHaveNoViolations);

it('should have no accessibility violations', async () => {
  const { container } = render(<PluginErrorFallback pluginName="CRM" onRetry={() => {}} />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

> **Note**: `@axe-core/react` is the React-specific integration. The
> actual assertion uses `jest-axe` matchers (already compatible with
> Vitest via `expect.extend`).

### axe-playwright — E2E Accessibility

Used in Playwright tests to check full pages for WCAG violations in a
real browser context.

```typescript
// Example: apps/web/tests/e2e/accessibility.spec.ts
import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

test.describe('Accessibility — Shell routes', () => {
  test('homepage has no WCAG 2.1 AA violations', async ({ page }) => {
    await page.goto('/');
    await injectAxe(page);
    await checkA11y(page, undefined, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
  });
});
```

### CI Integration

Both tools run in CI on every PR. Pipeline step:

```yaml
# .github/workflows/frontend.yml (excerpt)
- name: Run accessibility tests
  run: pnpm test:a11y
  working-directory: apps/web
```

PR merge blocked if any WCAG 2.1 AA violation is detected.

---

## Alternatives Considered

### Option A: Manual accessibility testing only

**Pros:** No new dependencies.

**Cons:** Not scalable; violations can silently regress between releases.
Does not satisfy Constitution Art. 1.3 ("required for all user interfaces").

**Rejected**: Art. 1.3 compliance requires automated enforcement in CI.

### Option B: `pa11y` instead of axe-playwright

**Pros:** CLI tool; no Playwright dependency.

**Cons:** Does not integrate with Playwright test suite; separate reporting;
harder to correlate with specific test scenarios.

**Rejected**: `axe-playwright` integrates natively with the existing
Playwright test suite already in use.

### Option C: Lighthouse CI only

**Pros:** Comprehensive audit including performance, SEO, accessibility.

**Cons:** Accessibility coverage is a subset of axe-core; slower; does not
integrate with component-level tests.

**Rejected**: axe-core provides more granular WCAG coverage and integrates
at both component and E2E level.

---

## Consequences

### Positive

- WCAG 2.1 AA violations caught automatically in CI
- Component-level tests verify individual components (faster feedback loop)
- E2E tests verify full-page context (dynamic content, focus management)
- Both tools report against WCAG 2.1 AA rule set — consistent standard

### Negative

- Slight increase in E2E test execution time (axe injection per page)
- Developers must understand axe rule IDs when investigating violations

### Neutral

- Both are `devDependencies` — zero production bundle impact

---

## Compliance

| Constitution Article | Status | Notes                                                           |
| -------------------- | ------ | --------------------------------------------------------------- |
| Art. 1.3             | ✅     | Enforces WCAG 2.1 AA in CI; blocks merge on violations          |
| Art. 2.2             | ✅     | Both packages >100k weekly downloads; TypeScript types; no CVEs |
| Art. 4 (Quality)     | ✅     | Automated accessibility enforcement = quality gate              |

---

## Implementation Notes

- Add to `apps/web/package.json` devDependencies:
  ```json
  "@axe-core/react": "^4.10.0",
  "axe-playwright": "^2.0.0"
  ```
- Accessibility test config: `apps/web/vitest.config.a11y.ts`
- E2E accessibility spec: `apps/web/tests/e2e/accessibility.spec.ts`
- CI job: `pnpm test:a11y` (runs both Vitest a11y tests + Playwright axe checks)

---

## Related Decisions

| ADR     | Title                 | Relationship                            |
| ------- | --------------------- | --------------------------------------- |
| ADR-021 | Pino Frontend Logging | Same spec (Spec 010); different concern |
| ADR-020 | Font Hosting Strategy | Same spec; Phase 2 vs Phase 5           |

---

_Created for Spec 010 Phase 5 — Accessibility Compliance (Tasks 5.1–5.6)._
