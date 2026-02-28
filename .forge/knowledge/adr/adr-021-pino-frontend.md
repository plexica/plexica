# ADR-021: Pino for Frontend Structured Logging

> Architectural Decision Record documenting the addition of `pino` as a
> structured logging library in the frontend shell application (`apps/web`).
> Required by Spec 010 (Frontend Production Readiness) Task 1.4 — error
> boundary context logging.

| Field    | Value                            |
| -------- | -------------------------------- |
| Status   | Proposed                         |
| Author   | forge-architect                  |
| Date     | 2026-02-28                       |
| Deciders | Architecture Team, Frontend Lead |

---

## Context

Spec 010 (Frontend Production Readiness) introduces `PluginErrorBoundary` (Task
1.1), which requires structured error logging with context fields:
`pluginId`, `tenantSlug`, `userId`, `timestamp`, `stack`.

The backend already uses `pino` (see `apps/core-api`) as the standard
structured logging library. The question is whether to use `pino` in the
frontend as well, use a different library, or use `console.*` directly.

### Forces

1. **Consistency**: The backend uses `pino`; using the same library means
   the same JSON log schema on both sides, simplifying centralized log
   aggregation (ELK/Loki).
2. **Browser compatibility**: `pino` supports a browser mode
   (`pino({ browser: { asObject: true } })`), which delegates to `console.*`
   under the hood but enforces structured output.
3. **Bundle size**: `pino` browser mode is lightweight (~5kB minified+gzip);
   it does not include the Node.js-only transport layer.
4. **Log levels**: `pino` supports configurable log levels via a string
   parameter (e.g., `VITE_LOG_LEVEL=debug`), which aligns with
   Constitution Art. 6.3.
5. **Constitution Art. 2.2**: Any new npm dependency requires an ADR.
   `pino` has >1M weekly downloads and no known critical vulnerabilities.

---

## Decision

**Add `pino` to `apps/web` as a runtime dependency.**

`pino-pretty` is added as a `devDependency` only (used in development
mode for human-readable log output; not shipped in production builds).

### Configuration

```typescript
// apps/web/src/lib/logger.ts
import pino from 'pino';

const isDevelopment = import.meta.env.MODE === 'development';

export const logger = pino({
  level: import.meta.env.VITE_LOG_LEVEL ?? (isDevelopment ? 'debug' : 'info'),
  browser: {
    asObject: true,
    serialize: true,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
});
```

### Usage in ErrorBoundary

```typescript
logger.error(
  { pluginId, tenantSlug, userId, stack: errorInfo?.componentStack },
  'Plugin render error caught by ErrorBoundary'
);
```

### Usage in Theme/Font Loading

```typescript
logger.warn({ fontId }, 'Font not found in catalog; skipping');
logger.warn({ key, value }, `Invalid color format: ${key}`);
```

---

## Alternatives Considered

### Option A: `console.*` directly

**Pros:** Zero bundle impact; no dependency.

**Cons:** No log levels; no structured JSON; inconsistent with backend schema;
no way to suppress logs in tests without monkey-patching `console`.

**Rejected**: Constitution Art. 6.3 requires structured JSON logging.
`console.*` does not produce JSON by default.

### Option B: `tslog`

**Pros:** TypeScript-native; good browser support.

**Cons:** Smaller community than `pino`; different schema from backend.
Adds schema divergence between frontend and backend logs.

**Rejected**: Consistency with backend `pino` schema is a stronger driver.

### Option C: Custom logger wrapper around `console`

**Pros:** Zero new dependency; full control.

**Cons:** Maintenance burden; risk of reimplementing `pino` poorly;
no guarantee of Constitution Art. 6.3 compliance.

**Rejected**: Reinventing existing well-tested library without benefit.

---

## Consequences

### Positive

- Structured JSON logs from frontend errors; consistent schema with backend
- Log level controlled via `VITE_LOG_LEVEL` environment variable
- Tests can use `vi.mock('./logger')` to suppress and verify log calls
- `pino-pretty` improves developer experience in development mode

### Negative

- ~5kB addition to production bundle (`pino` browser mode)
- Developers must import `logger` from `lib/logger.ts` (not use `console`
  directly) — enforced via ESLint `no-console` rule in `apps/web`

### Neutral

- `pino-pretty` is devDependency only — not in production bundle

---

## Compliance

| Constitution Article | Status | Notes                                                                 |
| -------------------- | ------ | --------------------------------------------------------------------- |
| Art. 2.2             | ✅     | `pino` >1M weekly downloads; TypeScript types included (`pino/types`) |
| Art. 6.3             | ✅     | Structured JSON logging; configurable log levels; no PII in logs      |

---

## Implementation Notes

- Add to `apps/web/package.json`:
  ```json
  "dependencies": { "pino": "^9.0.0" },
  "devDependencies": { "pino-pretty": "^13.0.0" }
  ```
- Add ESLint rule `no-console: "error"` to `apps/web/.eslintrc.*` to
  enforce use of structured `logger` instead of raw `console.*`
- See `apps/web/src/lib/logger.ts` for the singleton export

---

## Related Decisions

| ADR     | Title                                    | Relationship                   |
| ------- | ---------------------------------------- | ------------------------------ |
| ADR-020 | Font Hosting Strategy for Tenant Theming | Font loader uses `logger.warn` |
| ADR-022 | Axe-Core & Axe-Playwright                | Same spec; different dep       |

---

_Created for Spec 010 Task 1.4 — Pino Logger for Error Context._
