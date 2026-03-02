# ADR-022: axe-core for Automated Accessibility Testing

> Architectural Decision Record documenting the selection of the axe-core
> ecosystem (`vitest-axe`, `@axe-core/playwright`, and optionally
> `@axe-core/react`) as the automated accessibility testing toolchain for
> WCAG 2.1 AA compliance enforcement. Required by Spec 010 (Frontend
> Production Readiness) Phase 5 — Accessibility Compliance.

| Field         | Value                                              |
| ------------- | -------------------------------------------------- |
| Status        | Accepted                                           |
| Author        | forge-architect                                    |
| Date          | 2026-03-02                                         |
| Accepted Date | 2026-03-02                                         |
| Deciders      | Architecture Review                                |
| Spec          | 010-frontend-production-readiness                  |
| Tasks         | T010-31 (axe-core audit), T010-36 (E2E a11y tests) |

---

## Context

### The Problem

Constitution Article 1.3 mandates WCAG 2.1 AA compliance for all user
interfaces. Spec 010 (Frontend Production Readiness) introduces **8 new
components** — PluginErrorBoundary, PluginErrorFallback, RootErrorBoundary,
ThemeProvider, TenantLogo, WidgetLoader, WidgetFallback, and
WidgetLoadingSkeleton — all of which require accessibility verification.

The design spec (§6) documents **12 WCAG 2.1 AA criteria** to be tested:

| Criterion | Requirement                                  |
| --------- | -------------------------------------------- |
| 1.1.1     | Non-text content has alt text                |
| 1.3.1     | Info and relationships conveyed semantically |
| 1.4.3     | Minimum contrast ratio 4.5:1                 |
| 1.4.4     | Text resizable to 200%                       |
| 1.4.10    | Reflow at 320px CSS width                    |
| 2.1.1     | All functionality via keyboard               |
| 2.4.1     | Bypass blocks (skip-to-content link)         |
| 2.4.3     | Logical focus order                          |
| 2.4.7     | Visible focus indicator                      |
| 3.3.1     | Error identification in text                 |
| 3.3.2     | Labels for inputs                            |
| 4.1.2     | Name, Role, Value for all components         |

**Current state**: The test suite has **zero accessibility-specific tooling**.
No automated a11y checks exist at either the component or E2E level.

### Two Testing Layers Needed

Accessibility testing requires two distinct integration points:

1. **Component-level tests** (Vitest — Constitution Art. 2.1): Verify
   individual components in isolation for ARIA violations, contrast errors,
   and semantic structure. Fast feedback during development (~50ms per check).

2. **E2E tests** (Playwright — ADR-008): Verify full-page accessibility in
   a real browser context — focus trapping, dynamic content, live regions,
   and cross-component interactions that are invisible at the unit level.

### Constitution Art. 2.2 — Dependency Policy

New npm packages require an ADR documenting compliance with the dependency
policy. This ADR IS that approval for the packages below.

---

## Options Considered

### Option A: axe-core Ecosystem (Chosen)

**Packages**: `vitest-axe`, `@axe-core/playwright`, `@axe-core/react` (optional)

- **Description**: Use the Deque axe-core engine through framework-specific
  integrations:
  - `vitest-axe` — Vitest-native matchers (`toHaveNoViolations()`) for
    component-level accessibility assertions in `@testing-library/react` tests
  - `@axe-core/playwright` — `AxeBuilder` class for E2E page-level scans
    with tag filtering (`wcag2a`, `wcag2aa`)
  - `@axe-core/react` (optional, dev-only) — React dev overlay that highlights
    violations during local development; not used in CI

- **Dependency Policy Compliance**:

  | Package                | Weekly Downloads | TypeScript Support | Known Critical CVEs | License |
  | ---------------------- | ---------------- | ------------------ | ------------------- | ------- |
  | `vitest-axe`           | >15k             | Yes (native TS)    | None                | MIT     |
  | `@axe-core/playwright` | >80k             | Yes (`.d.ts`)      | None                | MPL-2.0 |
  | `@axe-core/react`      | >200k            | Yes (`.d.ts`)      | None                | MPL-2.0 |

- **Pros**:
  - axe-core is the **industry standard** for automated WCAG testing (used by
    Google, Microsoft, Gov.UK; maintained by Deque with 100+ WCAG rules)
  - `vitest-axe` provides native Vitest integration — no adapter shims needed
    (unlike `jest-axe` which requires compatibility wrappers)
  - `@axe-core/playwright` integrates natively with the existing Playwright
    E2E suite (ADR-008)
  - WCAG 2.1 AA rule set is built-in and configurable via `withTags()`
  - Both tools produce structured violation reports with rule ID, impact
    level, affected elements, and remediation guidance
  - Community-standard: broad documentation, StackOverflow answers,
    CI/CD examples

- **Cons**:
  - Adds 3 `devDependencies` (2 required, 1 optional)
  - axe-core E2E injection adds ~200ms per page scan in Playwright
  - Developers must learn axe rule IDs when investigating failures
  - axe-core catches ~57% of WCAG violations (Deque's own estimate) —
    manual testing is still required for the remaining criteria
    (handled by T010-33 keyboard nav and T010-35 screen reader QA)

- **Effort**: Low

### Option B: jest-axe (Rejected)

- **Description**: Use `jest-axe` for component-level accessibility testing.
- **Pros**: Mature, widely used.
- **Cons**:
  - `jest-axe` is built for Jest. It does **not** natively support Vitest —
    requires `expect.extend(toHaveNoViolations)` shimming and may break on
    Vitest API divergences in future versions.
  - Constitution Art. 2.1 specifies Vitest ^4.0 as the test framework.
    Introducing a Jest-specific tool creates framework coupling risk.
  - `vitest-axe` was purpose-built for Vitest and is the recommended
    migration path from `jest-axe` per its own README.
- **Effort**: Low
- **Rejected**: Framework mismatch with Vitest; `vitest-axe` is the correct
  Vitest-native equivalent.

### Option C: Pa11y (Rejected)

- **Description**: Use Pa11y CLI for accessibility auditing.
- **Pros**: CLI-based; can run against any URL; no framework integration needed.
- **Cons**:
  - CLI tool, not a test library — no Vitest integration; cannot assert
    on individual components.
  - Separate reporting pipeline; not integrated with existing Playwright
    test results.
  - Uses HTML_CodeSniffer engine, not axe-core — different rule set,
    fewer rules, less community adoption.
  - Cannot filter by WCAG level (2.1 AA) as granularly as axe-core tags.
- **Effort**: Medium (separate CI step, separate reporting)
- **Rejected**: No component-level integration; separate reporting; inferior
  rule coverage compared to axe-core.

### Option D: Manual Testing Only (Rejected)

- **Description**: Rely exclusively on manual accessibility testing (screen
  readers, keyboard navigation, visual inspection).
- **Pros**: No new dependencies; human testers catch nuanced UX issues.
- **Cons**:
  - **Not scalable**: 8 components × 12 WCAG criteria × 3 viewports =
    288+ manual checks per PR.
  - Violations silently regress between releases without automated CI gates.
  - Constitution Art. 8.1 requires automated tests for all features —
    relying solely on manual testing violates this article.
  - Art. 1.3 says "WCAG 2.1 AA compliance **required**" — without
    automated enforcement, compliance is aspirational, not guaranteed.
- **Effort**: High (ongoing per-PR manual effort)
- **Rejected**: Violates Art. 8.1 (automated test requirement) and provides
  no regression protection. Manual testing supplements but cannot replace
  automated checks.

---

## Decision

**Use the axe-core ecosystem as the automated accessibility testing toolchain
for all Spec 010 components and all future frontend code.**

### Package Installation

Add to `apps/web/package.json` as `devDependencies`:

```json
{
  "devDependencies": {
    "vitest-axe": "^0.1.0",
    "@axe-core/playwright": "^4.10.0",
    "@axe-core/react": "^4.10.0"
  }
}
```

**Production bundle exclusion**: All three packages are `devDependencies`.
They are never imported in production source files (`src/`), only in test
files (`*.test.ts`, `*.spec.ts`) and the dev-only React overlay (`@axe-core/react`
is conditionally loaded behind `import.meta.env.DEV`). Vite tree-shaking
ensures zero production bundle impact.

### Integration Layer 1: Component Tests (vitest-axe)

Used in Vitest + `@testing-library/react` tests to check rendered components
for WCAG violations at the element level.

**Setup** (`apps/web/src/test/setupTests.ts`):

```typescript
// File: apps/web/src/test/setupTests.ts
import 'vitest-axe/extend-expect';
// This registers toHaveNoViolations() on Vitest's expect object
```

**Usage**:

```typescript
// File: apps/web/src/components/ErrorBoundary/PluginErrorFallback.test.tsx
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';

describe('PluginErrorFallback accessibility', () => {
  it('should have no WCAG 2.1 AA violations', async () => {
    const { container } = render(
      <PluginErrorFallback
        pluginName="CRM"
        error={new Error('Test error')}
        onRetry={() => {}}
        onGoBack={() => {}}
      />
    );

    const results = await axe(container, {
      rules: {
        // Run only WCAG 2.1 AA rules
      },
    });

    expect(results).toHaveNoViolations();
  });
});
```

### Integration Layer 2: E2E Tests (@axe-core/playwright)

Used in Playwright tests to check full pages for WCAG violations in a real
browser context, including dynamic content, focus management, and live regions.

```typescript
// File: apps/web/tests/a11y/error-boundaries.a11y.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility — Error Boundaries', () => {
  test('Plugin error fallback has zero WCAG 2.1 AA violations', async ({ page }) => {
    await page.goto('/plugins/broken-plugin');
    await expect(page.getByText(/plugin unavailable/i)).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('main')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('Root error page has zero WCAG 2.1 AA violations', async ({ page }) => {
    await page.goto('/trigger-root-error');

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

    expect(results.violations).toEqual([]);
  });
});

test.describe('Accessibility — Themed Shell', () => {
  test('Themed header has correct ARIA landmarks', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .include('[role="banner"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
```

### Integration Layer 3: Dev Overlay (@axe-core/react — Optional)

Optional development-time overlay that highlights violations in the browser
during local development. Conditionally loaded; never in production.

```typescript
// File: apps/web/src/main.tsx
if (import.meta.env.DEV) {
  import('@axe-core/react').then((axe) => {
    axe.default(React, ReactDOM, 1000); // Check every 1s in dev
  });
}
```

### CI Integration

Both automated layers run in CI on every PR:

```yaml
# .github/workflows/frontend.yml (excerpt)
- name: Run component accessibility tests (vitest-axe)
  run: pnpm test -- --grep "accessibility"
  working-directory: apps/web

- name: Run E2E accessibility tests (@axe-core/playwright)
  run: pnpm test:e2e -- --grep "a11y"
  working-directory: apps/web
```

**CI gate**: PR merge is blocked if any `critical` or `serious` axe-core
violation is detected. `moderate` and `minor` violations are logged as
warnings and tracked as technical debt (per T010-32 acceptance criteria).

---

## Consequences

### Positive

- **WCAG 2.1 AA violations caught automatically in CI** — regressions are
  blocked before merge, fulfilling Art. 1.3 and Art. 8.1
- **Two-layer coverage**: Component tests provide fast feedback during
  development (~50ms per axe scan); E2E tests verify full-page context
  including dynamic content, focus trapping, and live regions
- **Consistent rule set**: Both `vitest-axe` and `@axe-core/playwright` use
  the same axe-core engine — identical rule definitions, no rule drift
- **Framework-native**: `vitest-axe` is purpose-built for Vitest; no shims,
  no compatibility hacks, no framework coupling risk
- **Actionable violation reports**: axe-core provides rule ID, impact level,
  affected DOM elements, and fix guidance — developers can remediate without
  external reference
- **Unblocks T010-31 and T010-36**: These tasks are currently blocked pending
  ADR-022 approval

### Negative

- **3 new devDependencies**: `vitest-axe`, `@axe-core/playwright`,
  `@axe-core/react` — increases `node_modules` footprint in dev/CI
  (zero production impact)
- **E2E scan overhead**: axe-core injection adds ~200ms per page scan in
  Playwright E2E tests — with 15 planned a11y test cases (plan.md §5.5),
  this adds ~3s to the E2E suite
- **Partial coverage**: axe-core automated testing catches ~57% of WCAG
  violations (per Deque's published estimate). Manual testing (T010-33
  keyboard nav, T010-35 screen reader QA) is still required for criteria
  that cannot be automated (e.g., meaningful focus order, correct reading
  sequence, cognitive load)
- **Learning curve**: Developers must understand axe rule IDs and violation
  impact levels when investigating failures

### Neutral

- All packages are `devDependencies` — **zero production bundle impact**
- `@axe-core/react` dev overlay is optional and does not affect CI; it is
  a developer convenience tool only
- axe-core rule set updates are semver-minor — new rules may flag existing
  code; this is desirable behavior (catch previously-undetectable violations)

---

## Constitution Alignment

| Article                      | Alignment | Notes                                                                                                                     |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------- |
| Art. 1.3 (WCAG 2.1 AA)       | ✅        | Enforces WCAG 2.1 AA in CI via both component and E2E tests; blocks merge on violations                                   |
| Art. 2.1 (Approved Stack)    | ✅        | `vitest-axe` integrates with Vitest ^4.0; `@axe-core/playwright` integrates with Playwright (ADR-008)                     |
| Art. 2.2 (Dependency Policy) | ✅        | All packages satisfy policy: >15k weekly downloads, TypeScript support, no known CVEs. This ADR IS the required approval. |
| Art. 4.1 (Test Coverage)     | ✅        | Accessibility tests contribute to overall coverage metrics; 15 planned test cases                                         |
| Art. 4.2 (Code Review)       | ✅        | a11y violations in CI provide automated pre-review quality gate                                                           |
| Art. 8.1 (Required Tests)    | ✅        | Automated accessibility tests at component + E2E level; satisfies "all features must have automated tests"                |
| Art. 8.2 (Test Quality)      | ✅        | Tests are deterministic (axe-core engine is stateless), independent, and follow AAA pattern                               |

---

## Implementation Notes

### Test Configuration

1. **Vitest setup** — Add `import 'vitest-axe/extend-expect'` to
   `apps/web/src/test/setupTests.ts` to register the `toHaveNoViolations()`
   matcher globally.

2. **Playwright config** — No special configuration needed. `AxeBuilder` is
   imported per-test from `@axe-core/playwright`. Use `.withTags(['wcag2a', 'wcag2aa'])`
   to restrict scans to WCAG 2.1 AA level.

3. **CI pipeline** — Accessibility tests run as part of existing `pnpm test`
   (component) and `pnpm test:e2e` (Playwright) commands. No separate CI step
   required unless the team wants isolated a11y reporting.

### Screen Coverage (per plan.md §5.5)

| Screen / Component    | vitest-axe (component) | @axe-core/playwright (E2E) | Keyboard Nav | ARIA Assertions                         |
| --------------------- | ---------------------- | -------------------------- | ------------ | --------------------------------------- |
| Plugin Error Fallback | ✅                     | ✅                         | ✅           | `role="alert"`, `aria-label` on buttons |
| Root Error Page       | ✅                     | ✅                         | ✅           | `role="alert"`, `aria-label="Reload"`   |
| Themed Shell Header   | ✅                     | ✅                         | ✅           | `role="banner"`, `aria-current="page"`  |
| Widget Loading        | ✅                     | ✅                         | N/A          | `aria-busy="true"`                      |
| Widget Rendered       | —                      | ✅                         | Depends      | `aria-busy="false"`                     |
| Widget Unavailable    | ✅                     | ✅                         | N/A          | `role="status"`, `aria-label`           |

**Estimated total**: 12–15 accessibility-specific test cases across both layers.

### Production Bundle Exclusion Verification

To verify axe-core is never bundled in production, run:

```bash
# After production build
pnpm build
# Search for axe-core in output chunks
grep -r "axe-core" apps/web/dist/ && echo "FAIL: axe-core in production" || echo "PASS: clean bundle"
```

This check can be added to CI as a post-build verification step.

---

## Follow-Up Actions

- [ ] Install `vitest-axe`, `@axe-core/playwright`, `@axe-core/react` as devDependencies in `apps/web` (T010-31)
- [ ] Add `import 'vitest-axe/extend-expect'` to `apps/web/src/test/setupTests.ts` (T010-31)
- [ ] Run axe-core automated audit across all 7 design-spec screens (T010-31)
- [ ] Add `@axe-core/playwright` E2E accessibility tests for all screens (T010-36)
- [ ] Add production bundle exclusion check to CI (post-build step)
- [ ] Update tasks.md to mark ADR-022 as Accepted (unblock T010-31, T010-36)

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
```

## Related Decisions

| ADR     | Title                 | Relationship                                                    |
| ------- | --------------------- | --------------------------------------------------------------- |
| ADR-008 | Playwright E2E        | `@axe-core/playwright` extends existing Playwright suite        |
| ADR-009 | TailwindCSS v4 Tokens | Theme tokens tested for WCAG contrast compliance                |
| ADR-020 | Font Hosting Strategy | Self-hosted fonts verified for accessibility (loading fallback) |
| ADR-021 | Pino Frontend Logging | Same spec (Spec 010); different concern                         |

---

_Created for Spec 010 Phase 5 — Accessibility Compliance (T010-31, T010-36)._
_Supersedes the initial draft of ADR-022 (2026-02-28) which referenced
`jest-axe` and `axe-playwright` — updated to use `vitest-axe` (Vitest-native)
and `@axe-core/playwright` (official Deque package)._
