# Spec: 015 - Security Hardening — GitHub Code Scanning Remediation

> Feature specification for resolving all 36 open GitHub Code Scanning
> alerts across 9 vulnerability classes. Created by the `forge-pm` agent
> via `/forge-specify`.

| Field   | Value          |
| ------- | -------------- |
| Status  | Ready for Plan |
| Author  | forge-pm       |
| Date    | 2026-03-09     |
| Track   | Feature        |
| Spec ID | 015            |

---

## 1. Overview

GitHub Code Scanning (CodeQL) has identified **36 open security alerts**
across the Plexica repository spanning **9 distinct vulnerability
classes**: Server-Side Request Forgery (SSRF), Path Traversal, Missing
Rate Limiting, Log Injection / Tainted Format Strings, GitHub Actions
Missing Permissions, DOM-based XSS, Regular Expression Denial of Service
(ReDoS), Incomplete Sanitization in test code, and Insecure Randomness
in test infrastructure.

This spec defines the requirements to resolve every alert to achieve
**zero open HIGH/CRITICAL GitHub Code Scanning alerts** and **zero open
WARNING alerts** upon completion. The fixes must not introduce breaking
API changes, must not regress existing test suites, and must comply with
Constitution Articles 1.2 (Security First), 5.3 (Input Validation), and
5.4 (Dependency Security).

## 2. Problem Statement

**What**: 36 open CodeQL alerts across production code, test code,
frontend packages, and CI workflows expose the platform to
exploit risk and block security compliance sign-off.

**Why now**: Constitution Art. 1.2 states "No feature ships without
security review." These alerts represent known, tracked vulnerabilities
that must be resolved before any release targeting production tenants.
Art. 5.4 requires critical vulnerabilities to be patched within 48 hours
and high vulnerabilities within 1 week. The 3 ERROR-severity SSRF alerts
and 2 ERROR-severity Path Traversal alerts qualify as high/critical.

**Impact if unresolved**:

- ERROR-severity alerts (SSRF, Path Traversal) could allow attackers to
  reach internal services or read arbitrary files on the server.
- WARNING-severity alerts (missing rate limiting, XSS, ReDoS, log
  injection) degrade defense-in-depth and may be exploitable under
  specific conditions.
- CI workflow permissions alerts allow GitHub Actions workflows to run
  with overly broad default token scopes, increasing blast radius of
  supply-chain attacks.

## 3. User Stories

### US-001: SSRF Prevention in Keycloak Service

**As a** platform security engineer,
**I want** all outbound HTTP requests from `keycloak.service.ts` to be
restricted to the configured Keycloak base URL,
**so that** an attacker cannot manipulate realm names or other parameters
to force the server to make requests to arbitrary internal/external hosts.

**Acceptance Criteria:**

- Given the `KEYCLOAK_URL` environment variable is set to
  `https://keycloak.internal:8443`, when a `fetch()` call is constructed
  in `exchangeAuthorizationCode`, `refreshToken`, or `revokeToken`, then
  the resolved URL MUST have a hostname matching the configured
  `KEYCLOAK_URL` hostname.
- Given a `realmName` parameter containing path traversal characters
  (e.g., `../../admin`), when `validateRealmName()` is called, then it
  MUST reject the input before any URL is constructed.
- Given the three SSRF alerts at lines 681, 743, and 801 of
  `keycloak.service.ts`, when the fix is deployed, then GitHub CodeQL
  re-scan MUST report zero `js/request-forgery` alerts for this file.

### US-002: Path Traversal Prevention in i18n Service

**As a** platform security engineer,
**I want** all file-system access in the i18n service to be constrained
to the designated translations directory,
**so that** an attacker cannot use crafted locale or namespace parameters
to read arbitrary files from the server.

**Acceptance Criteria:**

- Given a `locale` parameter of `../../etc/passwd` and a `namespace`
  parameter of `core`, when `loadNamespaceFile()` is called, then it
  MUST throw an error and MUST NOT attempt to read
  `/etc/passwd/core.json`.
- Given a `namespace` parameter of `../../../package`, when
  `loadNamespaceFile()` is called, then the resolved path MUST be
  validated to start with the canonical `TRANSLATIONS_DIR` prefix after
  `path.resolve()`.
- Given the two Path Traversal alerts at lines 178 and 193 of
  `i18n.service.ts`, when the fix is deployed, then GitHub CodeQL
  re-scan MUST report zero `js/path-injection` alerts for this file.

### US-003: Rate Limiting on Unprotected Routes

**As a** platform operator,
**I want** all authenticated API endpoints to have rate limiting applied,
**so that** a compromised or abusive client cannot exhaust server
resources or perform brute-force attacks on business-logic endpoints.

**Acceptance Criteria:**

- Given the 11 routes flagged by CodeQL (`tenant-admin.ts` lines 260,
  518, 546, 582; `auth.ts` line 255; `notification-stream.routes.ts`
  lines 123, 154; `jobs.routes.ts` line 53; `search.routes.ts` line 56;
  `notification.routes.ts` line 45; `storage.routes.ts` line 44), when
  rate limiting is applied, then each route MUST return HTTP 429 with a
  standard error body when the configured limit is exceeded.
- Given the existing `@fastify/rate-limit` plugin (already in
  `core-api/package.json` at `^10.3.0`) and the custom Redis-based
  `rateLimiter()` middleware, when the fix is deployed, then all 11
  CodeQL `js/missing-rate-limiting` alerts MUST be resolved — either by
  applying the existing rate-limiting middleware or by adding CodeQL
  suppression comments with documented justification (e.g., SSE streams
  where connection-level rate limiting is already applied at the global
  level).
- Given a new per-route rate limiter is applied, when the P95 response
  time is measured under normal load (< 100 concurrent requests), then
  it MUST NOT increase by more than 5ms compared to pre-fix baseline.

### US-004: Log Injection Prevention

**As a** platform security engineer,
**I want** all log output to use structured logging with Pino instead of
`console.log`/`console.error` with string interpolation,
**so that** an attacker cannot inject forged log entries or control
characters via user-controlled parameters.

**Acceptance Criteria:**

- Given the 4 tainted-format-string alerts (`topic-manager.ts` lines 73
  and 184; `analytics.routes.ts` line 67; `minio-client.ts` line 66),
  when the fix is deployed, then all `console.log`/`console.error` calls
  in those locations MUST be replaced with structured Pino logger calls
  where user-controlled values are passed as context objects, not
  interpolated into the message template.
- Given a topic name containing newline characters (`\n`) or ANSI escape
  sequences, when the log line is emitted, then the user-controlled
  value MUST appear in a JSON field — not in the log message string.
- Given the fix is deployed, then GitHub CodeQL re-scan MUST report
  zero `js/tainted-format-string` alerts for these files.

### US-005: GitHub Actions Permissions Hardening

**As a** DevOps engineer,
**I want** all GitHub Actions workflows to declare explicit minimal
permissions,
**so that** a compromised or malicious action cannot abuse the default
read-write `GITHUB_TOKEN` scope.

**Acceptance Criteria:**

- Given `ci-tests.yml`, when the workflow file is read, then it MUST
  have a top-level `permissions:` block, and each job MUST either
  inherit from the top-level block or declare its own minimal
  `permissions:`.
- Given `deploy.yml`, when the workflow file is read, then it MUST have
  a top-level `permissions:` block with only the scopes required for
  Docker image build and push.
- Given the 6 `actions/missing-workflow-permissions` alerts (5 in
  `ci-tests.yml`, 1 in `deploy.yml`), when the fix is deployed, then
  GitHub CodeQL re-scan MUST report zero alerts of this type.

### US-006: XSS Prevention in Frontend Components

**As a** platform security engineer,
**I want** all user-controlled content rendered in the DOM to be
sanitized or rendered via safe React APIs,
**so that** an attacker cannot inject malicious scripts through tenant
branding fields (logo URL, theme CSS).

**Acceptance Criteria:**

- Given the `ThemePreview.tsx` component (lines 89, 101) uses
  `dangerouslySetInnerHTML` for scoped CSS, when a tenant admin enters
  CSS containing `</style><script>alert(1)</script>`, then the rendered
  output MUST NOT execute the script. The CSS MUST be sanitized to
  contain only valid CSS property declarations.
- Given the `admin.settings.tsx` route (line 242) renders a logo URL
  from tenant settings in an `<img src={...}>` tag, when a tenant admin
  enters a `javascript:` URL, then the `src` attribute MUST be
  validated to start with `https://` or `http://` only.
- Given the fix is deployed, then GitHub CodeQL re-scan MUST report
  zero `js/xss-through-dom` alerts for these files.

### US-007: ReDoS Prevention

**As a** platform security engineer,
**I want** all regular expressions applied to user-controlled input to
be safe from catastrophic backtracking,
**so that** an attacker cannot craft input that causes exponential regex
execution time, resulting in denial of service.

**Acceptance Criteria:**

- Given the regex at `api-client.ts` line 40 (`/\/+$/` — trailing slash
  strip), when a 10,000-character string of slashes is provided, then
  the regex MUST complete in < 1ms. (Note: this specific pattern is
  linear-time safe; the CodeQL alert may be a false positive. If so,
  add a suppression comment with documented justification and a
  regression test.)
- Given the regex patterns in `error-formatter.ts` line 227
  (`/member.*not found/i`), when a 10,000-character string is provided,
  then the regex MUST complete in < 10ms.
- Given the fix is deployed, then GitHub CodeQL re-scan MUST report
  zero `js/polynomial-redos` alerts for these files — either via
  pattern replacement or via documented suppression with regression
  tests proving linear-time behavior.

### US-008: Test Code Sanitization Fixes

**As a** platform security engineer,
**I want** test-code sanitization patterns to use robust implementations
rather than naive single-character replacements,
**so that** CodeQL does not flag the test suite and so that test helpers
model correct sanitization behavior.

**Acceptance Criteria:**

- Given the 4 incomplete-sanitization alerts in test files
  (`shared-data.test.ts` line 136; `service-registry.test.ts` line 164;
  `plugin-communication.unit.test.ts` line 245;
  `error-handling.unit.test.ts` line 279), when the fix is deployed,
  then the sanitization patterns MUST be replaced with safe
  alternatives:
  - Redis key-pattern mocks: replace `pattern.replace('*', '.*')` with
    a proper glob-to-regex utility or `minimatch`.
  - HTML sanitization in tests: replace `input.replace(/<[^>]*>/g, '')`
    with a well-tested sanitization approach.
- Given the fix is deployed, then GitHub CodeQL re-scan MUST report
  zero `js/incomplete-sanitization` and
  `js/incomplete-multi-character-sanitization` alerts for these files.

### US-009: Insecure Randomness in Test Infrastructure

**As a** platform security engineer,
**I want** test infrastructure to use cryptographically secure random
values where IDs are generated,
**so that** CodeQL does not flag the test helper and so that test IDs
are collision-resistant.

**Acceptance Criteria:**

- Given `test-database.helper.ts` line 425 uses
  `Math.random().toString(36).substr(2, 9)` for generating test user
  IDs, when the fix is deployed, then it MUST use `crypto.randomUUID()`
  or `node:crypto.randomBytes()` instead.
- Given the fix is deployed, then GitHub CodeQL re-scan MUST report
  zero `js/insecure-randomness` alerts for this file.

---

## 4. Functional Requirements

### Class 1 — SSRF Prevention (ERROR)

| ID     | Requirement                                                                                                                                                                                                                                                                                          | Priority | Story Ref |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| FR-001 | Add a URL validation helper function (`assertKeycloakUrl`) that: (a) resolves the constructed URL via `new URL(...)`, (b) extracts hostname and protocol, (c) compares against the parsed `KEYCLOAK_URL` environment variable hostname and protocol, (d) throws `Error('SSRF_BLOCKED')` if mismatch. | Must     | US-001    |
| FR-002 | Call `assertKeycloakUrl(tokenEndpoint)` before every `fetch()` in `exchangeAuthorizationCode()` (line 681), `refreshToken()` (line 743), and `revokeToken()` (line 801).                                                                                                                             | Must     | US-001    |
| FR-003 | Extend `validateRealmName()` to additionally reject realm names containing `/`, `\`, `..`, `%2f`, `%2F`, `%5c`, `%5C`, or any URL-encoded path separator — defense-in-depth beyond the existing `^[a-z0-9-]{1,50}$` pattern check.                                                                   | Should   | US-001    |
| FR-004 | Add unit tests validating SSRF protection: (a) valid realm passes, (b) realm with path traversal throws, (c) mismatched hostname throws `SSRF_BLOCKED`, (d) SSRF check does not break legitimate Keycloak admin API calls (token exchange, refresh, revoke all succeed with correct `KEYCLOAK_URL`). | Must     | US-001    |

### Class 2 — Path Traversal Prevention (ERROR)

| ID     | Requirement                                                                                                                                                                                                                                                                                                            | Priority | Story Ref |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| FR-005 | In `loadNamespaceFile()`, after constructing `filePath` via `path.join(TRANSLATIONS_DIR, locale, namespace + '.json')`, resolve it to an absolute path via `path.resolve(filePath)` and assert that the result starts with `path.resolve(TRANSLATIONS_DIR)`. Throw `PATH_TRAVERSAL_BLOCKED` if the prefix check fails. | Must     | US-002    |
| FR-006 | Add Zod validation for the `locale` parameter: must match `/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/` (BCP 47 language tag subset). Reject locales containing path separators before any file-system access.                                                                                                               | Must     | US-002    |
| FR-007 | Add Zod validation for the `namespace` parameter: must match `/^[a-z0-9-]{1,64}$/` (lowercase alphanumeric with hyphens). Reject namespaces containing dots, slashes, or path separators.                                                                                                                              | Must     | US-002    |
| FR-008 | Add unit tests: (a) valid locale/namespace resolves correctly, (b) `../../etc/passwd` locale throws, (c) `../package` namespace throws, (d) URL-encoded path traversal throws, (e) boundary: empty locale throws, 64-char namespace succeeds, 65-char namespace fails.                                                 | Must     | US-002    |

### Class 3 — Missing Rate Limiting (WARNING)

| ID     | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Priority | Story Ref |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| FR-009 | Apply rate limiting to `tenant-admin.ts` route plugin (line 260). Use the existing `rateLimiter()` Redis middleware or register `@fastify/rate-limit` at the plugin scope. All 4 flagged handlers (lines 260, 518, 546, 582 — the `addHook('preHandler')` registration and the 3 team-member mutation endpoints) MUST be covered. Recommended limit: 30 requests/minute per tenant+user key for write operations.                                                                                                                                                                                                                                                                                                                                                                       | Must     | US-003    |
| FR-010 | Apply rate limiting to `auth.ts` login route (line 255). The `authRateLimitHook` middleware already exists in `middleware/auth-rate-limit.ts` — verify it is applied to this specific handler. If the CodeQL alert persists because CodeQL cannot trace the custom middleware, add a CodeQL suppression comment (`// lgtm[js/missing-rate-limiting]`) with a reference to the middleware file and test file that validates rate limiting behavior.                                                                                                                                                                                                                                                                                                                                      | Must     | US-003    |
| FR-011 | Handle rate limiting for `notification-stream.routes.ts` lines 123 and 154. For the SSE stream endpoint (line 154, `config: { rateLimit: false }`), the exemption is **confirmed correct**: the global `@fastify/rate-limit` plugin guards connection establishment, and per-request rate limiting is meaningless for a long-lived SSE stream. Requirements: (a) add a code comment at the `rateLimit: false` config explaining the justification, (b) add a CodeQL suppression comment `// lgtm[js/missing-rate-limiting]` referencing this spec (FR-011), (c) add an integration test verifying the global `@fastify/rate-limit` plugin IS active and throttles rapid SSE connection attempts. For line 123 (the non-stream endpoint), apply the standard `rateLimiter()` middleware. | Must     | US-003    |
| FR-012 | Apply rate limiting to `jobs.routes.ts` (line 53), `search.routes.ts` (line 56), `notification.routes.ts` (line 45), and `storage.routes.ts` (line 44). Each route plugin's `addHook('preHandler')` registration point MUST include rate limiting — either via the existing `rateLimiter()` middleware with appropriate per-module limits or via Fastify plugin-scoped `@fastify/rate-limit` registration.                                                                                                                                                                                                                                                                                                                                                                              | Must     | US-003    |
| FR-013 | Rate limits MUST be environment-configurable with the following three-tier defaults. Environment variables: `RATE_LIMIT_AUTH` (default `20` req/min) for auth endpoints (`auth.ts`); `RATE_LIMIT_ADMIN` (default `60` req/min) for admin endpoints (`tenant-admin.ts`, `jobs.routes.ts`); `RATE_LIMIT_GENERAL` (default `120` req/min) for general API endpoints (`search.routes.ts`, `notification.routes.ts`, `storage.routes.ts` reads). Upload endpoints in `storage.routes.ts` use `RATE_LIMIT_ADMIN`. If the environment variable is not set, the default value is used. Key format: `rl:{tier}:{tenantId}:{userId}`. Document the three tiers and their defaults in `docs/SECURITY.md`.                                                                                          | Must     | US-003    |
| FR-014 | Add integration tests for rate limiting on at least 3 of the newly-protected routes: verify that exceeding the limit returns HTTP 429 with the standard `{ error: { code: 'RATE_LIMITED', ... } }` body.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Must     | US-003    |

### Class 4 — Log Injection Prevention (WARNING)

| ID     | Requirement                                                                                                                                                                                                                                                                                                                                                                                                              | Priority | Story Ref |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------- |
| FR-015 | In `topic-manager.ts`, replace all `console.log` and `console.error` calls (lines 71, 73, 85, 171, 184, and any others) with structured Pino logger calls. User-controlled values (`name`, `topicName`) MUST be passed in the Pino context object, not interpolated into the message template string. Example: `logger.info({ topicName: name }, 'Topic created')` instead of ``console.log(`Topic created: ${name}`)``. | Must     | US-004    |
| FR-016 | In `analytics.routes.ts` (line 67), replace `console.error(\`[Analytics API] Failed to run report ${id}:\`, error)`with a Pino structured log:`request.log.error({ reportId: id, error }, 'Failed to run analytics report')`. Also replace the `any`type annotation on the catch variable with`unknown`.                                                                                                                 | Must     | US-004    |
| FR-017 | In `minio-client.ts` (line 66), replace `console.error(\`MinIO error ensuring bucket ${bucketName}:\`, error)` with a Pino structured log. Accept a Pino logger instance via constructor injection or use a module-level logger.                                                                                                                                                                                         | Must     | US-004    |
| FR-018 | Add unit tests: (a) mock Pino logger and verify that user-controlled values appear in the log context object, not in the message string, (b) verify that log output for a topic name containing `\n` characters does not produce a multi-line log entry.                                                                                                                                                                 | Should   | US-004    |

### Class 5 — GitHub Actions Permissions (WARNING)

| ID     | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                     | Priority | Story Ref |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| FR-019 | Add a top-level `permissions: read-all` block to `ci-tests.yml` to set the default token scope for all jobs to read-only.                                                                                                                                                                                                                                                                                                                       | Must     | US-005    |
| FR-020 | For each job in `ci-tests.yml` that needs write access (e.g., coverage upload, status checks), add explicit per-job `permissions:` blocks with only the required scopes (e.g., `checks: write`, `contents: read`, `pull-requests: write`). Jobs that only need read access MUST NOT declare additional permissions.                                                                                                                             | Must     | US-005    |
| FR-021 | Add a top-level `permissions:` block to `deploy.yml` with minimal required scopes: `contents: read` (for checkout) and `packages: write` (for Docker image push). If the deploy workflow publishes to a container registry via `docker/login-action`, verify whether `packages: write` is the correct scope or whether only repository-level secrets are needed (in which case `permissions: {}` with explicit `contents: read` is sufficient). | Must     | US-005    |
| FR-022 | Verify that no other workflow files in `.github/workflows/` lack explicit permissions blocks. If additional workflows are found, include them in the fix.                                                                                                                                                                                                                                                                                       | Should   | US-005    |

### Class 6 — XSS Prevention (WARNING)

| ID     | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                      | Priority | Story Ref |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| FR-023 | In `ThemePreview.tsx`, sanitize the `scopedCss` value before passing it to `dangerouslySetInnerHTML`. Implement a CSS-only sanitizer that: (a) strips any `</style>` closing tags, (b) strips any `<script>` tags, (c) strips `url()` values pointing to `javascript:` URIs, (d) strips CSS `expression()` calls. Alternatively, adopt a dedicated CSS sanitization library.                                                     | Must     | US-006    |
| FR-024 | In `ThemePreview.tsx` line 101, if `logoUrl` is rendered in an `<img src={...}>` attribute, validate it against an allowlist of URL schemes (`https://`, `http://`, `data:image/`). Reject `javascript:`, `data:text/html`, and other dangerous schemes.                                                                                                                                                                         | Must     | US-006    |
| FR-025 | In `admin.settings.tsx` line 242, validate the `logoUrl` value before rendering in an `<img src={...}>` attribute. Apply the same URL scheme allowlist from FR-024. Consider extracting a shared `SafeImage` component or `validateImageUrl()` utility in `@plexica/ui`.                                                                                                                                                         | Must     | US-006    |
| FR-026 | Adopt `DOMPurify` (`^3.x`) as a project dependency for robust HTML/CSS sanitization. ADR-032 (DOMPurify Adoption) MUST be created alongside the implementation plan per Constitution Art. 2.2. DOMPurify is the industry standard (~10M weekly npm downloads), eliminates the need for a custom CSS sanitizer, and covers OWASP XSS cheat sheet vectors. Bundle impact: ~17KB gzipped, lazy-loaded on admin settings pages only. | Must     | US-006    |
| FR-027 | Add unit tests for the CSS sanitizer: (a) valid CSS passes through unchanged, (b) `</style><script>alert(1)</script>` is stripped, (c) `expression(alert(1))` is stripped, (d) `url(javascript:alert(1))` is stripped, (e) `@import url("https://evil.com")` is stripped.                                                                                                                                                        | Must     | US-006    |
| FR-028 | Add unit tests for URL scheme validation: (a) `https://cdn.example.com/logo.png` passes, (b) `http://cdn.example.com/logo.png` passes, (c) `javascript:alert(1)` is rejected, (d) `data:text/html,<script>` is rejected, (e) `data:image/png;base64,...` passes (if data-image is allowed), (f) empty string passes (renders nothing).                                                                                           | Must     | US-006    |

### Class 7 — ReDoS Prevention (WARNING)

| ID     | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Priority | Story Ref |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| FR-029 | The regex at `api-client.ts` line 40 (`/\/+$/`) is a **confirmed false positive**: it is a simple quantifier on a single literal character with no alternation or nested quantifiers — O(n) linear time. Fix: add a CodeQL suppression comment `// lgtm[js/polynomial-redos] Safe: /\/+$/ is O(n) — single char class, no alternation or nesting. See Spec 015 FR-029.` Add a regression benchmark test confirming < 1ms on a 100K-character adversarial input (100K forward slashes).                                                                                        | Must     | US-007    |
| FR-030 | The regex at `error-formatter.ts` line 227 (`/member.*not found/i`) is a **confirmed false positive**: the `.*` quantifier with a literal suffix on a non-multiline regex is O(n) per the ECMA spec (single-pass scan with no nested quantifiers or alternation). Fix: add a CodeQL suppression comment `// lgtm[js/polynomial-redos] Safe: /member.*not found/i is O(n) — single .*  with literal suffix, no nesting. See Spec 015 FR-030.` Add a regression benchmark test confirming < 10ms on a 100K-character adversarial input (e.g., `"member" + "x".repeat(100000)`). | Must     | US-007    |

### Class 8 — Incomplete Sanitization in Test Code (WARNING)

| ID     | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Priority | Story Ref |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------- |
| FR-031 | In `shared-data.test.ts` (line 136) and `plugin-communication.unit.test.ts` (line 245), replace the mock Redis `keys()` implementation `pattern.replace('*', '.*')` with a proper glob-to-regex conversion that escapes regex metacharacters in the pattern before replacing `*`. Use a helper that: (a) escapes all regex metacharacters (`[.+^${}()\|[\]\\]`) via `replace(/[.+^${}()\|[\]\\]/g, '\\$&')`, (b) replaces `*` with `.*`, (c) wraps in `^...$` anchors. Extract into the shared mock utility from FR-034. | Must     | US-008    |
| FR-032 | In `service-registry.test.ts` (line 164), replace `pattern.replace('*', '')` with `pattern.replace(/\*/g, '')` to handle multiple `*` characters, or use the same glob-to-regex helper from FR-031 for consistency.                                                                                                                                                                                                                                                                                                      | Must     | US-008    |
| FR-033 | In `error-handling.unit.test.ts` (line 279), replace the naive HTML sanitization `input.replace(/<[^>]*>/g, '')` with a comment explaining this is a test assertion (not production sanitization) and use a more robust approach: either assert on the specific expected output or use a dedicated HTML-entity-encoding function. If the test is demonstrating that production code sanitizes correctly, update the test to call the actual production sanitizer.                                                        | Must     | US-008    |
| FR-034 | Extract the glob-to-regex mock helper into a shared test utility (`apps/core-api/src/__tests__/setup/mock-redis-keys.ts`) to avoid code duplication across 3+ test files.                                                                                                                                                                                                                                                                                                                                                | Should   | US-008    |

### Class 9 — Insecure Randomness in Test Infrastructure (WARNING)

| ID     | Requirement                                                                                                                                                                                                                                              | Priority | Story Ref |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| FR-035 | In `test-database.helper.ts` (line 425), replace `Math.random().toString(36).substr(2, 9)` with `crypto.randomUUID()` from the `node:crypto` built-in module. Update the ID format from `user-${Date.now()}-${random}` to `user-${crypto.randomUUID()}`. | Must     | US-009    |
| FR-036 | Audit `test-infrastructure/` for any other uses of `Math.random()` for ID generation and replace with `crypto.randomUUID()`.                                                                                                                             | Should   | US-009    |

---

## 5. Non-Functional Requirements

| ID      | Category      | Requirement                                                                                   | Target                                                    |
| ------- | ------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| NFR-001 | Performance   | Rate limiting middleware MUST NOT increase P95 response latency beyond threshold              | < 5ms added latency per request at P95                    |
| NFR-002 | Performance   | SSRF URL validation MUST NOT add measurable latency to Keycloak token operations              | < 0.1ms per URL validation call                           |
| NFR-003 | Performance   | Path traversal check MUST NOT add measurable latency to i18n file loading                     | < 0.1ms per path validation call                          |
| NFR-004 | Performance   | CSS sanitizer MUST handle theme CSS payloads up to 50KB without blocking                      | < 5ms for 50KB CSS input                                  |
| NFR-005 | Performance   | ReDoS-safe regex patterns MUST maintain O(n) time complexity                                  | < 10ms for 100K-char adversarial input                    |
| NFR-006 | Reliability   | All existing tests MUST continue to pass after security fixes                                 | 0 test regressions                                        |
| NFR-007 | Reliability   | Rate limiting MUST NOT interfere with automated tests; test setup MUST reset rate-limit state | All rate-limit counters cleared in test `beforeEach`      |
| NFR-008 | Security      | Zero open ERROR-severity GitHub Code Scanning alerts upon completion                          | 0 ERROR alerts                                            |
| NFR-009 | Security      | Zero open WARNING-severity GitHub Code Scanning alerts upon completion                        | 0 WARNING alerts                                          |
| NFR-010 | Coverage      | New security code MUST meet coverage threshold                                                | ≥ 85% line coverage for new security validation utilities |
| NFR-011 | Compatibility | No breaking API changes; all rate-limiting responses MUST use the standard error format       | Constitution Art. 6.2 compliant error body                |
| NFR-012 | Security      | GitHub Actions workflows MUST follow the principle of least privilege                         | No workflow job has permissions broader than required     |

---

## 6. Edge Cases & Error Scenarios

| #   | Scenario                                                                              | Expected Behavior                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Keycloak URL env var contains trailing slash (`https://kc.local:8443/`)               | `assertKeycloakUrl()` MUST normalize the URL (strip trailing slash) before hostname comparison. Must not false-positive block.                                                                                                                  |
| 2   | Keycloak URL env var is unset or empty                                                | Application MUST fail to start with a clear configuration error. Must not silently allow unrestricted SSRF.                                                                                                                                     |
| 3   | Realm name is URL-encoded (`%61%64%6d%69%6e` = "admin")                               | `validateRealmName()` MUST reject URL-encoded input (the existing `^[a-z0-9-]` pattern already rejects `%`). Verify with test.                                                                                                                  |
| 4   | Locale parameter is a valid BCP 47 tag with script subtag (`zh-Hans-CN`)              | `loadNamespaceFile()` MUST accept it — the path traversal check must not reject legitimate multi-segment locales.                                                                                                                               |
| 5   | Namespace parameter is exactly 64 characters (boundary)                               | MUST be accepted. 65 characters MUST be rejected.                                                                                                                                                                                               |
| 6   | SSE stream client opens 100 connections in rapid succession                           | Global `@fastify/rate-limit` MUST throttle connection attempts. The SSE endpoint's `rateLimit: false` config only disables per-request limiting for the long-lived connection.                                                                  |
| 7   | Rate limit exceeded during an active Keycloak login flow                              | The user MUST receive a clear `429` response with `Retry-After` header and actionable error message. Login state (PKCE code verifier) MUST NOT be corrupted.                                                                                    |
| 8   | Theme CSS contains `@import url('https://evil.com/steal.css')`                        | CSS sanitizer MUST strip `@import` rules to prevent CSS exfiltration.                                                                                                                                                                           |
| 9   | Theme CSS contains `background: url('javascript:alert(1)')`                           | CSS sanitizer MUST strip `javascript:` URLs in CSS `url()` values.                                                                                                                                                                              |
| 10  | Theme CSS contains legitimate `url('https://cdn.example.com/bg.png')`                 | CSS sanitizer MUST preserve valid HTTPS URLs in CSS `url()` values.                                                                                                                                                                             |
| 11  | GitHub Actions workflow uses a third-party action that requires `contents: write`     | The per-job `permissions:` block MUST explicitly grant it; the top-level `read-all` default MUST NOT be overridden globally.                                                                                                                    |
| 12  | Test mock Redis `keys()` receives pattern `prefix:*:suffix:*` with multiple wildcards | Glob-to-regex helper MUST handle multiple `*` characters correctly.                                                                                                                                                                             |
| 13  | `crypto.randomUUID()` not available in test Node.js runtime                           | MUST use `node:crypto` import (available since Node 14.17). If running on Node < 14.17, fall back to `crypto.randomBytes(16).toString('hex')`. Given Constitution Art. 2.1 requires Node ≥ 20, this is a non-issue but document the assumption. |

---

## 7. Data Requirements

No new database tables, columns, or migrations are required. All fixes
are in application code, test code, CI configuration, and frontend
components.

The only data-adjacent change is rate-limit state stored in Redis:

- Rate-limit keys follow the existing pattern: `rl:{module}:{tenantId}:{userId}` with TTL matching the window duration.
- No new Redis data structures are introduced beyond what `@fastify/rate-limit` and the existing `rateLimiter()` middleware already use.

---

## 8. API Requirements

No new API endpoints are introduced. Existing endpoints gain rate
limiting, which adds the following response to their API contract:

| Method | Path                                                                                                             | Change                                                                                                                                                                      |
| ------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ALL    | Routes in `tenant-admin.ts`, `jobs.routes.ts`, `search.routes.ts`, `notification.routes.ts`, `storage.routes.ts` | New 429 response: `{ error: { code: "RATE_LIMITED", message: "Too many requests. Please retry after {N} seconds", details: { retryAfter: N } } }` with `Retry-After` header |
| GET    | `/notifications/stream`                                                                                          | No change (SSE endpoint — global rate limit already covers connection establishment)                                                                                        |
| GET    | `/api/v1/auth/login`                                                                                             | Verified: `authRateLimitHook` already applied — CodeQL suppression comment added                                                                                            |

The 429 response format follows Constitution Art. 6.2.

---

## 9. UX/UI Notes

### Theme Preview CSS Sanitization (FR-023, FR-027)

- The `ThemePreview` component MUST continue to render custom CSS
  for tenant branding preview.
- Sanitization MUST be invisible to legitimate use cases — valid CSS
  properties, selectors, and HTTPS URLs must render correctly.
- If sanitization strips user CSS, the component SHOULD display an
  inline warning: "Some CSS rules were removed for security reasons."

### Logo URL Validation (FR-024, FR-025)

- If a tenant admin enters an invalid URL scheme, the form MUST
  display an inline validation error: "Logo URL must use HTTPS."
- The `<img>` tag MUST NOT render until the URL passes scheme validation.

### Rate Limiting UX

- When rate limited, API clients receive a `Retry-After` header.
- Frontend error handling should display: "You're making requests too
  quickly. Please wait {N} seconds."

---

## 10. Out of Scope

- **WAF/CDN-level rate limiting**: This spec covers application-level
  rate limiting only. Network-level protections are an infrastructure
  concern outside this spec.
- **Content Security Policy (CSP) headers**: While CSP would provide
  additional XSS defense-in-depth, implementing CSP headers across the
  platform is a separate feature (recommend a future spec).
- **Subresource Integrity (SRI)**: Not addressed in this spec.
- **CORS hardening**: Existing CORS configuration is not part of the
  CodeQL alerts and is out of scope.
- **Full HTML sanitization beyond DOMPurify scope**: DOMPurify handles
  CSS/HTML sanitization for the ThemePreview and admin settings use
  cases in scope. Any broader sanitization requirements (e.g.,
  user-generated rich text content) are a separate future spec.
- **Rate-limit configuration UI**: No admin UI for configuring rate
  limits. Limits are controlled via environment variables with sensible
  defaults (see §11 Q3).
- **Security audit of non-flagged code**: This spec addresses only the
  36 CodeQL alerts. A broader security audit is a separate effort.
- **Keycloak server hardening**: Only the Plexica client-side Keycloak
  integration is in scope, not the Keycloak server configuration itself.
- **Dependency vulnerability remediation**: `npm audit` / `pnpm audit`
  findings are tracked separately per Constitution Art. 5.4 and are
  not part of this CodeQL-focused spec.

---

## 11. Resolved Questions

> All questions from the initial draft have been resolved. No `[NEEDS
CLARIFICATION]` markers remain.

### Q1 — DOMPurify Adoption (FR-026) ✅ RESOLVED

**Decision**: Adopt DOMPurify (`^3.x`) as a project dependency. ADR-032
will be created alongside the implementation plan per Constitution Art. 2.2.

**Rationale**: DOMPurify is the de facto standard for DOM sanitization
(~10M weekly npm downloads, actively maintained, covers OWASP XSS cheat
sheet vectors). The ~17KB gzipped bundle cost is acceptable for a
security-critical library and can be lazy-loaded on admin settings pages
only.

### Q2 — SSE Stream Rate Limiting (FR-011) ✅ RESOLVED

**Decision**: The `config: { rateLimit: false }` on the SSE stream
endpoint is **intentionally correct**. The global `@fastify/rate-limit`
plugin guards connection establishment; per-request rate limiting is
meaningless for a long-lived SSE stream.

**Action**: Add a code comment explaining the justification, a CodeQL
suppression comment (`// lgtm[js/missing-rate-limiting]`) referencing
this spec, and an integration test verifying the global rate-limit
plugin is active on SSE connection attempts.

### Q3 — Rate Limit Values (FR-013) ✅ RESOLVED

**Decision**: Three-tier environment-configurable defaults:

| Environment Variable | Default     | Scope                                                   |
| -------------------- | ----------- | ------------------------------------------------------- |
| `RATE_LIMIT_AUTH`    | 20 req/min  | Auth endpoints (`auth.ts`)                              |
| `RATE_LIMIT_ADMIN`   | 60 req/min  | Admin endpoints (`tenant-admin.ts`, `jobs.routes.ts`)   |
| `RATE_LIMIT_GENERAL` | 120 req/min | General API (`search`, `notification`, `storage` reads) |

If the environment variable is not set, the default value is used.
Upload endpoints in `storage.routes.ts` use the `RATE_LIMIT_ADMIN` tier.

### Q4 — ReDoS Alerts (FR-029, FR-030) ✅ RESOLVED

**Decision**: Both patterns are **confirmed false positives**:

- `/\/+$/` (api-client.ts:40): simple quantifier on a single literal
  character — O(n), no alternation or nesting.
- `/member.*not found/i` (error-formatter.ts:227): single `.*` with
  literal suffix — O(n) per ECMA spec, no nesting.

**Action**: CodeQL suppression comments with inline linear-time proof,
plus regression benchmark tests with adversarial inputs confirming O(n)
behavior.

---

## 12. Implementation Scope

> **Note**: All paths are relative to the project root.

### New Components

| Component Type | Path                                                   | Description                                                                                                                    |
| -------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Utility        | `apps/core-api/src/services/keycloak-url-validator.ts` | SSRF prevention: `assertKeycloakUrl()` helper comparing constructed URLs against `KEYCLOAK_URL` allowlist                      |
| Utility        | `packages/ui/src/utils/sanitize-css.ts`                | CSS sanitization for `dangerouslySetInnerHTML` in ThemePreview — strips scripts, `@import`, `expression()`, `javascript:` URLs |
| Utility        | `packages/ui/src/utils/validate-image-url.ts`          | URL scheme validation for `<img src>` attributes — allowlists `https://`, `http://`, `data:image/`                             |
| Test Utility   | `apps/core-api/src/__tests__/setup/mock-redis-keys.ts` | Shared glob-to-regex mock for Redis `keys()` in test mocks                                                                     |
| Component      | `packages/ui/src/components/SafeImage/SafeImage.tsx`   | Reusable `<SafeImage>` component wrapping `<img>` with URL scheme validation                                                   |

### Modified Components

| Path                                                                        | Modification Type | Description                                                                                                                             |
| --------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/core-api/src/services/keycloak.service.ts`                            | Security Fix      | Add `assertKeycloakUrl()` call before `fetch()` at lines 681, 743, 801 (FR-001, FR-002)                                                 |
| `apps/core-api/src/modules/i18n/i18n.service.ts`                            | Security Fix      | Add path-resolve + prefix-check after `path.join()` at lines 178, 193; add Zod validation for locale/namespace (FR-005, FR-006, FR-007) |
| `apps/core-api/src/routes/tenant-admin.ts`                                  | Security Fix      | Apply rate limiting middleware to route plugin (FR-009)                                                                                 |
| `apps/core-api/src/routes/auth.ts`                                          | Fix/Suppression   | Verify `authRateLimitHook` is applied; add CodeQL suppression comment if needed (FR-010)                                                |
| `apps/core-api/src/modules/notifications/notification-stream.routes.ts`     | Fix/Suppression   | Apply rate limiting to non-stream endpoint; document SSE suppression (FR-011)                                                           |
| `apps/core-api/src/modules/jobs/jobs.routes.ts`                             | Security Fix      | Apply rate limiting middleware (FR-012)                                                                                                 |
| `apps/core-api/src/modules/search/search.routes.ts`                         | Security Fix      | Apply rate limiting middleware (FR-012)                                                                                                 |
| `apps/core-api/src/modules/notifications/notification.routes.ts`            | Security Fix      | Apply rate limiting middleware (FR-012)                                                                                                 |
| `apps/core-api/src/modules/storage/storage.routes.ts`                       | Security Fix      | Apply rate limiting middleware (FR-012)                                                                                                 |
| `packages/event-bus/src/services/topic-manager.ts`                          | Security Fix      | Replace `console.log`/`console.error` with Pino structured logging (FR-015)                                                             |
| `apps/plugin-analytics/backend/src/routes/analytics.routes.ts`              | Security Fix      | Replace `console.error` with Pino structured logging; fix `any` type (FR-016)                                                           |
| `apps/core-api/src/services/minio-client.ts`                                | Security Fix      | Replace `console.error` with Pino structured logging (FR-017)                                                                           |
| `.github/workflows/ci-tests.yml`                                            | Security Fix      | Add top-level `permissions: read-all` and per-job minimal permissions (FR-019, FR-020)                                                  |
| `.github/workflows/deploy.yml`                                              | Security Fix      | Add top-level `permissions:` with minimal scopes (FR-021)                                                                               |
| `packages/ui/src/components/ThemePreview/ThemePreview.tsx`                  | Security Fix      | Sanitize `scopedCss` before `dangerouslySetInnerHTML`; validate `logoUrl` scheme (FR-023, FR-024)                                       |
| `apps/web/src/routes/admin.settings.tsx`                                    | Security Fix      | Validate `logoUrl` scheme before rendering in `<img>` (FR-025)                                                                          |
| `packages/sdk/src/api-client.ts`                                            | Fix/Suppression   | Analyze regex; add suppression comment with benchmark test (FR-029)                                                                     |
| `apps/core-api/src/modules/workspace/utils/error-formatter.ts`              | Fix/Suppression   | Analyze regex patterns; add suppression or replace with `String.includes()` (FR-030)                                                    |
| `apps/core-api/src/__tests__/services/shared-data.test.ts`                  | Security Fix      | Replace naive glob-to-regex in mock Redis `keys()` (FR-031)                                                                             |
| `apps/core-api/src/__tests__/services/service-registry.test.ts`             | Security Fix      | Replace naive glob-to-regex in mock Redis `keys()` (FR-032)                                                                             |
| `apps/core-api/src/__tests__/plugin/unit/plugin-communication.unit.test.ts` | Security Fix      | Replace naive glob-to-regex in mock Redis `keys()` (FR-031)                                                                             |
| `apps/core-api/src/__tests__/unit/error-handling.unit.test.ts`              | Security Fix      | Replace naive HTML sanitization in test assertion (FR-033)                                                                              |
| `test-infrastructure/helpers/test-database.helper.ts`                       | Security Fix      | Replace `Math.random()` with `crypto.randomUUID()` (FR-035)                                                                             |

### Documentation Updates

| Path                               | Section          | Update Description                                                                       |
| ---------------------------------- | ---------------- | ---------------------------------------------------------------------------------------- |
| `docs/SECURITY.md`                 | SSRF Prevention  | Add section on Keycloak URL validation and SSRF prevention pattern                       |
| `docs/SECURITY.md`                 | Path Traversal   | Add section on i18n file-path validation pattern                                         |
| `docs/SECURITY.md`                 | Rate Limiting    | Document per-module rate limits and configuration                                        |
| `docs/SECURITY.md`                 | XSS Prevention   | Document CSS sanitization and URL scheme validation patterns                             |
| `docs/SECURITY.md`                 | Log Injection    | Document structured logging requirements for user-controlled values                      |
| `.forge/knowledge/decision-log.md` | Active Decisions | Add entry for DOMPurify adoption (ADR-032 approved) and ReDoS false-positive resolutions |

---

## 13. Dependencies

### Existing Dependencies (No ADR Required)

| Package               | Version   | Already In                   | Purpose                                                  |
| --------------------- | --------- | ---------------------------- | -------------------------------------------------------- |
| `@fastify/rate-limit` | `^10.3.0` | `apps/core-api/package.json` | Rate limiting for Fastify routes (FR-009 through FR-014) |
| `node:crypto`         | Built-in  | Node.js ≥ 20 runtime         | `crypto.randomUUID()` for test ID generation (FR-035)    |
| `node:path`           | Built-in  | Node.js runtime              | `path.resolve()` for path traversal prevention (FR-005)  |

### Approved New Dependency (ADR-032)

| Package                | Version | Weekly Downloads | Purpose                                           | ADR                               |
| ---------------------- | ------- | ---------------- | ------------------------------------------------- | --------------------------------- |
| `dompurify`            | `^3.x`  | ~10M             | CSS/HTML sanitization for XSS prevention (FR-026) | ADR-032 (to be created with plan) |
| `@types/dompurify`     | `^3.x`  | ~2M              | TypeScript types for DOMPurify                    | Bundled with ADR-032              |
| `isomorphic-dompurify` | `^2.x`  | ~500K            | SSR-compatible DOMPurify wrapper (if needed)      | Bundled with ADR-032              |

**Decision**: DOMPurify is adopted as a project dependency (see §11 Q1).
ADR-032 will be created during `/forge-plan` per Constitution Art. 2.2.
DOMPurify is the de facto standard for DOM sanitization, eliminates the
need for a custom CSS sanitizer, and covers the OWASP XSS cheat sheet
vectors. Bundle impact (~17KB gzipped) is mitigated by lazy-loading on
admin settings pages only.

---

## 14. Risk Register

| ID    | Risk                                                                                                                                                                                                                | Severity | Likelihood     | Mitigation                                                                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-001 | **SSRF fix breaks Keycloak admin calls**: `assertKeycloakUrl()` may false-positive block legitimate Keycloak API calls if the URL normalization logic differs between config parsing and runtime construction.      | HIGH     | LOW            | FR-004 requires explicit unit tests proving token exchange, refresh, and revoke succeed with valid `KEYCLOAK_URL`. Integration test against real Keycloak in CI.                                             |
| R-002 | **Rate limiting breaks automated tests**: Existing test suites make rapid sequential requests that may trigger the new rate limits.                                                                                 | MEDIUM   | MEDIUM         | NFR-007 requires rate-limit state reset in test `beforeEach`. Tests already reset `advanced-rate-limit` caches. Ensure new rate-limit middleware is also resettable.                                         |
| R-003 | **Rate limiting on tenant-admin routes causes UX degradation**: 60 req/min (RATE_LIMIT_ADMIN default) may be too restrictive for tenant admins managing teams in bulk.                                              | LOW      | LOW            | FR-013 makes limits environment-configurable. Operators can increase `RATE_LIMIT_ADMIN` without code changes. Consider higher defaults for admin roles in a follow-up.                                       |
| R-004 | **CSS sanitizer strips legitimate tenant CSS**: Aggressive sanitization may remove valid CSS properties that tenants use for branding.                                                                              | MEDIUM   | MEDIUM         | FR-027 requires tests for valid CSS pass-through. The sanitizer MUST be allowlist-based (permit known-safe CSS features) rather than denylist-based. Edge case #10 explicitly tests valid HTTPS URLs in CSS. |
| R-005 | **CodeQL false positives persist after fix**: Some alerts (ReDoS on `api-client.ts`, rate limiting on custom middleware routes) may be CodeQL false positives that cannot be resolved without suppression comments. | LOW      | MEDIUM         | FRs explicitly allow CodeQL suppression comments (`// lgtm[js/...]`) when the alert is a proven false positive, but require: (a) documented explanation, (b) regression test proving safety.                 |
| R-006 | **DOMPurify bundle size impact**: Adding DOMPurify adds ~17KB (gzipped) to the frontend bundle.                                                                                                                     | LOW      | HIGH (certain) | This is acceptable for a security-critical library. Can be loaded lazily only in admin settings pages where theme preview is used.                                                                           |
| R-007 | **GitHub Actions permissions too restrictive**: Minimal permissions may break CI steps that need write access (e.g., coverage upload, release creation).                                                            | MEDIUM   | MEDIUM         | FR-020 requires per-job permissions analysis. Test in a branch before merging to main.                                                                                                                       |

---

## 15. Definition of Done

All of the following MUST be true for this spec to be considered complete:

1. **Zero ERROR-severity alerts**: GitHub Code Scanning re-scan reports
   0 `js/request-forgery` alerts and 0 `js/path-injection` alerts.

2. **Zero WARNING-severity alerts**: GitHub Code Scanning re-scan
   reports 0 alerts for `js/missing-rate-limiting`,
   `js/tainted-format-string`, `actions/missing-workflow-permissions`,
   `js/xss-through-dom`, `js/polynomial-redos`,
   `js/incomplete-sanitization`,
   `js/incomplete-multi-character-sanitization`, and
   `js/insecure-randomness`.

3. **All existing tests pass**: `pnpm test` in `apps/core-api` reports
   0 failures. No test regressions.

4. **New tests added**: At minimum, unit tests for FR-004 (SSRF),
   FR-008 (path traversal), FR-014 (rate limiting), FR-018 (log
   injection), FR-027 (CSS sanitizer), FR-028 (URL validation),
   FR-029/FR-030 (ReDoS benchmarks).

5. **Coverage maintained**: Overall test coverage ≥ 80%. New security
   utility modules ≥ 85%.

6. **No breaking API changes**: All endpoints return the same response
   schema for success cases. Only the new 429 response is added.

7. **Documentation updated**: `docs/SECURITY.md` updated with new
   security patterns.

8. **CI passes**: All GitHub Actions workflows pass with the new
   permissions blocks.

9. **FORGE review passed**: `/forge-review` reports zero HIGH-severity
   findings.

---

## 16. Alert-to-FR Traceability Matrix

| Alert # | File                                | Line(s) | Class                   | Severity | FR(s)                  | Story  |
| ------- | ----------------------------------- | ------- | ----------------------- | -------- | ---------------------- | ------ |
| 1       | `keycloak.service.ts`               | 681     | SSRF                    | ERROR    | FR-001, FR-002         | US-001 |
| 2       | `keycloak.service.ts`               | 743     | SSRF                    | ERROR    | FR-001, FR-002         | US-001 |
| 3       | `keycloak.service.ts`               | 801     | SSRF                    | ERROR    | FR-001, FR-002         | US-001 |
| 4       | `i18n.service.ts`                   | 178     | Path Traversal          | ERROR    | FR-005, FR-006, FR-007 | US-002 |
| 5       | `i18n.service.ts`                   | 193     | Path Traversal          | ERROR    | FR-005, FR-006, FR-007 | US-002 |
| 6       | `tenant-admin.ts`                   | 260     | Missing Rate Limit      | WARNING  | FR-009                 | US-003 |
| 7       | `tenant-admin.ts`                   | 518     | Missing Rate Limit      | WARNING  | FR-009                 | US-003 |
| 8       | `tenant-admin.ts`                   | 546     | Missing Rate Limit      | WARNING  | FR-009                 | US-003 |
| 9       | `tenant-admin.ts`                   | 582     | Missing Rate Limit      | WARNING  | FR-009                 | US-003 |
| 10      | `auth.ts`                           | 255     | Missing Rate Limit      | WARNING  | FR-010                 | US-003 |
| 11      | `notification-stream.routes.ts`     | 123     | Missing Rate Limit      | WARNING  | FR-011                 | US-003 |
| 12      | `notification-stream.routes.ts`     | 154     | Missing Rate Limit      | WARNING  | FR-011                 | US-003 |
| 13      | `jobs.routes.ts`                    | 53      | Missing Rate Limit      | WARNING  | FR-012                 | US-003 |
| 14      | `search.routes.ts`                  | 56      | Missing Rate Limit      | WARNING  | FR-012                 | US-003 |
| 15      | `notification.routes.ts`            | 45      | Missing Rate Limit      | WARNING  | FR-012                 | US-003 |
| 16      | `storage.routes.ts`                 | 44      | Missing Rate Limit      | WARNING  | FR-012                 | US-003 |
| 17      | `topic-manager.ts`                  | 73      | Log Injection           | WARNING  | FR-015                 | US-004 |
| 18      | `topic-manager.ts`                  | 184     | Log Injection           | WARNING  | FR-015                 | US-004 |
| 19      | `analytics.routes.ts`               | 67      | Log Injection           | WARNING  | FR-016                 | US-004 |
| 20      | `minio-client.ts`                   | 66      | Log Injection           | WARNING  | FR-017                 | US-004 |
| 21      | `ci-tests.yml`                      | 22      | Actions Permissions     | WARNING  | FR-019, FR-020         | US-005 |
| 22      | `ci-tests.yml`                      | 53      | Actions Permissions     | WARNING  | FR-019, FR-020         | US-005 |
| 23      | `ci-tests.yml`                      | 319     | Actions Permissions     | WARNING  | FR-019, FR-020         | US-005 |
| 24      | `ci-tests.yml`                      | 370     | Actions Permissions     | WARNING  | FR-019, FR-020         | US-005 |
| 25      | `ci-tests.yml`                      | 412     | Actions Permissions     | WARNING  | FR-019, FR-020         | US-005 |
| 26      | `deploy.yml`                        | 10      | Actions Permissions     | WARNING  | FR-021                 | US-005 |
| 27      | `ThemePreview.tsx`                  | 89      | XSS                     | WARNING  | FR-023                 | US-006 |
| 28      | `ThemePreview.tsx`                  | 101     | XSS                     | WARNING  | FR-024                 | US-006 |
| 29      | `admin.settings.tsx`                | 242     | XSS                     | WARNING  | FR-025                 | US-006 |
| 30      | `api-client.ts`                     | 40      | ReDoS                   | WARNING  | FR-029                 | US-007 |
| 31      | `error-formatter.ts`                | 227     | ReDoS                   | WARNING  | FR-030                 | US-007 |
| 32      | `shared-data.test.ts`               | 136     | Incomplete Sanitization | WARNING  | FR-031                 | US-008 |
| 33      | `service-registry.test.ts`          | 164     | Incomplete Sanitization | WARNING  | FR-032                 | US-008 |
| 34      | `plugin-communication.unit.test.ts` | 245     | Incomplete Sanitization | WARNING  | FR-031                 | US-008 |
| 35      | `error-handling.unit.test.ts`       | 279     | Incomplete Sanitization | WARNING  | FR-033                 | US-008 |
| —       | `test-database.helper.ts`           | 425     | Insecure Randomness     | WARNING  | FR-035                 | US-009 |

> Note: Alert count in the original inventory lists 35 alerts across
> Classes 1–8. Class 9 (insecure randomness, 1 alert) was separately
> inventoried. The traceability matrix covers all 36 individual alert
> instances (35 original + 1 from Class 9 = 36, but alert #35 in
> error-handling.unit.test.ts is the 4th Class 8 alert, and the Class 9
> alert is the 36th row). Total alerts accounted for: **36**.
> Cross-check: 3 + 2 + 11 + 4 + 6 + 3 + 2 + 4 + 1 = 36. ✓

---

## 17. Constitution Compliance

| Article                           | Status                | Notes                                                                                                                                                                                                               |
| --------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1 — Core Principles          | ✅ Compliant          | Art. 1.2 Security First: This spec directly addresses 36 known security alerts. Art. 1.2.3 API-First: No breaking API changes; only additive 429 responses.                                                         |
| Art. 2 — Technology Stack         | ✅ Compliant          | `@fastify/rate-limit` already approved. `DOMPurify` adoption approved — ADR-032 to be created with the implementation plan per Art. 2.2. No other new dependencies.                                                 |
| Art. 3 — Architecture Patterns    | ✅ Compliant          | All fixes follow existing patterns: middleware hooks, service-layer validation, shared utilities. No new architectural patterns introduced.                                                                         |
| Art. 4 — Quality Standards        | ✅ Compliant          | NFR-006: 0 test regressions. NFR-010: ≥ 85% coverage for new security code. FR-004/008/014/018/027/028/029/030 require specific tests.                                                                              |
| Art. 5 — Security                 | ✅ Directly Addressed | Art. 5.3.1 (Zod validation): FR-006, FR-007. Art. 5.3.2 (SQL injection): No new SQL queries. Art. 5.3.3 (XSS): FR-023–FR-028. Art. 5.4 (Dependency security): FR-035, FR-036.                                       |
| Art. 6 — Error Handling           | ✅ Compliant          | NFR-011: Rate limit 429 responses follow Art. 6.2 format. FR-015–FR-017: Log injection fixes align with Art. 6.3 (Pino structured logging).                                                                         |
| Art. 7 — Naming & Conventions     | ✅ Compliant          | New files follow kebab-case. New utilities follow camelCase exports.                                                                                                                                                |
| Art. 8 — Testing Standards        | ✅ Compliant          | Art. 8.1: Unit tests for all security validation logic. Integration tests for rate limiting. Art. 8.2: Deterministic, independent, descriptive tests. Art. 8.3: No hardcoded IDs (FR-035 eliminates `Math.random`). |
| Art. 9 — Operational Requirements | ✅ Compliant          | Art. 9.1: No breaking migrations. Art. 9.2: No monitoring changes required (existing error-rate alerts cover 429 responses).                                                                                        |

---

## Cross-References

| Document                     | Path                                                       | Relevance                                                    |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| Constitution Art. 1.2        | `.forge/constitution.md` §1.2                              | Security First — no feature ships without security review    |
| Constitution Art. 2.2        | `.forge/constitution.md` §2.2                              | Dependency Policy — ADR required for new dependencies        |
| Constitution Art. 5.1        | `.forge/constitution.md` §5.1                              | Authentication & Authorization requirements                  |
| Constitution Art. 5.3        | `.forge/constitution.md` §5.3                              | Input Validation — Zod, SQL injection, XSS, CSRF prevention  |
| Constitution Art. 5.4        | `.forge/constitution.md` §5.4                              | Dependency Security — vulnerability patching SLAs            |
| ADR-032 (DOMPurify Adoption) | `.forge/knowledge/adr/ADR-032.md`                          | To be created with `/forge-plan` — approves DOMPurify dep    |
| Decision Log                 | `.forge/knowledge/decision-log.md`                         | TD-022, DOMPurify decision, ReDoS false-positive resolutions |
| Security Guide               | `docs/SECURITY.md`                                         | Updated by this spec with new security patterns              |
| Keycloak Service             | `apps/core-api/src/services/keycloak.service.ts`           | SSRF alerts (Class 1)                                        |
| i18n Service                 | `apps/core-api/src/modules/i18n/i18n.service.ts`           | Path traversal alerts (Class 2)                              |
| Rate Limiter Middleware      | `apps/core-api/src/middleware/rate-limiter.ts`             | Existing Redis rate limiter (Class 3)                        |
| Auth Rate Limiter            | `apps/core-api/src/middleware/auth-rate-limit.ts`          | Existing auth-specific rate limiter (Class 3)                |
| Advanced Rate Limiter        | `apps/core-api/src/lib/advanced-rate-limit.ts`             | Existing advanced rate limiter (Class 3)                     |
| ThemePreview Component       | `packages/ui/src/components/ThemePreview/ThemePreview.tsx` | XSS alerts (Class 6)                                         |
| Admin Settings Route         | `apps/web/src/routes/admin.settings.tsx`                   | XSS alert (Class 6)                                          |
| CI Workflow                  | `.github/workflows/ci-tests.yml`                           | Actions permissions alerts (Class 5)                         |
| Deploy Workflow              | `.github/workflows/deploy.yml`                             | Actions permissions alert (Class 5)                          |
| Plan                         | <!-- Created by /forge-plan -->                            |                                                              |
| Tasks                        | <!-- Created by /forge-tasks -->                           |                                                              |
