# ADR-033: Publish Plugin Developer Packages to npm

**Status**: Proposed
**Date**: 2026-08-28
**Deciders**: Plexica Team and user
**Related**: ADR-010 (Keycloak theme); docs/01-SPECIFICHE.md §7.2 ("Livello 1 —
CLI di scaffolding": `npx create-plexica-plugin`); docs/02-ARCHITETTURA.md §7.3;
branch `verify/plugin-bootstrap-dx` (verification report)

## Context

The verification on `verify/plugin-bootstrap-dx` simulated a developer creating
a **new standalone plugin project in a new git repository** outside the
monorepo. The intended developer experience is `npx create-plexica-plugin
my-plugin` followed by `pnpm install` / `pnpm dev` / `pnpm build` in the
generated repository.

The verification proved this flow is **blocked at install time**:

1. `create-plexica-plugin` is `"private": true` and never published — there is
   no npm package to run.
2. The generated project depends on `@plexica/sdk` and `@plexica/vite-plugin`,
   both `"private": true` and unpublished. `pnpm install` fails with
   `ERR_PNPM_FETCH_404` on both (reproduced twice in the harness).
3. Even with `file:` links to the monorepo packages, install fails again
   because both packages declare dependencies via the `catalog:` protocol,
   which is resolved only inside the pnpm workspace that defines the catalog.
   `@plexica/ui` (a shared Module Federation dependency of every plugin)
   is likewise unpublished and catalog-dependent.

The templates themselves were fixed on the verification branch (G4–G16), so a
generated project now type-checks, builds, and runs its dev loop once its
dependencies are resolvable. The remaining blocker is purely distribution.

## Decision

1. **Publish to the public npm registry** (or, if the team requires private
   distribution, a private registry accessible to plugin developers):
   - `create-plexica-plugin` (CLI)
   - `@plexica/sdk`
   - `@plexica/vite-plugin`
   - `@plexica/ui`
2. **Remove `catalog:` protocol from the published packages.** Catalog entries
   are a monorepo-internal mechanism; any dependency of a publishable package
   must use a real semver range. The shared catalog can still drive the
   version used in the workspace, but the package manifest must not ship
   `catalog:` specifiers.
3. **Add a release pipeline** for these packages (e.g. GitHub Actions workflow
   triggered on tag/version bump) so plugin developers can consume stable
   versions, and the template's `^0.1.0` / `^0.0.1` ranges resolve.
4. **Add a publishability check to CI** (e.g. `pnpm publish --dry-run` or a
   `files`/`exports` validation step) to prevent `private: true` or
   `catalog:` specifiers from regressing into published manifests.
5. **Ship TypeScript sources in the published tarballs**: both `@plexica/sdk`
   exports (`"."` and `"./dev"`) map the `types` and `development` conditions
   to `.ts` sources (`./src/index.ts`, `./dev/index.ts`), and `@plexica/ui`
   may do the same. A `files` allowlist must therefore include `src/` and
   `dev/` (plus `dist/` for the `import` condition), or consumers using
   `tsx`/the `development` condition will fail to resolve after install.

## Consequences

**Positive**:
- Unblocks the core developer-experience promise of v2 (docs/01-SPECIFICHE.md
  §7.2 and docs/02-ARCHITETTURA.md §7.3): a developer can scaffold, install,
  and iterate on their own plugin in their own repository.
- `@plexica/sdk`, `@plexica/vite-plugin`, `@plexica/ui`, and the CLI become
  versioned, consumable artifacts instead of monorepo internals.
- The E2E "external developer" flow (create → git init → install → dev →
  build) becomes testable in CI against the published artifacts.

**Negative / risks**:
- Public npm exposure of the SDK surface is a new trust boundary: API changes
  become breaking changes. Requires a semver policy and public API review
  before first publish.
- `@plexica/ui` is a large surface; publishing it requires a stable
  `files` allowlist and export map, and its React/Tailwind peers must be
  declared correctly.
- The CLI currently has no runtime dependencies and its `bin` entry is
  hand-copied (`bin/create-plexica-plugin.js` imports `../src/index.js`); a
  publish step must build the CLI first (or the bin must be made
  self-contained) so the published package actually runs.
- Monorepo `pnpm-lock.yaml` and workspace resolution are unaffected: these
  changes are additive (publish config, real version ranges, CI step).

## Alternatives Considered

- **Keep packages monorepo-private and document "develop inside the
  monorepo"** — rejected: contradicts the stated v2 goal (docs/01-SPECIFICHE.md
  §7.2) that a developer never touches monorepo internals and works in their
  own project.
- **Publish tarballs from CI without npm registry** — workable for internal
  teams but does not give the `npx create-plexica-plugin` experience and
  complicates dependency resolution for `@plexica/*` transitive deps.
- **Generate the plugin project with `file:`/`link:` references into a
  checked-out monorepo** — rejected: couples the developer to the monorepo
  layout and version, defeating standalone development.

## Status Note

This ADR is **Proposed**: the verification branch fixes (G4–G16) are merged
independently, but publishing (G1–G3) requires a team decision on registry
target (public vs private), semver policy, and release automation before
implementation.

---

## Addendum 2026-08-28: Dev Registration Auth (F2)

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
   `tenantContextMiddleware`, H-3). Unknown/suspended tenants → 400.

**Consequences**: dev registration requires no user identity — the trust
boundary is dev-mode + localhost + explicit tenant declaration. The SDK
`registerBackend`/`unregisterBackend` now require a `tenantSlug` argument and
send it as `X-Tenant-Slug`. The route's internal `isDev`/loopback checks are
retained as defense-in-depth. Covered by unit tests
(`__tests__/unit/dev-route-auth.test.ts`) and an integration test with a real
tenant (`__tests__/dev-plugin-registration.test.ts`).