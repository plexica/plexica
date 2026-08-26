# FORGE Adversarial Review — Spec 010 CI Dynamic Ports — Round 10 (PEER, independent model)

| Field | Value |
| --- | --- |
| Date | 2026-08-24 |
| Reviewer | forge-reviewer-peer (**peer / independent second model**) |
| Scope | Diff-based: uncommitted working tree vs `191f859` (~76 modified + ~50 new files) — claimed fixes for R9-1, R9-F, F1, F2 + carried lows |
| Spec | `.forge/specs/010-ci-dynamic-ports/` (tech-spec, plan, tasks, tasks-orchestration), ADR-031 |
| Ground truth | `.forge/reviews/review-010-ci-dynamic-ports-2026-08-23-round9-consolidated.md`; rounds 5–7 consolidated skimmed for carried items |
| Method | Independent mechanical source-level trace of every claimed fix (exact line numbers below), directed adversarial probes of the three named fix-interaction surfaces, Rule-4 sweep, retry/bypass sweep |
| Verdict | **REQUEST_CHANGES** — zero new code defects; the re-request is **evidence-discharge only** (see §Verdict) |

> Independence note: all traces below were performed fresh against source in this
> session. Where conclusions coincide with other reviewers they coincide because the
> same lines were inspected, not by coordination.

## Verification-capability disclosure

**This reviewer session exposes no shell-execution tool** (read/grep/glob/write only).
Therefore:

- The mandated **≥10× determinism re-run** of `verify-concurrent-ci-runtime.test.sh`
  was **NOT executed here** (run count: 0/10 — reported honestly, not fabricated).
- The shell contract suite (`*.test.sh`, 22 harness tests inventoried in
  `.github/actions/docker-infra/scripts/`) was **NOT executed here**.
- The three Vitest unit suites were **NOT executed here**.

Round-9 precedent is decisive: R9-F's ~20% flake was invisible to static reads for
two rounds and was found only empirically. Static soundness of the flock fix is
therefore necessary but **not sufficient** for closure. Exact commands handed to the
orchestrator in §Recommended next steps.

---

## Findings table (peer, this round)

| # | Severity | Dimension | Finding | File(s) |
|---|---|---|---|---|
| P1 | Low | Correctness | `validateTargetHost`'s catch-all converts the newly-wired port-mismatch rejection into a generic `'Invalid proxy target URL'`. `assertCiPluginTarget` throws a plain `Error` (`identity.ts:68`), which fails the `err instanceof ValidationError` test (`proxy.service.ts:67`) and is masked — the actionable "target port ≠ installation manifest" diagnostic never reaches the client/operator on the production path. Fail-closed direction preserved; observability loss only. | `proxy.service.ts:59-70`; `plugin-container-identity.ts:67-69` |
| P2 | Low | Correctness (fail-open residue) | If the stored manifest fails schema parse, `manifestPort` is silently omitted (`proxy-authorization.service.ts:96,118`) and port-match enforcement silently degrades to bounded-explicit-port-only. The alias/network SSRF gate still holds, so this is defense-in-depth erosion under corrupt data, not an open SSRF path. Tested *as* degradation (`plugin-proxy-manifest-port.test.ts:80-85`) but nothing surfaces the anomaly. | `proxy-authorization.service.ts:118`; `plugin-container-identity.ts:67` |
| P3 | Low | Test-Spec Coherence | F2's production composition is untested at the call site: enforcement is unit-tested (`plugin-runtime-contract.test.ts:125-126`) and exposure is unit-tested (`plugin-proxy-manifest-port.test.ts:73-85`), but no test drives `proxyRequest`/`validateTargetHost` with a mismatched `access.manifestPort`. The glue line `proxy.service.ts:88` is verified by static reading only. | `proxy.service.ts:88` |
| P4 | Low | Correctness (signals) | INT/TERM handler `'cleanup; exit 130'` (`verifier:52`): if `cleanup()` itself hits `exit 1` (:49) on failed teardown/diagnostics, the signal exit code becomes 1, not 130. Observability nit for CI signal semantics; fail-closed direction acceptable. | `verify-concurrent-ci-runtime.sh:49,52` |
| P5 | Low | Maintainability / portability | Two environment dependencies of the fixes are implicit and undocumented: (a) `flock` is util-linux — absent on macOS dev machines, where the self-test now fails (fail-closed; Linux CI unaffected); (b) empty-array expansion `"${torn_down[@]}"` under `set -u` requires bash ≥ 4.4 (`verifier:26,33,48`) — any self-hosted runner on older bash breaks admission. Both should be stated in the action README or guarded. | `verify-concurrent-ci-runtime.test.sh:14`; `verify-concurrent-ci-runtime.sh:26,33,48` |
| P6 | Info | Maintainability | Capacity pressure against Constitution Rule 4: `container-manager.service.ts` 197/200, `config.ts` 198/200, `ci.yml` 172/200, `verify-concurrent-ci-runtime.test.sh` 188/200. Compliant today; any addition regresses. Extract-helper pattern already exists elsewhere in this spec. | see files |

Summary: 0 HIGH, 0 MEDIUM, 5 LOW, 1 INFO. Minimum-issue requirement met (P1/P2 Correctness, P3 Test-Spec Coherence, P6 Maintainability).

### Directed interaction-probe results (round-8→9 regression hunt)

1. **torn_down tracking × failure paths** — SOUND, traced on five paths:
   - *Success*: explicit `down "$project_a"` (:162) → down script rc=0 → `torn_down+=A` (:28, append strictly after success due to `|| return $?` at :27) → `assert_absent`/snapshots/`cmp`/`verify_project` → EOF → EXIT-trap `cleanup()`: `down A` early-returns 0 via the torn_down scan (:26), `down B` executes once → `status==0 && diagnostics==0 && teardown==0` → exits 0. **Exactly one `down` per project on success.**
   - *Bootstrap subshell failure*: `wait` collects both (:146-147) → `exit 1` (:149) → cleanup collects diagnostics first (:47) then downs each project exactly once (neither recorded) → exit 1.
   - *Explicit down-A fails*: A not appended to `torn_down` → `set -e` exits → cleanup retries A, downs B once; persistent retry failure ⇒ `teardown=1` ⇒ `exit 1` — never silent success.
   - *Init-B failure* (:141-142): `set -e` aborts before `initialized+=("$project_b")`; trap downs A alone — matches self-test assertion (`test:167-170`).
   - *Signals*: shared `cleanup_done` guard makes repeated cleanup idempotent (`test:174-188` asserts exactly-once).
2. **flock guard × EXIT trap (self-test)** — SOUND statically. Every COMMAND_LOG writer class (helper stubs `test:24`, docker stub `:47`, pnpm stub `:71`, curl stub `:76`) funnels through `append_log`, which opens fd 9 O_APPEND and holds `flock -x 9` across the whole multi-line group (`test:12-18`). No bypassing `>>COMMAND_LOG` writer exists anywhere in the harness. Interleaving can reorder whole *groups* but can never split *lines/groups* — precisely what the adjacency assertions require (`pnpm`+`contract-skip`+`html-report` triplets stay contiguous). Kernel releases flock on process death (no deadlock); negative-path reruns use distinct log files and `${RANDOM}` suffixes (no cross-run contamination); the test invokes the verifier synchronously so its `rm -rf` EXIT trap cannot race a live fd holder. All node assertions are count/partition predicates invariant to inter-process ordering. Residual caveats captured as P5.
3. **expectedPort enforcement × legitimate mismatches** — NO LEGITIMATE PATH BROKEN. Enforcement fires only under `isCiPluginRuntime()` (`identity.ts:59`); non-CI dev backends and the `ALLOWED_PROXY_HOSTS` path are untouched (`proxy.service.ts:63`). Under the CI contract the alias check (`identity.ts:71`) already pins targets to the derived sidecar alias, so an off-manifest listener is *refused* — intended behavior, tested (`plugin-runtime-contract.test.ts:125-126`). Only residues are P1 (masked message) and P2 (silent degradation on unparsable manifest).

---

## Per-item round-9 closure status

Legend: **[S]** = static mechanical trace against source this session; **[E]** = empirical execution — **not performed (see disclosure)**.

| Item | Status | Verification | Evidence |
|---|---|---|---|
| **R9-1** (HIGH — EXIT-trap teardown regression) | **CLOSED [S]** — pending [E] confirmation on runner | Full-flow trace, success + 4 failure paths (probe 1 above) | `torn_down` appended only after down-script rc=0 (`verifier:27-28`); skipped in cleanup loop (:26); explicit A-down at :162; `validate_ci_runtime`'s `realpath -e` fail-closed (`ci-runtime-path.sh:48`) is now never invoked against A's deleted dir; exactly-once pinned by new self-test node block (`test:101-107`, incl. `downs.length === 1` per project) and idempotent-signal test (:174-188). Down script itself validates before *and* after compose-down, deletes runtime dir last (`down-ci-runtime-project.sh:9,32-36`) |
| **R9-F** (MEDIUM — flaky verifier self-test ~20%) | **FIX PRESENT [S] / EMPIRICAL CLOSURE OUTSTANDING [E]** | Static lock-discipline audit (probe 2 above); execution impossible this session | Single serialized writer funnel covers 100% of COMMAND_LOG writers; assertions proven order-invariant. **Orchestrator MUST run ≥10× (recommend 20×); any flake re-opens this as blocking** |
| **F1** (Med-Low — rogue restart replacement) | **CLOSED [S]** | Static trace + behavioral test read | Failed replacement force-removed `{force:true, v:true}` before rethrow (`docker-container-restart.ts:75-80`), semantically mirroring `startContainer` (`container-manager.service.ts:124-129`); removal sequence pinned `[{force:true},{force:true,v:true}]` and compliant-replacement non-removal pinned (`docker-container-restart.test.ts:86-97,99-108`) |
| **F2** (Medium — expectedPort dead param) | **CLOSED [S]** (residues P1–P3 Low) | Production caller-chain trace | `authorizePluginProxy` parses published manifest and exposes `manifestPort` (`proxy-authorization.service.ts:96,113-119`) → `proxyRequest` passes it (`proxy.service.ts:88`) → mismatch throws at request time under CI contract (`plugin-container-identity.ts:67-69`). Runtime-enforced, not test-only |

## Carried round-9 lows — independently re-checked, current status

| Item | Status | Evidence (this session) |
|---|---|---|
| R9-3 admission lock in `/etc` | OPEN | `verify-ci-runner-capacity.sh:7,20` — marker needs only readability (:10) but `exec 9>"$marker.lock"` requires `/etc` write; non-root admitted runners fail admission for all jobs. Load-bearing now: called per bootstrap subshell (`verifier:81`) |
| R9-6 six-service sentinel tuple | OPEN | `verify-concurrent-port-gates.sh:11` — still `postgres keycloak redpanda core-api-e2e web-e2e admin-e2e`; redis/minio/mailpit/loki excluded |
| R9-7 ADR-031 §3 drift | OPEN (doc-only) | `adr-031…:33` "CI scope equals project" vs shipped hash projection `ci-<sha256(project)[0:28]>` (`plugin-runtime-scope.ts:4`); both implementations agree with each other |
| R9-8 quality-job runtime-dir accumulation | OPEN | `ci.yml:56-83` — quality job admits (creates runtime dir, uploads admission.env) with no down phase |
| SC2086 loops | MOSTLY CLOSED | `down-ci-runtime-project.sh:12` `for id in $resources` remains, plus port-gates `$ports` splits (:25,28,40); tokens are space-separated IDs/ports — semantically safe, advisory only |
| Dead checked-in docker stub | OPEN | `.github/actions/docker-infra/scripts/bin/docker` — 10-line fixed-port stub (33001–33011), referenced by nothing |
| Unpinned harness FROM | OPEN | `infra/docker/ci-sidecar-harness.Dockerfile:1` `FROM node:24-bookworm`, no digest |
| sidecar-images.env raw source guard | PARTIAL / OPEN | Digest regex gate before `source` exists (`verify-ci-sidecar-lifecycle.sh:22,43`) but no `-O`/symlink/mode guard on the env file itself (admission.env has one, :12) |
| root-mkdir TOCTOU | OPEN | `ci-runtime-path.sh:23` `[[ ! -e ]] && mkdir -m 700` race between concurrent jobs |
| U1 unnamed failing projects | OPEN | `verifier:145-150` — `failed_projects` populated then discarded with bare `exit 1` |
| Misleading step name | OPEN | `ci.yml:144-145` "Migrate through the host manifest" still only `test -f host.env` |
| KAFKA_BROKERS port unbounded | OPEN | `config.ts:56` `z.string().min(1)` |
| Proxy create-path forbidden-env ordering (C7) | OPEN | `ci-plugin-docker-proxy.mjs:87-89` — create/image rules skip `assertOwned`; create-payload validation carries the load instead |

## Mandatory additional checks

**Constitution Rule 4 sweep (≤200 lines): CLEAN.** Measured this session: `config.ts` 198, `container-manager.service.ts` 197, `proxy.service.ts` 189, `verify-concurrent-ci-runtime.test.sh` 188, `ci.yml` 172, `verify-concurrent-ci-runtime.sh` 167, `run-super-admin.ts` 167, `runtime-recovery.service.ts` 161, `playwright-base.ts` 141, `ci-plugin-docker-proxy.mjs` 113, `docker-container-restart.test.ts` 109, `proxy-authorization.service.ts` 121, `docker-container-restart.ts` 86, `down-ci-runtime-project.sh` 36, `ci-runtime-path.sh` 53, `verify-ci-runner-capacity.sh` 54, `verify-ci-sidecar-lifecycle.sh` 56, `plugin-container-identity.ts` 74. Zero overages; capacity pressure noted as P6.

**Retry/skip/bypass sweep: CLEAN.** No `continue-on-error` anywhere under `.github/` (grep). Playwright `retries: isCiRuntimeContract() ? 0 : isCi ? 1 : 0` (`playwright-base.ts:116`) — prohibition intact under the contract. No `isTestToken`, no separate test app. Verifier failures always propagate (`set -euo pipefail`; trap converts cleanup failures to `exit 1`). Artifacts keep `if: always()` + `if-no-files-found: error` (`ci.yml:46,53,77,82,157,164`). Self-test wired into CI at `ci.yml:136`.

**Test-spec coherence:** new self-test nodes pin the exact R9-1 contract (exactly-one-down) and the R9-F precondition (all writers locked); F1/F2 have dedicated behavioral negatives, not tautologies; `down-ci-runtime-project.test.sh` is wired into CI (`ci.yml:135`).

---

## Suite / determinism run results

| Suite | Result |
|---|---|
| Shell contract tests (22 `*.test.sh` inventoried) | **NOT EXECUTED** — no shell tool in this session |
| `verify-concurrent-ci-runtime.test.sh` ≥10× determinism | **NOT EXECUTED** — run count 0/10, disclosed |
| Vitest plugin-container-identity / plugin-proxy-manifest-port / docker-container-restart | **NOT EXECUTED** |

Static analysis predicts all pass (fixes mechanically sound; fixtures internally consistent), but prediction is not evidence — round-9 proved exactly this class of error is empirically detectable only.

---

## Verdict: REQUEST CHANGES

**Zero new code-level defects found.** Every claimed round-9 fix is mechanically
correct at source, including all three directed interaction probes — the
round-8→9 pattern (fix introducing a worse regression) did **not** recur as far as
static tracing can establish.

The REQUEST_CHANGES is issued solely because round 9 made **empirical determinism
proof** the closure criterion for R9-F (a blocking MEDIUM), and this reviewer could
not produce it (no execution tool; run count 0/10, disclosed above). Constitution
Rule 2 also forbids merging without demonstrated green CI, and the verifier
self-test has no demonstrated green run yet. **No code changes are requested**;
the verdict auto-flips to APPROVED when Gate B below completes clean.

### (a) Code-level blockers remaining

**None.** R9-1 and R9-F are fixed at source; F1/F2 are closed with production wiring
and behavioral coverage. All findings this round (P1–P6) are LOW/advisory,
track-before-or-soon-after-merge.

### (b) Admitted-runner execution evidence gate (user-owned, tracked separately)

- **B1 — OPEN, unchanged from round 9.** `tasks-orchestration.md`: task **5.4 `[ ]`**
  (implementation done; `--full-e2e` execution on an admitted runner pending, per the
  inline note at :40-42), **6.1 `[ ]`**, **6.2 `[ ]`**; header status line confirms
  "pending admitted-runner verification". This is a deliberate, acknowledged
  process/user-owned gate — **not counted as a code-level blocker** per review
  governance. Discharging it requires: execute task 5.4 `--full-e2e` on an admitted
  runner, attach sentinel artifact + run link, check tasks 5.4/6.1/6.2. Note B1
  cannot be discharged until R9-1/R9-F are proven (Gate B first).

## Recommended next steps

1. **Gate B (orchestrator, blocks merge — discharges this report's empirical gap):**
   ```bash
   cd .github/actions/docker-infra/scripts
   pass=0; fail=0
   for t in *.test.sh; do bash "$t" && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL: $t"; }; done
   echo "pass=$pass fail=$fail"
   for i in $(seq 1 20); do bash verify-concurrent-ci-runtime.test.sh || { echo "FLAKE run $i"; exit 1; }; done
   pnpm --filter core-api test -- plugin-container-identity plugin-proxy-manifest-port docker-container-restart
   ```
   Attach outputs to the round-10 consolidation. Any flake ⇒ R9-F re-opens as blocking.
2. **Gate A (user-owned, carried B1):** task 5.4 `--full-e2e` on an admitted runner;
   attach evidence; check 5.4/6.1/6.2.
3. Cheap non-blocking follow-ups, cheapest first: R9-7 ADR wording (doc-only);
   delete dead `bin/docker` stub; move capacity lock+marker under `$RUNNER_TEMP` (R9-3);
   preserve mismatch-specific error type in `validateTargetHost` (P1); warn/hard-fail on
   unparsable sidecar manifest under CI contract (P2); add call-site composition test
   (P3); U1 named failures; quality-job down phase (R9-8); sidecar-env source guard;
   mkdir TOCTOU; harness digest pin; six-service sentinel; KAFKA_BROKERS port bound;
   document flock/bash≥4.4 runner prerequisites (P5).
