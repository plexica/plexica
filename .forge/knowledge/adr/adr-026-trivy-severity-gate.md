# ADR-026: Trivy SCA Gate — Pinned Action, CRITICAL/HIGH Severity, Ignore Unfixed

> Architectural Decision Record documenting the pinning of `aquasecurity/trivy-action`
> and the scoping of the SCA merge gate to CRITICAL/HIGH vulnerabilities with an
> available fix.

| Field    | Value                                                 |
| -------- | ----------------------------------------------------- |
| Status   | Accepted                                              |
| Author   | forge-orchestrator                                    |
| Date     | 2026-08-17                                            |
| Deciders | Platform team                                         |
| Spec     | — (codebase review, `review/codebase-revision`)       |
| Related  | Constitution Security section, `.github/workflows/sca.yml` |

---

## Context

`.github/workflows/sca.yml` runs a Trivy filesystem scan on every PR and push
to `main`. Two problems were identified during codebase review:

1. **Unpinned action.** The scan step used `aquasecurity/trivy-action@master` —
   the only unpinned action in the repository. An action tracking a moving
   branch executes arbitrary updated code without review. In a *security*
   workflow this is especially serious: the scanner itself becomes a
   supply-chain risk. `dependabot.yml` monitors the `github-actions` ecosystem
   but cannot propose updates for a branch ref.

2. **Noisy gate.** The step had `exit-code: 1` with no `severity` filter and no
   `ignore-unfixed`. Any vulnerability at any severity — including LOW and
   UNKNOWN, including CVEs with no patch available — blocked the merge. A gate
   that fails on findings the team cannot act on trains contributors to treat
   CI failures as noise.

The project targets zero critical/high production vulnerabilities as a success
metric (`.forge/specs/007-consolidation/spec.md:94`, "Security vulnerabilities
(critical/high): 0") and the Security section of the Constitution
(`.forge/constitution.md:118`) requires dependency auditing. Literal
enforcement of that target via an unfiltered Trivy gate is not operable in
practice: the first unfixed upstream CVE would freeze all merges indefinitely.
Constitution Rule 2 ("No merge without green CI") is not at stake here: the
gate remains blocking, just scoped to actionable findings.

---

## Decision

1. **Pin the action** to the latest stable release:
   `aquasecurity/trivy-action@v0.36.0` (released 2026-04-22, verified via the
   GitHub Releases API; no bare `0.36.0` tag exists). Dependabot can now
   propose version bumps as reviewable PRs.

2. **Scope the gate by severity**: `severity: 'CRITICAL,HIGH'`. MEDIUM, LOW and
   UNKNOWN findings are still reported in the scan output but do not fail the
   pipeline.

3. **Ignore unfixed vulnerabilities**: `ignore-unfixed: true`. CVEs with no
   available fix do not fail the pipeline; they remain visible in the report
   for manual tracking.

---

## Alternatives Considered

### A. Keep the rigid gate (any severity, include unfixed)

Rejected. Blocks merges on CVEs the team cannot fix (no upstream patch) and on
LOW/UNKNOWN findings of negligible practical risk. A gate that cannot pass is
a gate that gets bypassed.

### B. Pin only, without severity scoping

Rejected. Pinning fixes the supply-chain problem but leaves the noisy gate:
the next unfixed CRITICAL in a transitive dependency still freezes all merges.

### C. Pin to a full commit SHA instead of a version tag

Deferred. SHA pinning is the strongest supply-chain control, but trivy-action
version tags are official releases maintained by Aqua Security and Dependabot
handles tag bumps natively with readable diffs. Revisit if the threat model
changes.

---

## Consequences

### Positive

- The security scanner is itself pinned and auditable; Dependabot can manage
  its updates (`dependabot.yml` already covers the `github-actions` ecosystem).
- The merge gate fails only on actionable findings: CRITICAL/HIGH
  vulnerabilities with an available fix.
- MEDIUM/LOW/UNKNOWN and unfixed findings remain visible in CI logs for
  triage — signal is preserved, noise is removed.

### Negative / Trade-offs

- **Deliberate relaxation of the zero-vulnerability target** (spec 007 success
  metric and the Constitution Security section, not Rule 2 — which is about
  green CI). The gate now tolerates MEDIUM/LOW/UNKNOWN findings and unfixed
  CRITICAL/HIGH CVEs in production dependencies. This is a policy decision,
  not an oversight: periodic triage of the full Trivy report is required to
  keep the relaxation honest.
- A CRITICAL/HIGH CVE with no available fix no longer blocks merge. Such
  findings must be tracked manually (issue + `.trivyignore` with expiry
  comment) until a patch lands.
