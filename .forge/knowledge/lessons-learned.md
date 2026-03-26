# Lessons Learned from Plexica v1

> Institutional memory from the v1 codebase analysis. These mistakes must not
> be repeated in v2. Every lesson follows the format: **problem** then **v2 rule**.

**Date**: March 2026

---

## Testing

- **4000+ tests that tested mocks, not the real system.** v1 had an `isTestToken`
  bypass and a separate `test-app.ts` that diverged from the production app
  startup. Tests passed in CI but the app didn't work in staging. Entire test
  suites exercised fake code paths that production never hit.
  **v2 rule**: No test infrastructure that diverges from production. Integration
  and E2E tests run against the real Fastify app with real middleware. No
  `isTestToken`, no shadow app factory.

- **Integration tests that only tested the happy path.** Most v1 tests verified
  "create tenant succeeds" but never checked unauthorized access, wrong-tenant
  requests, or malformed input. Cross-tenant isolation bugs shipped to staging
  undetected.
  **v2 rule**: Every feature's E2E tests must cover the sad path — unauthorized,
  wrong tenant, invalid input, rate-limited. Acceptance criteria must include
  negative cases.

---

## Architecture & Over-Engineering

- **33 ADRs, 19 specs, 9-article constitution — most features not implemented.**
  The ratio of governance artifacts to working code was inverted. Planning
  consumed more effort than building.
  **v2 rule**: 5 simple rules in the constitution. ADRs only for genuinely
  significant decisions. Lightweight specs. Ship working software first.

- **Service Registry that nobody used.** Built for a hypothetical future where
  dozens of plugins would discover each other dynamically. Zero plugins ever
  used it.
  **v2 rule**: YAGNI. Don't build infrastructure until a real plugin needs it.

- **Container orchestration via Dockerode.** Over-engineered plugin deployment
  that managed container lifecycles from Node.js. Plugins are just HTTP
  servers behind a reverse proxy.
  **v2 rule**: Simplest thing that works. Plugins are processes; orchestration
  is Docker Compose in dev, Kubernetes in prod.

- **7+ lifecycle states for plugins.** PENDING_INSTALL, INSTALLING, INSTALLED,
  ACTIVATING, ACTIVE, DEACTIVATING, DEACTIVATED, UNINSTALLING, UNINSTALLED.
  Only 3 states matter to users or the system.
  **v2 rule**: 3 states — `installed`, `active`, `uninstalled` (ADR-009).

- **5 Extension Points tables.** `extension_slots`, `extension_contributions`,
  `workspace_extension_visibility`, `extensible_entities`, `data_extensions`.
  Complex schema for a feature that could be a manifest file plus one table.
  **v2 rule**: Plugin manifest declares extension points. One
  `workspace_plugin_visibility` table tracks what's enabled where.

- **Dual-model AI adversarial review (Claude + GPT-Codex).** Slow, expensive,
  findings often contradictory or low-value. Mandatory on every PR, adding
  friction without proportional quality improvement.
  **v2 rule**: Human code review is sufficient. Use AI assistance for
  implementation, not as a review gate.

---

## Frontend / UX

- **3 data fetching patterns.** Some pages used raw `fetch`, some used axios
  directly, some used TanStack Query. Inconsistent caching, error handling,
  and loading states across the app.
  **v2 rule**: One pattern — TanStack Query everywhere. No raw fetch, no
  direct axios calls from components.

- **3 form patterns.** Uncontrolled inputs in some forms, controlled +
  `useState` in others, react-hook-form in the rest. Validation logic
  duplicated and inconsistent.
  **v2 rule**: One pattern — react-hook-form + Zod everywhere.

- **2 auth stores.** One in React Context, one in Zustand. State drifted out
  of sync, causing "logged in but unauthorized" bugs.
  **v2 rule**: One store — Zustand. Single source of truth for auth state.

- **JetBrains Mono font, emoji as icons, `window.confirm()`.** No design
  system. Unprofessional, inconsistent UX across the platform.
  **v2 rule**: Design system from Day 0. Inter font, Radix UI primitives,
  Lucide icons, Sonner toasts. No browser dialogs.

- **Route files 500-1000 lines long.** Business logic, data fetching, and
  rendering all in one file. Unreadable and unmaintainable.
  **v2 rule**: No file above 200 lines. Route files handle routing only;
  logic lives in hooks and services.

- **Module Federation config exposed to plugin developers.** Plugin authors had
  to understand webpack Module Federation internals to build a plugin.
  **v2 rule**: MF is hidden behind `@plexica/vite-plugin` and a CLI
  scaffolding tool. Plugin developers never see MF config.

---

## Code Quality

- **`console.log` in production code.** Some code paths used `console.log`
  instead of structured logging. Logs were unstructured, unsearchable, and
  missing context (tenant ID, request ID).
  **v2 rule**: Pino structured JSON logging only. `console.log` is a lint
  error. Every log line includes `tenantId` and `requestId`.

- **Dead code everywhere.** `apps/plugins/` directory, unused `App.tsx`,
  orphaned `pages/` and `views/` directories, `packages/config/` with zero
  imports. Hundreds of files that served no purpose.
  **v2 rule**: Clean repo from day one. Zero dead code. Enforced in PR review
  and with `knip` or similar dead-code detection.

- **Plugin SDK with 6 classes.** `DataExtensionClient`, `EventBusClient`,
  `ApiClient`, `ConfigClient`, `StorageClient`, `PluginContext`. Plugin
  developers had to instantiate and coordinate multiple objects.
  **v2 rule**: One class — `PluginSDK` with methods: `onEvent`, `callApi`,
  `getContext`, `getDb` (ADR-009).

---

## Security

- **Security patterns applied late (Spec 015, sprint 9 of 9).** Rate limiting,
  Zod input validation, CSRF protection, and CSP headers were added as a
  hardening pass at the end of the project rather than from the start.
  Vulnerabilities existed in production for months.
  **v2 rule**: Security from Phase 0. Every endpoint has rate limiting, Zod
  validation, and parameterized queries from its first commit. No "hardening
  sprint" — security is not a phase.

---

## Infrastructure

- **3-node Kafka cluster in dev environment.** Full replication topology for
  local development. Slow to start, resource-hungry, unnecessary.
  **v2 rule**: Single-node Redpanda for dev (fast, Kafka-compatible). Cluster
  topology only in staging and production (ADR-004).

- **Fragile test infrastructure scripts.** `test-setup.sh`, `test-check.sh`,
  `test-reset.sh` had race conditions — services started before dependencies
  were ready, causing flaky CI.
  **v2 rule**: Docker Compose with health checks and `depends_on` conditions.
  No shell scripts for service orchestration. `wait-for-it` patterns built
  into compose, not bolted on.

---

_This document is the institutional memory of the project. Reference it during
design reviews and when evaluating new approaches. If a proposed solution
resembles a v1 mistake listed here, it requires explicit justification for
why it will be different this time._
