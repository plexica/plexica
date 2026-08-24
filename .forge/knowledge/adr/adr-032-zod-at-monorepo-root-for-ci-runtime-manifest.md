# ADR-032: Zod at the Monorepo Root for the CI Runtime Manifest

**Status**: Accepted
**Date**: 2026-08-24
**Deciders**: Plexica Team and user
**Related**: ADR-031; AGENTS.md coding guidelines ("Validazione input: schema
Zod su tutti gli input esterni")

## Context

The CI runtime host manifest (`host.env`, produced by the docker-infra action
and read by `e2e/ci-runtime-manifest.ts`) is external input parsed with a
hand-rolled line splitter plus per-key checks. The repository guideline
requires a Zod schema for all external input. The manifest reader lives in the
root `e2e/` directory, which intentionally has no `node_modules` of its own;
module resolution walks up to the root `package.json`. Zod was already a
catalog dependency of `apps/web`, `apps/admin`, `services/core-api`, and
`packages/api-types`, but not of the root, so importing it from `e2e/` would
fail to resolve for Playwright config evaluation.

## Decision

1. Add `zod` (via the existing catalog entry, `^3.25.76`) as a **root
   devDependency**. It remains test-infrastructure-only: no runtime service or
   frontend bundle gains a new dependency, and the version stays pinned by the
   shared catalog.
2. Rewrite `e2e/ci-runtime-manifest.ts` validation on top of that schema,
   preserving the established semantics (strict `127.0.0.1` loopback URLs with
   explicit ports, explicit IPv6 rejection, credential regexes, Keycloak
   host-admin/issuer equality, bounded `KAFKA_BROKERS`) and error message
   quality (`Invalid CI host manifest entry <KEY>`).

## Consequences

- External-input validation follows one pattern everywhere; the hand-rolled
  per-key checks and both type casts disappear.
- Root lockfile gains exactly one resolved package already present in the
  store, so install cost is nil.
- Any future root-level tooling may reuse the same validated dependency
  without a further ADR unless it moves into production code paths.
