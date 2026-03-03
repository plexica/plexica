# ADR-021: Pino Structured Logging in Frontend Error Boundaries

> Architectural Decision Record documenting the use of `pino` (via `pino/browser`
> transport) as the structured logging library in the frontend shell application
> (`apps/web`) for error boundary context logging, theme warnings, and widget
> loading diagnostics.
>
> Created by the `forge-architect` agent via `/forge-adr`.

| Field    | Value                             |
| -------- | --------------------------------- |
| Status   | Accepted                          |
| Author   | forge-architect                   |
| Date     | 2026-03-02                        |
| Deciders | Architecture Review               |
| Spec     | 010-frontend-production-readiness |
| Task     | T010-04 (Phase 1, Task 4)         |

---

## Context

Spec 010 (Frontend Production Readiness) introduces `PluginErrorBoundary`
(FR-016, FR-017, FR-018) which catches errors from plugin remote loading and
plugin component rendering. When an error is caught, the boundary must log
structured context including:

- `timestamp` — ISO 8601
- `level` — error severity
- `message` — human-readable description
- `componentStack` — React component stack trace
- `errorName` — the error class name
- `pluginId` — which plugin failed
- `tenantId` — the current tenant context (for multi-tenant log aggregation)

Constitution Article 6.3 mandates **"Structured JSON logging with Pino"** as the
platform logging standard. The backend (`apps/core-api`) already uses Pino with
the standard fields (`timestamp`, `level`, `message`, `requestId`, `userId`,
`tenantId`). The question is whether the frontend should use the same library
or a different approach.

### Forces

1. **Full-stack consistency**: Using Pino on both sides means identical JSON log
   schemas. Centralized log aggregation tooling (ELK, Loki, Datadog) can parse
   frontend and backend logs with a single parser configuration.

2. **Constitutional mandate**: Art. 6.3 explicitly names Pino. Using a different
   library would require a constitutional amendment. Using `console.error` does
   not produce structured JSON and violates Art. 6.3.

3. **Browser support**: Pino provides a `browser` mode
   (`pino({ browser: { asObject: true } })`) that delegates to `console.*`
   methods internally but wraps output in structured JSON. The browser bundle
   excludes Node.js-specific transports (streams, worker threads, sonic-boom).

4. **Bundle size constraint**: The frontend shell must load in < 2 seconds on 3G
   (Art. 1.3, Art. 4.3). `pino/browser` adds ~5–6KB gzipped — well within a
   15KB budget and negligible compared to React (~45KB) and TanStack Router (~15KB).

5. **Dependency policy**: Art. 2.2 requires ADR approval for new npm packages.
   Pino has >1.5M weekly downloads, TypeScript types included, and no known
   critical or high vulnerabilities. This ADR satisfies that requirement.

6. **Multi-tenant context**: Error boundaries need `tenantId` from the auth
   context injected into every log line. Pino's child logger pattern
   (`logger.child({ tenantId })`) makes this ergonomic.

---

## Options Considered

### Option A: Pino (`pino/browser` transport)

- **Description**: Add `pino` as a runtime dependency in `apps/web`. Use the
  `browser` configuration mode which outputs structured JSON via `console.*`.
  Add `pino-pretty` as a devDependency for human-readable development output.
  Initialize a singleton logger in `apps/web/src/lib/logger.ts`.

- **Pros**:
  - Same JSON schema as backend — unified log aggregation
  - Constitutional compliance (Art. 6.3 names Pino explicitly)
  - Configurable log levels via `VITE_LOG_LEVEL` env var
  - Child loggers for tenant/plugin context injection
  - ~5–6KB gzipped — well under 15KB budget
  - Already in the monorepo `node_modules` (backend uses it); pnpm deduplicates
  - `vi.mock()` makes log verification trivial in tests

- **Cons**:
  - ~5–6KB added to production bundle (minor)
  - Requires `no-console` ESLint rule to enforce consistent usage
  - Slightly unusual for frontend projects (most use console or Sentry)

- **Effort**: Low — configure and export singleton; ~1h implementation

### Option B: `console.error` / `console.warn` directly

- **Description**: Use native browser console methods for all logging. No
  dependency added. Log context as additional arguments to `console.error()`.

- **Pros**:
  - Zero bundle impact; no dependency
  - Every developer knows the API
  - No configuration needed

- **Cons**:
  - **Violates Constitution Art. 6.3** — `console.*` does not produce structured
    JSON. Log output format varies by browser.
  - No log levels: cannot suppress debug logs in production
  - No structured fields: `console.error('Plugin error', pluginId, tenantId)`
    produces unstructured text, not parseable JSON
  - Cannot configure log suppression in tests without monkey-patching `console`
  - Inconsistent schema between frontend and backend logs defeats centralized
    aggregation

- **Effort**: Zero

- **Rejected because**: Direct violation of Art. 6.3. Makes centralized log
  aggregation impossible without custom parsing per browser output format.

### Option C: Winston

- **Description**: Use `winston` as the frontend logging library. Winston is the
  most popular Node.js logging library and has a browser-compatible build.

- **Pros**:
  - Well-known library (~12M weekly downloads)
  - Rich transport ecosystem (Console, HTTP, File)
  - Flexible formatting (JSON, printf, custom)

- **Cons**:
  - **New dependency** — adds a second logging library to the monorepo alongside
    Pino, violating the single-library consistency principle
  - Heavier than Pino browser mode (~15–20KB gzipped vs. ~5–6KB)
  - Different JSON schema from backend Pino logs — log aggregation requires
    two parser configurations
  - Winston's browser support is less mature than its Node.js support

- **Effort**: Medium — new dependency, schema mapping, dual-parser config

- **Rejected because**: Introduces a second logging library when Pino already
  serves both backend and frontend needs. Schema divergence undermines the
  primary goal of unified log aggregation.

### Option D: Sentry SDK

- **Description**: Use Sentry's JavaScript SDK for frontend error reporting.
  Sentry captures errors, performance traces, and user context automatically.

- **Pros**:
  - Rich error tracking UI with source maps, breadcrumbs, and user sessions
  - Automatic capture of unhandled errors and promise rejections
  - Performance monitoring built-in

- **Cons**:
  - **Different concern**: Sentry is an error _tracking_ service, not a
    _logging_ library. It does not produce JSON logs for aggregation.
  - ~30KB gzipped — significantly larger than Pino
  - Requires a Sentry account and external service dependency
  - Does not satisfy Art. 6.3 (structured JSON logging with Pino)
  - Could complement Pino in the future but does not replace it

- **Effort**: Medium — account setup, DSN configuration, source map upload

- **Rejected because**: Out of scope for this ADR. Sentry solves error tracking,
  not structured logging. Can be evaluated separately in a future ADR if
  production error monitoring is needed beyond log aggregation.

---

## Decision

**Chosen option**: **Option A — Pino (`pino/browser` transport)**

**Rationale**:

Pino is the constitutionally mandated logging library (Art. 6.3). Using it in
the frontend ensures:

1. **Single JSON schema** across the full stack — frontend error boundary logs
   and backend service logs are parseable by the same aggregation pipeline.
2. **Zero new library** — Pino is already in the monorepo dependency tree.
   Adding it to `apps/web/package.json` uses the same package; pnpm deduplicates.
3. **Art. 6.3 compliance** — structured JSON with `timestamp`, `level`,
   `message`, and context fields (`pluginId`, `tenantId`, `componentStack`).
4. **Bundle impact within budget** — ~5–6KB gzipped is well under the 15KB
   ceiling and negligible relative to the total shell bundle.

### Configuration

```typescript
// apps/web/src/lib/logger.ts
import pino from 'pino';

const isDevelopment = import.meta.env.MODE === 'development';

export const logger = pino({
  level: import.meta.env.VITE_LOG_LEVEL ?? (isDevelopment ? 'debug' : 'info'),
  browser: {
    asObject: true, // Output structured objects, not formatted strings
    serialize: true, // Serialize Error objects into JSON-safe form
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
});
```

### Required Log Fields (Art. 6.3 Compliance)

Frontend logs include these standard fields, adapted for browser context:

| Field            | Backend Equivalent | Frontend Source                                       |
| ---------------- | ------------------ | ----------------------------------------------------- |
| `timestamp`      | `timestamp`        | Pino auto-generates                                   |
| `level`          | `level`            | Pino log method (error, warn, info)                   |
| `message`        | `message`          | First string argument to log method                   |
| `tenantId`       | `tenantId`         | From `AuthContext` via child logger                   |
| `userId`         | `userId`           | From `AuthContext` via child logger                   |
| `pluginId`       | N/A                | From `PluginErrorBoundary` props                      |
| `componentStack` | N/A                | From `React.ErrorInfo`                                |
| `errorName`      | N/A                | From `error.name`                                     |
| `url`            | `requestId`        | `window.location.href` (frontend analog of requestId) |

**Note**: `requestId` is not applicable in the browser. `url` serves as the
frontend equivalent for identifying which page/route generated the log entry.

### Usage Examples

**Error boundary (primary use case):**

```typescript
// apps/web/src/components/ErrorBoundary/PluginErrorBoundary.tsx
componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
  logger.error(
    {
      pluginId: this.props.pluginId,
      pluginName: this.props.pluginName,
      tenantId: this.context?.tenant?.id,
      userId: this.context?.user?.id,
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      componentStack: errorInfo.componentStack,
      url: window.location.href,
    },
    `Plugin error caught: ${this.props.pluginId}`
  );
}
```

**Theme validation warning:**

```typescript
// apps/web/src/lib/theme-utils.ts
logger.warn(
  { key, value, tenantSlug: tenant.slug },
  `Invalid color format for theme color: ${key}`
);
```

**Widget loading failure:**

```typescript
// apps/web/src/lib/widget-loader.ts
logger.error(
  { pluginId, widgetName, error: err },
  `Failed to load widget: ${pluginId}/${widgetName}`
);
```

---

## Consequences

### Positive

- **Unified log schema**: Frontend and backend logs share the same JSON
  structure, enabling single-parser centralized aggregation (ELK, Loki, Datadog)
- **Constitutional compliance**: Directly satisfies Art. 6.3 (Pino JSON Logging)
  and Art. 6.3.4 (no sensitive data — logger never receives tokens or passwords)
- **Configurable log levels**: `VITE_LOG_LEVEL` env var controls verbosity;
  production defaults to `info`, development to `debug`
- **Testability**: `vi.mock('@/lib/logger')` suppresses and verifies log calls
  in unit tests — no `console.error` noise in test output
- **Developer experience**: `pino-pretty` (devDependency only) provides
  human-readable colored output during development
- **Child loggers**: `logger.child({ tenantId, userId })` injects context
  once per session; all subsequent logs inherit the fields

### Negative

- **~5–6KB production bundle addition**: Minor but non-zero. Pino browser mode
  ships ~5–6KB gzipped. This is 0.3% of a typical React application bundle
  and well within the 15KB ceiling.
- **Enforcement overhead**: An ESLint `no-console` rule must be added to
  `apps/web` to prevent developers from using raw `console.*` instead of the
  structured logger. This is a one-time configuration cost.

### Neutral

- `pino-pretty` is a devDependency only — it is not shipped in production
  builds. No bundle impact from pretty-printing.
- If Sentry or another error tracking service is added in the future, it
  complements (does not replace) Pino. Both can coexist.
- The `POST /api/v1/logs/frontend` backend ingestion endpoint (noted in
  Spec 010 §8 as "nice-to-have") is out of scope for this ADR. Console
  output is sufficient for Phase 1; backend ingestion can be added later
  without changing the logger configuration.

---

## Constitution Alignment

| Article                        | Alignment | Notes                                                                                             |
| ------------------------------ | --------- | ------------------------------------------------------------------------------------------------- |
| Art. 1.3 (UX Standards)        | ✅        | ~5–6KB does not impact page load time on 3G (well within 2s budget)                               |
| Art. 2.1 (Approved Stack)      | ✅        | Pino is not a new technology — it extends existing backend Pino usage to the frontend             |
| Art. 2.2 (Dependency Policy)   | ✅        | Pino: >1.5M weekly downloads, TypeScript types, no known vulnerabilities. This ADR = approval.    |
| Art. 3.2 (Code Organization)   | ✅        | Logger is a shared utility (`lib/logger.ts`), not embedded in components                          |
| Art. 4.3 (Performance Targets) | ✅        | 5–6KB gzipped ≪ 2s page load budget on 3G. No runtime performance impact.                         |
| Art. 5.2 (No PII in Logs)      | ✅        | Logger receives `tenantId` and `pluginId` — no passwords, tokens, emails, or PII                  |
| Art. 6.3 (Pino JSON Logging)   | ✅        | **Direct compliance** — Art. 6.3.1 mandates Pino; this ADR extends it to frontend                 |
| Art. 6.3 (Standard Fields)     | ✅        | `timestamp`, `level`, `message`, `userId`, `tenantId` all present (see Required Log Fields table) |
| Art. 6.3 (Log Levels)          | ✅        | `error`, `warn`, `info`, `debug` — all four levels used per Art. 6.3.3                            |
| Art. 6.3 (No Sensitive Data)   | ✅        | Logger never receives tokens, session IDs, or credentials — enforced by code review               |

---

## Implementation Notes

### Package Installation

Add to `apps/web/package.json`:

```json
{
  "dependencies": {
    "pino": "^9.0.0"
  },
  "devDependencies": {
    "pino-pretty": "^13.0.0"
  }
}
```

### ESLint Enforcement

Add `no-console` rule to `apps/web` ESLint configuration to prevent raw
`console.*` usage and enforce structured logger usage:

```json
{
  "rules": {
    "no-console": "error"
  }
}
```

### Logger Initialization in Shell

The logger singleton (`apps/web/src/lib/logger.ts`) is imported by:

1. `PluginErrorBoundary` — error boundary catch handler (FR-018)
2. `RootErrorBoundary` — root-level crash handler
3. `ThemeProvider` / `theme-utils.ts` — theme validation warnings
4. `widget-loader.ts` — widget loading failure logging
5. `font-loader.ts` — font loading failure warnings (ADR-020)

### Bundle Size Verification

After implementation, verify bundle impact:

```bash
# Build and check bundle size
pnpm --filter apps/web build
# Inspect with rollup-plugin-visualizer or source-map-explorer
# Verify pino contribution is ≤ 15KB gzipped
```

---

## Follow-Up Actions

- [x] Write ADR-021 (this document)
- [ ] Add `pino` to `apps/web/package.json` dependencies (T010-04)
- [ ] Create `apps/web/src/lib/logger.ts` singleton (T010-04)
- [ ] Add `no-console` ESLint rule to `apps/web` (T010-04)
- [ ] Integrate logger into `PluginErrorBoundary.componentDidCatch` (T010-04)
- [ ] Integrate logger into `RootErrorBoundary.componentDidCatch` (T010-04)
- [ ] Verify production bundle size ≤ 15KB gzipped contribution (T010-04)
- [ ] Update Spec 010 cross-reference table if file path changed

---

## Related

| ADR/Doc               | Title                                    | Relationship                                                    |
| --------------------- | ---------------------------------------- | --------------------------------------------------------------- |
| Constitution Art. 6.3 | Logging Standards                        | **Mandates** Pino JSON logging — this ADR extends to frontend   |
| ADR-020               | Font Hosting Strategy for Tenant Theming | Font loader uses `logger.warn` for load failures                |
| ADR-022               | Axe-Core & Axe-Playwright                | Same spec (010); different dependency approval                  |
| Spec 010              | Frontend Production Readiness            | Parent spec — FR-016, FR-017, FR-018 require structured logging |
| T010-04               | Add Pino logger for error context        | Implementation task consuming this ADR                          |

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
                  ▲
                  └── Current (2026-03-02)
```
