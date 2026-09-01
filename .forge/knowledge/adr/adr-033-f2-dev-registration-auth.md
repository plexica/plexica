# ADR-033 Addendum: Dev Registration Auth (F2)

**Part of**: [ADR-033](adr-033-publish-plugin-developer-packages.md) — split
out on 2026-08-29 so the parent ADR stays within the 200-line gate
(Constitution Rule 4).

**Date**: 2026-08-28

**Decision (implemented on `verify/plugin-bootstrap-dx`)**: move the dev-mode
plugin registration routes **outside the authenticated `tenantScope`** and gate
them with a dedicated `devRouteAuth` middleware
(`services/core-api/src/middleware/dev-route-auth.ts`), mirroring the existing
`pluginEventAuth` pattern.

**Context**: `devPluginRoutes` was mounted inside `tenantScope`, whose
`authMiddleware` requires a user JWT. `registerBackend()` from
`@plexica/sdk/dev` sends no `Authorization` header (a plugin dev process has no
user session), so every registration attempt returned **401** — the dev loop of
a freshly scaffolded plugin could never register. The CRM example worked only
because the core probes its backend core-side (`modules/plugin/index.ts`),
a mechanism hardcoded to one plugin, not reusable.

**New auth contract for `/api/v1/dev/plugins/*`**:
1. `NODE_ENV=development` (else 404 — routes are invisible outside dev).
2. Loopback-only client (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`; else 403).
3. Tenant resolved from the `X-Tenant-Slug` header via `resolveTenant()`
   (the header is already honored in non-production by
   `tenantContextMiddleware`, H-3). Unknown tenants → 400 (anti-enumeration);
   suspended / pending-deletion → 403 (ADR-022 alignment, M-4).

**Consequences**: dev registration requires no user identity — the trust
boundary is dev-mode + localhost + explicit tenant declaration. The SDK
`registerBackend`/`unregisterBackend` now require a `tenantSlug` argument and
send it as `X-Tenant-Slug`. The route's internal `isDev`/loopback checks are
retained as defense-in-depth. Covered by unit tests
(`__tests__/unit/dev-route-auth.test.ts`) and an integration test with a real
tenant (`__tests__/dev-plugin-registration.test.ts`).

**Hardening (second review pass, 2026-08-28)**:
- **Dev store tenant-scoped** (M-1): the in-memory dev registry moved to
  `modules/plugin/services/dev-plugin-store.ts`, keyed `tenantSlug:slug`.
  Register/unregister/list are all tenant-scoped, preventing cross-tenant
  conflicts and unregister of another tenant's dev backend. Covered by an
  integration test that registers the same slug in two tenants and unregisters
  in one without affecting the other.
- **ADR-022 alignment** (M-4): `devRouteAuth` now throws
  `TenantSuspendedError`/`TenantPendingDeletionError` (403) for suspended /
  pending-deletion tenants, mirroring the tenant path; unknown tenants stay 400
  (anti-enumeration).
- **Fail-closed NODE_ENV** (M-3): `devRouteAuth` reads `process.env.NODE_ENV`
  with an implicit `production` default instead of `config.NODE_ENV` (which
  defaults to `development` when unset, for local DX). A deployment that
  forgets `NODE_ENV` now gets 404 on the dev routes, not an open gate.
- Manifest contract pinned to the real Zod schema
  (`__tests__/unit/manifest-template-contract.test.ts`, M-2).
