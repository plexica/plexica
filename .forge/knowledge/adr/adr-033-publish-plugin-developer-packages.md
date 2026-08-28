# ADR-033: Publish Plugin Developer Packages to GitHub Packages

**Status**: Accepted
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

1. **Publish to GitHub Packages** (`https://npm.pkg.github.com`) under the
   `plexica` GitHub organization, as **public** packages:
   - `@plexica/create-plexica-plugin` (CLI — **scoped**: GitHub Packages only
     supports scoped npm packages, so the CLI is `@plexica/create-plexica-plugin`
     with bin `create-plexica-plugin`)
   - `@plexica/sdk`
   - `@plexica/vite-plugin`
   - `@plexica/ui`
   GitHub Packages is chosen over the public npm registry so distribution
   stays inside the organization's GitHub account (visibility + audit
   control), while public access lets any GitHub-authenticated developer
   install the packages for plugin development.
2. **Remove `catalog:` protocol from the published packages.** Catalog entries
   are a monorepo-internal mechanism; any dependency of a publishable package
   must use a real semver range — in `dependencies`, `peerDependencies` AND
   `devDependencies` (they all ship in the published manifest). Replaced with
   the catalog's resolved versions (`pg ^8.23.0`, `@originjs/vite-plugin-federation ^1.4.1`,
   `@fontsource/inter ^5.3.0`, `@radix-ui/react-dropdown-menu ^2.1.24`,
   `lucide-react ^1.33.0`, plus every devDependency).
3. **Add a release pipeline**: GitHub Actions workflow
   (`.github/workflows/publish-packages.yml`) triggered by semver tags
   (`v*`) AND manual `workflow_dispatch` with a package selector, publishing
   each package with `pnpm publish --registry https://npm.pkg.github.com`
   authenticated via the built-in `GITHUB_TOKEN` (permissions:
   `packages: write`). `concurrency` group prevents racing publishes; an
   empty dispatch selection fails loudly. Tags make releases traceable;
   dispatch covers quick fixes without a tag.
4. **Add a publishability check to CI** (`.github/workflows/publishability-check.yml`,
   extracted so `ci.yml` stays under the 200-line gate): every publishable
   package must have a scoped `@plexica/*` name, no `private: true`, no
   `catalog:` specifier anywhere, `publishConfig.registry` =
   `https://npm.pkg.github.com`, `publishConfig.access` = `public`, and
   `pnpm publish --dry-run` must succeed.
5. **Ship TypeScript sources in the published tarballs** where exports point
   at them: `@plexica/sdk` `development` conditions point at `.ts` sources
   (`./src/index.ts`, `./dev/index.ts`) for tsx consumers, while the `types`
   conditions point at compiled `dist/**/*.d.ts` so plain `tsc` consumers do
   not need to type-check raw sources. `@plexica/ui` exports `.ts` sources
   directly (`./src/index.ts`, `./tailwind-preset.ts`) as a source package —
   the same pattern `apps/web` and `apps/admin` already use via Vite.
   `files` allowlists exclude `*.tsbuildinfo`.
6. **Fix the CLI bin for publish**: `create-plexica-plugin`'s bin was
   TypeScript source imported as `.js`. Converted to
   `bin/create-plexica-plugin.ts`, compiled by `tsc -p tsconfig.build.json`
   into `dist/bin/`, with `bin` → `./dist/bin/create-plexica-plugin.js`.
7. **SDK types for consumers**: `@types/pg` moved to `dependencies` (the
   compiled `.d.ts` import `pg` types); `types` conditions point at
   `dist/**/*.d.ts`, so a consumer `tsc` resolves without extra config.
8. **Build on publish, not on install**: the three built packages use a
   `prepublishOnly` script (`pnpm build`) instead of `prepare`. `prepare`
   also runs on `pnpm install` inside monorepo context builds (e.g. the CRM
   E2E Dockerfile copies only `package.json` files before install), which
   broke `pnpm install --frozen-lockfile` there. `prepublishOnly` builds only
   when `pnpm publish` runs — verified it also executes on `--dry-run`.

## Consumer Setup (GitHub Packages)

Consumers configure the token at **user level** (pnpm >= 10.34.2 ignores env
placeholders in project-level `.npmrc`, GHSA-3qhv-2rgh-x77r):

```ini
# ~/.npmrc (user level) — token NEVER in the project .npmrc
@plexica:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

The generated plugin template ships a project `.npmrc` with only the
registry-scope line (safe to commit) and documents the user-level token
setup in comments. The packages are public, so any GitHub user with a token
(or a `~/.npmrc` auth) can install them.

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
- **CLI name change**: `create-plexica-plugin` is published as
  `@plexica/create-plexica-plugin` (required by GitHub Packages). The docs
  invocation becomes `npx @plexica/create-plexica-plugin`. The bin name stays
  `create-plexica-plugin`, so once installed the command is unchanged.
- `@plexica/ui` is a large surface; publishing it requires a stable
  `files` allowlist and export map, and its React/Tailwind peers must be
  declared correctly. It is a source package (`.ts` exports) — consumers must
  use a bundler that resolves TypeScript (Vite does; plain Node does not).
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

This ADR is **Accepted** (2026-08-28): the registry decision is GitHub
Packages under the `plexica` organization, public access, triggered by semver
tags + `workflow_dispatch`. Implementation on `verify/plugin-bootstrap-dx`
survived dual-model review (3 HIGH findings fixed: scoped CLI name for GH
Packages, publishability check extracted from `ci.yml` to stay under the
200-line gate, user-level npm token for pnpm >= 10.34.2). A real
(non-dry-run) publish smoke test against `npm.pkg.github.com` on a scratch
version remains the definitive pre-release gate.

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