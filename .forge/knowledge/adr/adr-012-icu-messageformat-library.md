# ADR-012: ICU MessageFormat Library (FormatJS)

> Architectural Decision Record documenting the selection of an ICU
> MessageFormat library for Plexica's internationalization system.
> Created by the `forge-architect` agent via `/forge-adr`.

| Field    | Value             |
| -------- | ----------------- |
| Status   | Accepted          |
| Author   | forge-architect   |
| Date     | 2026-02-13        |
| Deciders | Architecture Team |

---

## Context

Plexica's i18n spec (006-i18n) requires full ICU MessageFormat support for
plurals, select expressions, and interpolation across all CLDR plural
categories (zero, one, two, few, many, other). The spec explicitly notes
(Constitution Art. 2 compliance) that the ICU MessageFormat library selection
requires an ADR for dependency approval.

The i18n system has specific constraints:

- **Shared package**: The library must work in both Node.js (core-api backend)
  and React (frontend), ideally as a `@plexica/i18n` shared package.
- **Plugin extensibility**: Each plugin ships its own translation namespace;
  the library must support dynamic namespace loading without rebuilding the
  host application.
- **Compile-time messages**: Messages should be compiled at build time to
  eliminate runtime ICU parsing overhead (per NFR-001: < 50ms per namespace).
- **Type safety**: Message IDs must be type-safe (TypeScript strict mode).
- **Bundle size**: Critical for frontend performance (Art. 1.3: page load < 2s
  on 3G).
- **Per-tenant locale**: Multi-tenancy requires per-request locale resolution
  on the backend and per-session locale on the frontend.
- **Lazy loading**: Only load translation namespaces for enabled plugins
  (FR-005).
- **RTL readiness**: RTL language support is out of scope for MVP but must not
  be architecturally blocked.
- **Active maintenance**: Library must have strong community support and
  regular releases.

The system architecture document previously listed i18next 23.x as the i18n
library, but no ADR was created and no dependency was installed. This ADR
formally evaluates the options and makes the decision.

## Options Considered

### Option A: FormatJS (@formatjs/intl + react-intl)

- **Description**: FormatJS is a suite of JavaScript libraries for
  internationalization built by contributors to the ICU specification. The
  core library `intl-messageformat` implements the ICU MessageFormat spec
  natively. `react-intl` provides React components (`<FormattedMessage>`,
  `<FormattedNumber>`, `<FormattedDate>`) and hooks (`useIntl()`).
  `@formatjs/cli` provides message extraction and compile-time AST
  compilation.
- **Pros**:
  - Native ICU MessageFormat implementation — built by ICU-TC contributors
  - Compile-time message compilation via `@formatjs/cli compile` (messages
    compiled to AST, eliminating runtime parsing)
  - Excellent React integration with `react-intl` (components + hooks)
  - Built-in number, date, currency, and relative time formatting via
    standard `Intl` APIs
  - Strong TypeScript support with `defineMessages()` and extracted types
  - Works in Node.js via `@formatjs/intl` (same API as browser)
  - Backed by Meta with 800K+ weekly npm downloads
  - Message extraction tooling (`@formatjs/cli extract`) for developer
    workflow
  - CLDR data built-in for locale-specific formatting
- **Cons**:
  - No native namespace concept — requires manual organization of message
    bundles per plugin namespace (straightforward but not built-in)
  - ~12KB gzipped for `intl-messageformat` core (larger than Lingui's
    compiled approach)
  - Message extraction requires build pipeline integration
    (`@formatjs/cli` or SWC/Babel plugin)
  - Provider-based React API (`<IntlProvider>`) requires wrapping — but
    this aligns with React patterns
- **Effort**: Medium

### Option B: LinguiJS (@lingui/core + @lingui/react)

- **Description**: LinguiJS is a compile-time i18n framework that uses
  macros (`@lingui/macro`) to transform ICU MessageFormat strings into
  optimized AST at build time, resulting in near-zero runtime parsing
  overhead.
- **Pros**:
  - Smallest bundle size (~5KB gzipped) due to compile-time macro approach
  - Excellent type safety — compile-time extraction generates typed message
    catalogs
  - Full ICU MessageFormat support via compile-time transformation
  - Modern DX with SWC and Babel macro support
  - Clean React API with `<Trans>` macro and `useLingui()` hook
  - Works in Node.js via `@lingui/core`
  - Growing community (150K+ weekly downloads)
- **Cons**:
  - Smaller community and ecosystem compared to FormatJS and i18next
  - Macro-based approach requires SWC or Babel plugin in build pipeline
    (adds build complexity)
  - No native namespace support — catalogs must be manually organized per
    plugin
  - Fewer integrations and third-party tooling
  - Macro approach may conflict with Vite Module Federation plugin
    boundaries (each plugin needs its own macro configuration)
  - Less battle-tested at scale in large multi-tenant applications
- **Effort**: Medium

### Option C: i18next + react-i18next + i18next-icu

- **Description**: i18next is the most widely used JavaScript i18n framework.
  ICU MessageFormat support is added via the `i18next-icu` plugin, which uses
  `intl-messageformat` internally. It has native first-class namespace support
  and extensive ecosystem plugins.
- **Pros**:
  - Native first-class namespace support (`ns` option) — best architectural
    fit for plugin namespace isolation
  - Largest ecosystem (3M+ weekly downloads) with extensive documentation
  - Built-in lazy loading backends (`i18next-http-backend`,
    `i18next-fetch-backend`)
  - Excellent `react-i18next` integration with `useTranslation(ns)` hook
  - `addResourceBundle()` API for dynamic plugin translation registration
  - Works in Node.js natively
  - Language detection, caching, and interpolation built-in
  - Already listed in system architecture doc (low organizational friction)
- **Cons**:
  - ICU MessageFormat is not native — requires `i18next-icu` plugin which
    adds `intl-messageformat` as a transitive dependency anyway (~13KB extra)
  - Heaviest total bundle: ~25KB gzipped (i18next + react-i18next +
    i18next-icu + intl-messageformat)
  - Runtime message parsing by default (no compile-time optimization
    without custom tooling)
  - Type safety requires manual `i18next.d.ts` module augmentation with
    significant boilerplate
  - i18next's own interpolation syntax (`{{value}}`) conflicts with ICU
    syntax (`{value}`) — using the ICU plugin disables native
    interpolation, creating two mental models
  - Over-engineered for the use case: i18next's plugin architecture adds
    abstraction layers that are unnecessary when using ICU MessageFormat
    directly
- **Effort**: Low (without ICU) / Medium (with i18next-icu plugin)

## Decision

**Chosen option**: Option A — FormatJS (@formatjs/intl + react-intl)

**Rationale**:

FormatJS is selected because it provides the most direct and complete
implementation of the ICU MessageFormat standard, which is a Must-have
requirement (FR-013). Key decision factors:

1. **ICU compliance**: FormatJS is built by ICU-TC contributors. It
   implements the ICU MessageFormat spec natively rather than through a
   plugin or translation layer. This ensures full CLDR plural category
   support (zero, one, two, few, many, other) without compatibility gaps.

2. **Compile-time optimization**: `@formatjs/cli compile` transforms ICU
   message strings into pre-parsed ASTs at build time, eliminating runtime
   parsing overhead. This directly supports NFR-001 (< 50ms per namespace)
   and NFR-002 (< 200ms total initial load).

3. **Bundle efficiency**: At ~12KB gzipped, FormatJS is significantly
   lighter than i18next+ICU (~25KB) while being only slightly larger than
   Lingui (~5KB). The compile-time approach means the runtime pays no
   parsing cost.

4. **Dual-environment support**: `@formatjs/intl` provides the same API for
   Node.js (backend translation resolution, email templates) and the browser
   (React UI). This enables a single `@plexica/i18n` shared package pattern
   consistent with ADR-010 (`@plexica/types`).

5. **React integration maturity**: `react-intl` is battle-tested at scale
   (used by Meta, Airbnb, and other large platforms). The `<IntlProvider>`
   pattern aligns with Plexica's React context-based locale switching
   (FR-008).

6. **Namespace handling**: While FormatJS doesn't have built-in namespace
   support like i18next, namespace isolation is straightforward: each plugin
   ships its own compiled message bundle, loaded dynamically via
   `import(`./translations/${locale}/${namespace}.json`)`. This aligns with
   the Module Federation architecture (ADR-011) where plugins are already
   independently built and deployed.

7. **i18next rejected**: Despite its larger ecosystem and native namespace
   support, i18next was rejected because (a) ICU is bolted on via plugin
   rather than native, (b) the dual interpolation syntax creates developer
   confusion, (c) the total bundle is 2x larger, and (d) runtime parsing
   conflicts with our compile-time optimization requirement.

## Consequences

### Positive

- Full ICU MessageFormat compliance with zero interpretation gaps for plurals,
  select, and nested expressions across all CLDR categories.
- Compile-time message compilation eliminates runtime parsing overhead,
  directly meeting NFR-001 and NFR-002 performance targets.
- Single API surface (`createIntl` / `useIntl`) shared between backend
  and frontend via `@plexica/i18n` package.
- Built-in `<FormattedNumber>`, `<FormattedDate>`, `<FormattedRelativeTime>`
  components for locale-aware formatting without additional libraries.
- Strong TypeScript support via `defineMessages()` and extracted message
  descriptors.
- Meta-backed project with long-term maintenance confidence.

### Negative

- No built-in namespace concept: translation namespaces must be implemented
  manually via separate message bundles per plugin. This is additional
  implementation work compared to i18next's native `ns` support.
- Build pipeline integration required: `@formatjs/cli extract` and
  `@formatjs/cli compile` must be added to the plugin build process and
  core build process.
- Developers familiar with i18next will need to learn the FormatJS API
  (different hook names, provider pattern).
- System architecture document lists i18next — must be updated to reflect
  this decision.

### Neutral

- FormatJS's `<IntlProvider>` is React context-based, which aligns with
  the existing architecture pattern for theme and auth providers.
- Message extraction workflow (`@formatjs/cli extract`) is similar in
  complexity to i18next's extraction tooling.
- RTL support is not architecturally blocked by this choice; FormatJS
  supports `Intl.Locale` direction detection when RTL locales are added.

## Constitution Alignment

| Article | Alignment | Notes                                                                                                                                                                          |
| ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Art. 1  | COMPLIANT | Supports UX standards: ICU plurals enable natural language; compile-time optimization supports < 2s page load on 3G (Art. 1.3). Plugin system integrity maintained (Art. 1.2). |
| Art. 2  | COMPLIANT | New dependency approved via this ADR (Art. 2.2). 800K+ weekly downloads (exceeds 1000 threshold). Full TypeScript support. No known vulnerabilities. Maintained by Meta.       |
| Art. 3  | COMPLIANT | Service layer pattern for translation resolution (Art. 3.2). Works with modular monolith and plugin architecture. Compiled messages support lazy loading via dynamic imports.  |

### Dependency Approval (Art. 2.2 Checklist)

| Criterion               | Status | Detail                                           |
| ----------------------- | ------ | ------------------------------------------------ |
| Weekly downloads > 1000 | ✅     | `react-intl`: 800K+; `intl-messageformat`: 1.2M+ |
| No critical/high vulns  | ✅     | No known vulnerabilities                         |
| TypeScript support      | ✅     | Native TypeScript, published `.d.ts` files       |
| ADR approval            | ✅     | This ADR (ADR-012)                               |

### Packages to Install

| Package              | Purpose                            | Scope    |
| -------------------- | ---------------------------------- | -------- |
| `@formatjs/intl`     | Core intl API (backend + frontend) | Shared   |
| `react-intl`         | React components and hooks         | Frontend |
| `@formatjs/cli`      | Message extraction and compilation | Dev      |
| `intl-messageformat` | ICU MessageFormat parser (peer)    | Shared   |

## Follow-Up Actions

- [ ] Update system architecture doc: change i18n library from `i18next 23.x`
      to `@formatjs/intl (react-intl)` in
      `.forge/architecture/system-architecture.md`
- [ ] Create `@plexica/i18n` shared package in `packages/i18n/` with
      FormatJS wrappers, namespace loading, and tenant override merging
- [ ] Add `@formatjs/cli extract` and `@formatjs/cli compile` to plugin
      build pipeline and core build process
- [ ] Implement namespace-based message loading that integrates with
      plugin manifest `translations` field (FR-001, FR-004)
- [ ] Create implementation plan for spec 006-i18n referencing this ADR

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
```

## Related Decisions

- [ADR-010: @plexica/types Shared Package](adr-010-shared-types-package.md) —
  same monorepo shared package pattern for `@plexica/i18n`
- [ADR-003: Plugin Language Support (TypeScript Only)](adr-003-plugin-language-support.md) —
  plugins ship TypeScript compiled message bundles
- [ADR-011: Vite Module Federation](adr-011-vite-module-federation.md) —
  plugins independently built; message bundles part of plugin build output
- [ADR-001: Monorepo Strategy](adr-001-monorepo-strategy.md) —
  `@plexica/i18n` as new monorepo package
- Spec 006-i18n: `.forge/specs/006-i18n/spec.md` (FR-013: ICU MessageFormat)
- Constitution Article 2.1, 2.2: Technology stack and dependency policy

## References

- [FormatJS Documentation](https://formatjs.io/)
- [ICU MessageFormat Specification](https://unicode-org.github.io/icu/userguide/format_parse/messages/)
- [react-intl API Reference](https://formatjs.io/docs/react-intl/)
- [@formatjs/cli Compilation](https://formatjs.io/docs/tooling/cli/)
- [CLDR Plural Rules](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html)
