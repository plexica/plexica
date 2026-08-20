# ADR-030: `@vitest/coverage-v8` — Coverage Provider for core-api Unit Tests

> Architectural Decision Record for adopting Vitest's V8 coverage provider
> (declared in the pnpm catalog) for `services/core-api`, with the Cobertura
> report shipped as a GitHub Actions artifact and pushed to GitHub Native
> Code Coverage (no external coverage SaaS).

| Field    | Value                                                        |
| -------- | ------------------------------------------------------------ |
| Status   | Accepted                                                     |
| Author   | forge-architect                                              |
| Date     | 2026-08-20                                                   |
| Deciders | Plexica Team (maintainer decision)                           |
| Spec     | — (PR #102, branch `code-coverage-agent/setup-code-coverage-reporting`) |
| Related  | Constitution Quality Standards (coverage >= 80%), `pnpm-workspace.yaml` catalog comment, `services/core-api/vitest.config.ts` |

---

## Context

The Constitution requires **>= 80% line coverage overall**
(`.forge/constitution.md:95`), and AGENTS.md defines a coverage target of
>= 80% line coverage for unit + integration tests. Today that target cannot
be measured, let alone enforced: no coverage provider is installed, and
**Vitest 4 does not bundle one** — the coverage providers
(`@vitest/coverage-v8`, `@vitest/coverage-istanbul`, ...) are explicit peer
dependencies that must be installed separately.

`pnpm-lock.yaml` confirms this: `@vitest/coverage-v8: 4.1.10` appears only
inside vitest's `peerDependencies` / `peerDependenciesMeta` block — no
workspace imports it, so it is not installed today. Running
`vitest --coverage` fails with `MISSING DEPENDENCY` (verified locally).

PR #102 (`code-coverage-agent/setup-code-coverage-reporting`) plans the
coverage reporting setup for `services/core-api` unit tests. The first step
is installing the provider; this ADR documents that step and the two
adjacent decisions (dependency placement, report destination).

---

## Decision

### 1. Adopt `@vitest/coverage-v8`

Install `@vitest/coverage-v8` as the coverage provider for `core-api` unit
tests. Version `4.1.10` (exact pin), matching the currently resolved
`vitest` version in the lockfile (`vitest@4.1.10` from the catalog entry
`vitest: ^4.1.10`). The exact pin keeps the provider and the Vitest core on
the same patch line; Vitest emits a "mixed versions" warning and may
misbehave when provider and core drift apart (verified locally: `^4.1.10`
resolved the provider to `4.1.11` against `vitest@4.1.10` until the pin was
tightened).

> **Maintenance note**: when the `vitest` catalog entry is bumped, the
> `@vitest/coverage-v8` pin in `pnpm-workspace.yaml` MUST be bumped to the
> same version in the same PR (Vitest 4 rejects running a coverage provider
> whose version does not match the core).

`coverage-v8` is Vitest's default and recommended provider: it instruments
via the V8 native coverage API (no Babel transform, no separate
transpilation step), which is the best fit for the ESM + TypeScript setup
of `core-api`.

### 2. Catalog entry in `pnpm-workspace.yaml` — not a plain devDependency

`@vitest/coverage-v8` is declared in the pnpm **catalog**
(`pnpm-workspace.yaml`, version `4.1.10`, exact pin) and referenced from
`services/core-api/package.json` as `"@vitest/coverage-v8": "catalog:"`.

Rationale (maintainer decision): the catalog is the single source of truth
for dependency versions across the monorepo; declaring the provider there
makes the coordinated bump of `vitest` + `@vitest/coverage-v8` a one-line
change and avoids a stray version pin drifting from the rest of the tooling.
The catalog convention comment in `pnpm-workspace.yaml` names dependencies
shared by >= 2 workspaces; while coverage is currently scoped to
`core-api`, the provider version is inherently coupled to the workspace-wide
`vitest` version and belongs next to it. This deviates from the literal
"shared by >= 2 workspaces" rule on purpose and is recorded here so the
catalog comment can be kept accurate.

### 3. Report destination: GitHub Actions artifact + GitHub Native Code Coverage

The Cobertura XML report is uploaded as a GitHub Actions artifact of the CI
run and pushed to **GitHub Native Code Coverage** via
`actions/upload-code-coverage@v1` (label `code-coverage-agent`,
language TypeScript). **No external coverage service** (Codecov, Coveralls,
SonarQube) is added.

Rationale (maintainer decision): `upload-code-coverage` is a first-party
GitHub action writing into GitHub's own code-coverage view — zero extra
tokens/secrets in CI, zero new external dependencies, data stays inside
the GitHub boundary. Only the `code-quality: write` permission is added to
the CI job (alongside the `actions: write` needed for the artifact upload).
The artifact remains downloadable for full Cobertura inspection; the native
view gives reviewers an at-a-glance percentage on the PR.

---

## Alternatives Considered

| Alternative | Tradeoff | Verdict |
| --- | --- | --- |
| **`@vitest/coverage-istanbul`** | Alternative provider with Babel-style instrumentation: slower on ESM, no longer the Vitest default. `@vitest/coverage-v8` is the documented default and aligns with the V8-native instrumentation already used by Node 24 | Rejected — v8 is the default, faster, and version-aligned with the vitest catalog |
| **Inline devDependency only (no catalog)** | First draft of this ADR: single-workspace dep as a plain devDependency, per the literal catalog comment. After review, the maintainer decision is the catalog entry — provider and vitest versions stay together | Rejected — catalog entry is the decision (see Decision 2) |
| **Codecov / Coveralls upload** | Hosted coverage with PR comments, diff coverage, and trend history — but requires a repository token secret in CI, adds an external dependency, and sends coverage data outside the repo | Rejected — maintainer decision: GitHub Native only; zero tokens, zero external services |
| **Thresholds only, no report artifact** | `coverage.thresholds` in the Vitest config enforces the 80% gate without any human-visible report; a failed gate shows only numbers in CI logs | Rejected — enforcement without a downloadable report gives reviewers no way to inspect *where* coverage is missing; the artifact is the point of the PR |

---

## Consequences

### Positive

- `vitest --coverage` works in `core-api`; the unit-test coverage of
  `services/core-api` is now measurable via the uploaded Cobertura artifact
  and visible in the GitHub Native Code Coverage view.
- Enables the AGENTS.md coverage metrics (>= 80% line coverage,
  unit + integration) to be **tracked** — the report is downloadable from
  every CI run.
- V8-native instrumentation is fast and requires no Babel transform —
  minimal impact on the existing unit test suite.
- No new secrets, no external SaaS; the only new CI permission is
  `code-quality: write` (plus the `actions: write` used by the existing
  artifact uploads).
- Provider version (`4.1.10`) is pinned in the catalog to the currently
  resolved `vitest` core version, avoiding provider/core drift until the
  next coordinated bump.

### Negative / Trade-offs

- **Coverage is unit-only and not yet gated**: the Cobertura report measures
  only files loaded by the unit project (`all: false` in the Vitest config) —
  integration-only paths (DB/Keycloak/Kafka) are not measured. No
  `coverage.thresholds` are enforced yet: enabling a gate today would fail CI
  (measured unit line coverage is ~17%). Enforcing the Constitution's
  >= 80% unit + integration target is a follow-up that requires running
  coverage across both projects and setting thresholds at the measured value
  with a ramp-up plan.
- **Catalog convention deviation**: the provider is in the catalog although
  only `core-api` consumes it today — justified by the version coupling with
  the workspace-wide `vitest` entry and recorded in Decision 2.
- **No coverage trend history**: artifacts expire (7-day retention by
  convention, as used for the Playwright reports in `ci.yml`); the GitHub
  Native view keeps per-PR percentages but not a long-term trend dashboard.
- **No PR diff-coverage annotations**: GitHub's native coverage view is
  not a full diff-coverage SaaS. Diff-level "new lines uncovered"
  annotations remain a SaaS feature that this decision explicitly forgoes.
- Marginal install-time and lockfile growth from the provider's transitive
  dependencies (`@bcoe/v8-coverage`, `istanbul-*` report tooling, ...).

### Neutral

- The `vitest` catalog entry is unchanged; the provider entry sits next to
  it in `pnpm-workspace.yaml`.

---

## Constitution Compliance

| Rule | Status |
| --- | --- |
| Rule 2: No merge without green CI | **COMPLIANT** — coverage runs in the existing CI test step; the gate remains blocking |
| Rule 3: One pattern per operation | **COMPLIANT** — a single coverage provider (`@vitest/coverage-v8`) is used for the monorepo; version managed in the pnpm catalog |
| Rule 5: ADR for significant decisions | **COMPLIANT** — new dependency documented in this ADR before implementation |
| Quality Standards: coverage >= 80% | **PARTIALLY SUPPORTED** — this ADR makes unit coverage measurable and downloadable; enforcing the 80% unit + integration gate is a documented follow-up (see Trade-offs) |