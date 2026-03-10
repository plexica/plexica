# ADR-032: DOMPurify for HTML/CSS XSS Sanitization in Frontend

> Architectural Decision Record approving the adoption of DOMPurify v3.x as a
> project dependency for HTML and CSS sanitization in frontend packages.
> Created by the `forge-architect` agent via `/forge-adr` as part of
> Spec 015 `/forge-plan`.

| Field    | Value                                                            |
| -------- | ---------------------------------------------------------------- |
| Status   | Accepted                                                         |
| Author   | forge-architect                                                  |
| Date     | 2026-03-09                                                       |
| Deciders | FORGE orchestrator, Spec 015 `/forge-plan` architecture analysis |

---

## Context

GitHub CodeQL has identified **3 `js/xss-through-dom` alerts** in the Plexica
frontend codebase:

1. **`ThemePreview.tsx` line 89**: `dangerouslySetInnerHTML` used with
   unsanitized scoped CSS. The component renders tenant-configured CSS theme
   rules inside a `<style>` tag to provide a live preview of tenant branding.
   An attacker who controls tenant branding CSS could inject
   `</style><script>alert(1)</script>` to execute arbitrary JavaScript.

2. **`ThemePreview.tsx` line 101**: An `<img>` tag renders a `logoUrl` value
   from tenant settings. A `javascript:` URL in the `src` attribute would
   execute JavaScript on image error or in some browser contexts.

3. **`admin.settings.tsx` line 242**: Same `<img src={logoUrl}>` pattern in
   the admin settings route, rendering tenant logo from settings without
   URL scheme validation.

### Why Custom Sanitization Is Insufficient

The ThemePreview component legitimately needs to render CSS rules in the DOM
to provide a visual preview. This means:

- **`textContent` is insufficient**: The CSS must be interpreted by the browser
  as actual CSS rules — inserting via `textContent` into a `<style>` tag would
  not work (the browser treats `textContent` as literal text, not CSS).
- **A custom CSS sanitizer** would need to handle `</style>` tag injection,
  `expression()` calls (legacy IE), `url(javascript:...)` values, `@import`
  CSS exfiltration, and the constantly evolving OWASP XSS cheat sheet vectors.
  Building and maintaining this in-house is a significant ongoing security risk.

### Dependency Policy Check (Constitution Art. 2.2)

Per Constitution Article 2.2, new npm packages require:

1. **>1000 weekly downloads**: DOMPurify has ~10 million weekly downloads ✅
2. **No known critical/high vulnerabilities**: DOMPurify has 0 known
   vulnerabilities as of 2026-03-09 ✅
3. **TypeScript support**: `@types/dompurify` provides full TypeScript type
   definitions ✅
4. **ADR approval**: This ADR fulfills the requirement ✅

---

## Options Considered

### Option A: DOMPurify v3.x (Chosen)

- **Description**: Adopt DOMPurify v3.x as a dependency of `packages/ui`.
  Use DOMPurify's `sanitize()` function to sanitize CSS content before
  insertion via `dangerouslySetInnerHTML`. Create a `sanitizeCss()` wrapper
  utility that configures DOMPurify appropriately for CSS-only sanitization
  (wraps input in `<style>` tags, sanitizes, extracts CSS content).

- **Pros**:
  - Industry standard: ~10M weekly npm downloads, OWASP recommended
  - Covers the full OWASP XSS cheat sheet — `<script>` injection,
    `expression()`, `javascript:` URLs, `@import` exfiltration, SVG/MathML
    vectors, and edge cases across all major browsers
  - Actively maintained with rapid response to new XSS vectors
  - Small bundle: ~17KB gzipped (can be lazy-loaded on admin pages only)
  - TypeScript types available via `@types/dompurify`
  - Browser-native: uses the browser's own DOMParser for sanitization,
    which is inherently more trustworthy than regex-based approaches
  - Single dependency solves all 3 XSS alerts

- **Cons**:
  - New dependency to maintain (version updates, security advisories)
  - Bundle size increase: ~17KB gzipped added to admin pages
  - Requires `window`/DOM API — not usable in pure Node.js SSR without
    `jsdom` (via `isomorphic-dompurify` if needed)

- **Effort**: Low

### Option B: Native `textContent` / Safe React APIs (Rejected)

- **Description**: Replace `dangerouslySetInnerHTML` with `textContent`
  assignment or React's built-in JSX escaping. Validate logo URLs with a
  simple regex before rendering.

- **Pros**:
  - Zero dependencies
  - Simplest possible implementation for URL validation

- **Cons**:
  - **Does not work for ThemePreview**: The component must render CSS as
    actual CSS rules interpreted by the browser. `textContent` in a `<style>`
    element is treated as literal text by React's reconciler — the CSS would
    not be applied. The component would lose its entire purpose.
  - Only partially addresses the problem (logo URL validation but not CSS)

- **Effort**: Low (but functionally broken for the CSS use case)

**Rejected** because it cannot fulfill the ThemePreview CSS rendering
requirement while preventing XSS.

### Option C: Custom CSS Sanitizer (Regex-Based) (Rejected)

- **Description**: Build a custom CSS sanitizer that strips known-dangerous
  patterns: `</style>` tags, `<script>` tags, `expression()` calls,
  `javascript:` URLs in `url()`, and `@import` rules. Implemented as regex
  replacements.

- **Pros**:
  - No external dependency
  - Tailored to the specific CSS sanitization use case

- **Cons**:
  - **High ongoing maintenance risk**: XSS vectors evolve constantly. A
    regex-based sanitizer must be updated every time a new bypass is
    discovered. Historical evidence shows that custom sanitizers have a
    poor track record — even major projects (e.g., early versions of
    `sanitize-html`) have had bypass vulnerabilities.
  - Does not leverage the browser's DOMParser (which catches parser-level
    edge cases that regex cannot)
  - Must handle encoding variations (`&#x6A;avascript:`, `\6A avascript:`,
    UTF-8 BOM injection, null byte injection, etc.)
  - No community review or security audit
  - Violates the "don't roll your own security" principle

- **Effort**: Medium (initial) + High (ongoing maintenance)

**Rejected** because the maintenance risk and historical bypass vulnerability
rate of custom sanitizers is unacceptable for a security-critical function.

### Option D: `sanitize-html` Library (Rejected)

- **Description**: Adopt `sanitize-html` (~1.5M weekly downloads) as an
  alternative to DOMPurify.

- **Pros**:
  - Well-established library with good community support
  - Allowlist-based approach

- **Cons**:
  - Designed primarily for HTML sanitization, not CSS injection prevention
  - Heavier than DOMPurify (~25KB vs ~17KB gzipped)
  - Does not use browser-native DOMParser (server-side htmlparser2)
  - Less comprehensive coverage of CSS-specific XSS vectors
  - Fewer weekly downloads than DOMPurify

- **Effort**: Low

**Rejected** because DOMPurify is more suitable for the CSS sanitization use
case and has broader community adoption and OWASP endorsement.

---

## Decision

**Adopt DOMPurify v3.x** (`dompurify` + `@types/dompurify`) as a dependency
of the `packages/ui` package for HTML and CSS sanitization in the frontend.

**Rationale**:

1. DOMPurify is the de facto industry standard for DOM sanitization, with
   ~10M weekly downloads and explicit OWASP recommendation.
2. It uses the browser's native DOMParser, which catches parser-level edge
   cases that regex-based approaches miss.
3. The ~17KB gzipped bundle cost is acceptable for a security-critical library
   and can be lazy-loaded on admin settings pages only.
4. It eliminates all 3 CodeQL `js/xss-through-dom` alerts with a single,
   well-maintained dependency.
5. It avoids the ongoing maintenance burden and bypass risk of a custom
   CSS sanitizer.

**Installation target**: `packages/ui/package.json` (dependencies)

```bash
pnpm --filter @plexica/ui add dompurify @types/dompurify
```

**Usage pattern**:

```typescript
// File: packages/ui/src/utils/sanitize-css.ts
import DOMPurify from 'dompurify';

export function sanitizeCss(css: string): string {
  // Wrap in <style> for DOMPurify to parse as CSS context
  const wrapped = `<style>${css}</style>`;
  const sanitized = DOMPurify.sanitize(wrapped, {
    FORCE_BODY: false,
    ALLOWED_TAGS: ['style'],
    ALLOWED_ATTR: [],
  });
  // Extract CSS content from sanitized <style> tag
  const match = sanitized.match(/<style>([\s\S]*?)<\/style>/);
  return match ? match[1] : '';
}
```

---

## Consequences

### Positive

- **Eliminates all 3 XSS alerts**: Complete resolution of CodeQL
  `js/xss-through-dom` findings in `ThemePreview.tsx` and `admin.settings.tsx`
- **Industry-standard security**: DOMPurify covers OWASP XSS cheat sheet
  vectors, CSS injection, SVG/MathML vectors, and encoding edge cases
- **Low maintenance burden**: DOMPurify is actively maintained by security
  researchers; new XSS vectors are patched upstream, not in Plexica code
- **Browser-native parsing**: Uses the browser's DOMParser for robust
  sanitization that regex cannot match
- **Reusable utility**: The `sanitizeCss()` and `validateImageUrl()` utilities
  are available to all `@plexica/ui` consumers for future use

### Negative

- **New dependency**: One additional npm package to maintain, monitor for
  security advisories, and keep updated
- **Bundle size increase**: ~17KB gzipped added to pages that import DOMPurify.
  Mitigated by lazy-loading on admin pages only (ThemePreview and admin settings)
- **No SSR support**: Standard `dompurify` requires a DOM API (`window`,
  `document`). If ThemePreview or admin settings are ever server-rendered,
  `isomorphic-dompurify` (~500K weekly downloads) would be needed as a wrapper.
  Current analysis: both components are client-rendered only — not an issue today

### Neutral

- No backend changes required — DOMPurify is a frontend-only dependency
- No API contract changes — sanitization happens in the browser before rendering
- No database changes — tenant CSS/logo data is stored as-is; sanitization
  is applied at render time (defense-in-depth, not data mutation)
- If DOMPurify is ever deprecated or replaced, the `sanitizeCss()` wrapper
  utility isolates callers from the library — only one file needs to change

---

## Constitution Alignment

| Article                       | Alignment | Notes                                                                                                                                    |
| ----------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1.2 §1 (Security First)  | ✅        | Directly addresses known XSS vulnerabilities in production code. DOMPurify is the strongest available mitigation for DOM-based XSS.      |
| Art. 2.2 (Dependency Policy)  | ✅        | This ADR fulfills the ADR approval requirement. DOMPurify passes all 4 checks: >1000 downloads (10M), no vulnerabilities, TS types, ADR. |
| Art. 3.2 (Code Organization)  | ✅        | Utility placed in `packages/ui/src/utils/` — shared UI package per monorepo convention.                                                  |
| Art. 4.1 (Test Coverage)      | ✅        | Spec 015 FR-027 and FR-028 require unit tests for the sanitizer and URL validator. ≥ 85% coverage target for new security utilities.     |
| Art. 5.3.3 (XSS Prevention)   | ✅        | Directly implements Constitution XSS prevention requirement via industry-standard library.                                               |
| Art. 7.1 (Naming Conventions) | ✅        | File: `sanitize-css.ts` (kebab-case). Function: `sanitizeCss()` (camelCase). Component: `SafeImage` (PascalCase).                        |

---

## Follow-Up Actions

- [x] Install DOMPurify in `packages/ui` (Spec 015 T015-22)
- [x] Create `sanitize-css.ts` utility (Spec 015 T015-23)
- [x] Create `validate-image-url.ts` utility (Spec 015 T015-24)
- [x] Create `<SafeImage>` component (Spec 015 T015-25)
- [x] Wire sanitization into `ThemePreview.tsx` (Spec 015 T015-26)
- [x] Wire `SafeImage` into `admin.settings.tsx` (Spec 015 T015-27)
- [x] Write CSS sanitizer unit tests (Spec 015 T015-28)
- [x] Write URL validation unit tests (Spec 015 T015-29)
- [ ] Update `docs/SECURITY.md` with XSS prevention patterns (Spec 015 T015-40)
- [ ] Update decision log with ADR-032 approval (Spec 015 T015-41)

---

## Related Decisions

- **Spec 015**: Security Hardening — GitHub Code Scanning Remediation.
  FR-023, FR-024, FR-025, FR-026, FR-027, FR-028 define the XSS fix
  requirements that this ADR supports.
- **Constitution Art. 2.2**: Dependency Policy — this ADR fulfills the
  mandatory ADR approval for new dependencies.
- **Constitution Art. 5.3.3**: XSS Prevention — DOMPurify implements the
  constitutional requirement for cross-site scripting prevention.
- **ADR-021 (Pino Frontend Logging)**: Established the pattern for
  adding frontend utility packages to `packages/ui` with shared utilities.

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
```

<!-- Update Status field when this ADR moves through the lifecycle -->
<!-- If superseded, add: Superseded by: ADR-NNN -->
<!-- If deprecated, add: Deprecated reason: [reason] -->
