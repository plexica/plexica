# FORGE Adversarial Review — Spec 010 CI Dynamic Ports — Round 10 (Primary)

| Field | Value |
| --- | --- |
| Date | 2026-08-24 |
| Reviewer role | **primary** (empirically-responsible seat) |
| Scope | Uncommitted working tree vs `191f859` (~76 modified + ~50 new files) — claimed fixes for R9-1, R9-F, F1, F2 plus carried lows |
| Spec | `.forge/specs/010-ci-dynamic-ports/`, ADR-031 |
| Prior ground truth | `.forge/reviews/review-010-ci-dynamic-ports-2026-08-23-round9-consolidated.md` |

## ⚠️ Verification-method disclosure (read first)

**This session's toolset exposed NO command-execution capability** (only
file read/grep/glob/edit/write). Every mandated empirical run — most
critically the **≥10× re-run of `verify-concurrent-ci-runtime.test.sh`**
that round 9 made the explicit closure criterion for R9-F — **was NOT
executed and no pass counts are reported**. All results below are static
traces against source, marked accordingly. Nothing here should be read as
empirical confirmation. This is reviewer-environment verification debt,
reported as finding R10-V1; it does not assert any defect in the diff.

---

## Findings table

| # | Severity | Finding | File(s) | Source / method |
|---|---|---|---|---|
| R10-V1 | HIGH (verification gap, non-code) | Mandated R9-F closure criterion (≥10× deterministic self-test runs) remains unevidenced; primary seat could not execute commands this session. No fabrication of pass counts. | `.github/actions/docker-infra/scripts/verify-concurrent-ci-runtime.test.sh`; `ci.yml:136` | Environment limitation |
| R10-1 | Low (carried, confirmed open) | Capacity admission lock is `$marker.lock` where marker defaults to `/etc/plexica-ci-concurrent-e2e` → `/etc/plexica-ci-concurrent-e2e.lock`. Readable-marker ≠ writable `/etc`; non-root admitted runners still fail admission at `exec 9>` (R9-3 unchanged). | `verify-ci-runner-capacity.sh:7,20` | Static read |
| R10-2 | Low (carried, confirmed open) | Sentinel tuple still enumerates exactly six services (`postgres keycloak redpanda core-api-e2e web-e2e admin-e2e`) (R9-6 unchanged). | `verify-concurrent-port-gates.sh:11` | Static read |
| R10-3 | Low (carried, confirmed open) | ADR-031 Decision §3 still says "CI scope equals project"; shipped scope is hash-projection `ci-<sha256(project)[:28]>` (`plugin-runtime-scope.ts:4`). Drift persists (R9-7). | `adr-031-ci-runtime-contract-gated-orchestration.md:33`; `plugin-runtime-scope.ts` | Static read |
| R10-4 | Low (carried, confirmed open) | `quality` job admits and creates a runtime dir (via `ci-runner-admission`) but has no runtime-dir removal step; dirs accumulate on persistent runners (R9-8). Contract job is fine (verifier self-tears-down); `ci` job has phase `down`. | `ci.yml:56–83` vs `ci.yml:166–172` | Static read |
| R10-5 | Low (carried, confirmed open) | Harness image base unpinned: `FROM node:24-bookworm` (no digest). | `infra/docker/ci-sidecar-harness.Dockerfile:1` | Static read |
| R10-6 | Low (carried, confirmed open) | `source "$env_file"` for `sidecar-images.env` lacks the `-O`/`! -L` ownership/symlink guard applied to `host.env` (`ci-runtime-env.sh:84–85`). Mitigated but inconsistent (C-series residual). | `verify-ci-sidecar-lifecycle.sh:22–24,42` | Static read |
| R10-7 | Low (carried, confirmed open) | Root-mkdir TOCTOU in `ci_runtime_root`: check-then-create `if [[ ! -e ]]; then mkdir -m 700` is racy; post-hoc `safe_directory strict` revalidation narrows but does not close it. | `ci-runtime-path.sh:23` | Static read |
| R10-8 | Low (carried, status unverified) | SC2086-style unquoted word-split loops persist where intentional (`down-ci-runtime-project.sh:12`, `verify-concurrent-port-gates.sh:25,29`). Dead checked-in docker stub: could not relocate any checked-in stub under `.github/actions/docker-infra` or `services/core-api/scripts` this pass — possibly already removed; needs one-line confirmation. U1 unnamed failing projects / misleading step name ("Start independent project runtime", `ci.yml:138` — actually shared single-project runtime) / KAFKA_BROKERS port-bound arithmetic: unchanged, still open. | multiple | Static read |
| B1 | Tracked user gate (NOT a code-level blocker) | Tasks 5.4/6.1/6.2 confirmed still unchecked; admitted-runner execution evidence absent. Acknowledged, user-owned. | `tasks-orchestration.md:39,52,60` | Static read |

No NEW code defects were found this round. The three code fixes verify statically correct (below).

## Round-9 closure status

### R9-1 (HIGH — EXIT-trap teardown regression): fix verified CORRECT — static trace (⚙ impossible this session)

Traced every exit path through `verify-concurrent-ci-runtime.sh` against
`down-ci-runtime-project.sh` (fail-closed `validate_ci_runtime` +
`realpath -e` + post-rm existence check):

1. **Happy path**: line 162 `down "$project_a"` succeeds → `torn_down+=(A)`
   (`:24–29`). EXIT-trap `cleanup()` iterates `initialized[]`; `down A`
   short-circuits (`return 0`), `down B` runs once. Exactly ONE
   `down-ci-runtime-project.sh` invocation per project → `validate_ci_runtime`
   never sees a deleted dir → exit 0. Regression eliminated.
2. **Bootstrap failure** (`:148–149`): `torn_down` empty → trap downs A and B
   once each.
3. **Explicit-down failure** (`:162` under `set -e`): `down()` does NOT append
   to `torn_down` on failure (`|| return $?` precedes the append) → trap
   correctly RETRIES partial teardown of A, downs B. Retry-on-failure
   semantics preserved.
4. **Failure after explicit teardown** (`assert_absent`, `cmp`,
   `verify_project`): A skipped via `torn_down`, B downed once, nonzero
   `$status` propagates → exit 1. Fail-closed preserved.
5. **Interaction checks**: `collect()` cannot observe a torn-down dir
   (explicit down only occurs after `diagnostics_collected=1` at `:161`);
   `cleanup_done` guard makes INT/TERM + EXIT idempotent; empty-array
   expansions are safe on GH-runner bash ≥5.
6. The self-test now asserts the contract mechanically: exactly-one down per
   project (`test:101–107`), collect-before-down on failure paths
   (`test:157–163`), and idempotent cleanup (`test:174–188`).

**Status: fix-correct-by-inspection; empirical confirmation subsumed by the
R9-F determinism run (R10-V1) — same harness exercises the happy path.**

### R9-F (MEDIUM — flaky self-test): flock fix statically sound — empirical closure NOT obtained (R10-V1)

Inspected `verify-concurrent-ci-runtime.test.sh:11–19`: every log-emitting
harness (helper stubs, docker/pnpm/curl stubs) routes through a single
`append_log` that takes `flock -x 9` on an append-mode fd to the shared
`COMMAND_LOG` and emits ALL of an invocation's lines inside the locked
region. Analysis:

- Each stream's multi-line block (e.g. `contract-skip` / `pnpm …` /
  `html-report …` from the pnpm stub, `test:67–71) is now contiguous by
  construction, which is precisely what the line-adjacency assertions
  (`test:120–124`, `136–141`) require. Interleaving between different
  invocations can no longer split a block; assertions never require
  cross-invocation adjacency.
- No nested `flock` acquisition exists anywhere in the harness → no
  deadlock; lock releases on fd close even if a stub is killed.
- Same-inode guarantee holds (log path never rotated/replaced).

The fix design removes the identified mechanism of the ~20% flake. However,
round 9 set **≥10× green runs** as the closure criterion and this session
could not execute them. **Status: OPEN pending R10-V1 — do not mark closed
on this report alone.**

### F1 (Med-Low — restart replacement leak): CLOSED ✅ (static read + unit test)

`docker-container-restart.ts:74–80` wraps the post-start
`assertCiPluginContainer` in try/catch and force-removes the rogue
replacement (`remove({ force: true, v: true })`, errors swallowed) before
rethrowing — mirroring `container-manager.service.ts:124–129`
(startContainer semantics). Unit coverage proves both branches:
rogue replacement yields removals `[{force:true},{force:true,v:true}]`
(`docker-container-restart.test.ts:86–97`); compliant replacement is never
removed (`:99–108`).

### F2 (Medium — expectedPort dead param): CLOSED ✅ (static read)

Wired end-to-end: parsed manifest `hosting.port` →
`AuthorizedPluginProxy.manifestPort` (`proxy-authorization.service.ts:118`)
→ `proxyRequest` passes it (`proxy.service.ts:88`) → `assertCiPluginTarget`
refuses mismatched ports under CI runtime contract
(`plugin-container-identity.ts:67–69`), surfaced as `ValidationError`.
Legitimate-mismatch audit: in CI runtime the proxy target port derives from
the SAME manifest — containers expose only `${manifest.hosting.port}/tcp`
(`container-manager.service.ts:95`; restart copies `inspect.Config.ExposedPorts`),
and `getContainerUrl` reads that exposed port (`:42–49,178–179`) — so
enforcement cannot reject a legitimate target. Non-CI runtime short-circuits
before the port check (`plugin-container-identity.ts:59`). Enforcement is
real, scoped, and regression-free.

## Local suites (item 5) — ⚙ NOT RUN (no execution capability)

Could not execute: shell contract tests, the ≥10× determinism re-run, or the
Vitest suites (plugin-container-identity, plugin-proxy-manifest-port,
docker-container-restart). Statically: the three Vitest files exist, are
well-formed, and their mocks match current module signatures; the shell test
harness mirrors current script interfaces (all sourced helpers exist and the
stub contracts match verifier behavior). **This is inspection, not proof.**
Round-9's suite baseline was 16/17 with the 1 failure being the R9-F flake;
that baseline must be re-established empirically.

## Constitution Rule 4 sweep (item 6)

Checked all spec-touched/new files found during review — none exceeds 200
lines. Largest observed: `container-manager.service.ts` 197,
`config.ts` 198, `proxy.service.ts` 189, `verify-concurrent-ci-runtime.test.sh` 188,
`verify-concurrent-ci-runtime.sh` 167. No retry/skip/bypass paths added:
retries remain absent, `set -euo pipefail` everywhere, failure paths exit
nonzero, no `isTestToken`-style dual code paths introduced.

## Adversarial interaction hunt (item 7)

- **flock × EXIT trap**: trap-triggered teardown appends go through the same
  serialized `append_log`; no nested locking; killed-holder releases lock. No issue.
- **torn_down × failure paths**: verified above — failed downs are not
  recorded, so cleanup retries; successful explicit downs are skipped exactly
  once. The R8→R9 failure mode (fix introducing a worse bug) did not recur in
  static analysis.
- **expectedPort × legit mismatches**: audited above — derivation and
  enforcement share one source (manifest); no legitimate target can be refused.
- New minor observation (non-blocking, informational): the restart path's
  returned host-port value (`docker-container-restart.ts:81–84`) is discarded
  by `DockerContainerManager.restartContainer` (returns `void`) and, under CI
  runtime, HostPort bindings don't exist anyway — harmless dead branch, not a defect.

## Verdict: REQUEST_CHANGES

Scoped strictly: **zero new code defects found; all three code fixes
(R9-1, F1, F2) verify correct by inspection.** The change request is the
outstanding **evidence**, not code:

### (a) Code-level blockers remaining

- **None new.** The only code-adjacent item keeping this from APPROVED is
  R9-F closure evidence (R10-V1): round 9 defined ≥10× deterministic green
  runs of `verify-concurrent-ci-runtime.test.sh` as its closure criterion,
  and that run did not happen. If those runs pass, R9-F closes with no code
  change expected.
- Non-blocking carried lows (track-before-or-soon-after-merge): R10-1…R10-8
  in the table above (lock location, sentinel tuple breadth, ADR-031 §3
  wording, quality-job runtime-dir accumulation, unpinned harness FROM,
  sidecar-env source guard, mkdir TOCTOU, SC2086/stub/U1/step-name/KAFKA
  bound).

### (b) Admitted-runner execution evidence gate (tracked/user-owned — NOT code-level)

- **B1 — OPEN (unchanged).** Tasks 5.4/6.1/6.2 unchecked in
  `tasks-orchestration.md`; no admitted-runner `--full-e2e` execution
  artifact or run link attached. Owner: user/infra. Cannot be discharged
  until R10-V1's determinism run is green.

## Recommended next steps

1. **Executor with shell access**: run
   `bash .github/actions/docker-infra/scripts/verify-concurrent-ci-runtime.test.sh`
   ≥20×; report exact pass counts. All green ⇒ R9-F CLOSED (no code change needed).
2. Re-run the full local shell contract suite + the three Vitest unit suites
   to re-establish the round-9 baseline (expect 17/17 now).
3. Execute task 5.4 `--full-e2e` on an admitted runner; attach sentinel
   artifact + run link; check tasks 5.4/6.1/6.2 ⇒ discharges B1.
4. Then merge; batch the carried lows (R10-1…R10-7) into one follow-up chore
   PR — none individually blocks.
5. Fix the ADR-031 §3 wording drift (one sentence) opportunistically in the
   same docs pass.
