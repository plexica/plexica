# Spec 008 Phase 1 Native-Dependency Spike Report

| Field                | Result                                              |
| -------------------- | --------------------------------------------------- |
| Date                 | 2026-08-27                                          |
| Branch               | `feat/kafka-javascript-migration`                   |
| Scope                | Phase 1 only; KafkaJS remains the production client |
| Overall gate         | **PENDING**                                         |
| Migration authorized | **No**                                              |

## Decision

The isolated local Node 24 distribution and the exact digest-pinned Core
Bookworm image passed KJM-G01 through KJM-G10. This is useful local evidence,
but it is not the required run on GitHub's actual default self-hosted runner.
KJM-023 therefore remains **PENDING**, and no production Kafka migration is
authorized.

`.github/workflows/kafka-native-spike.yml` is prepared to produce the required
immutable `kafka-native-spike-${run_id}-${run_attempt}` artifact. Its host and
container steps run independently and the workflow fails unless both pass.

## Observed Targets

| Fact              | Isolated local target                      | Pinned Core runtime                                                       |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| Execution context | Official Node distribution on current host | Docker image from the plan                                                |
| Node              | 24.19.0                                    | 24.19.0                                                                   |
| pnpm              | 10.33.0                                    | 10.33.0                                                                   |
| Node ABI          | 137                                        | 137                                                                       |
| Platform / arch   | Linux / x64                                | Linux / x64                                                               |
| libc              | glibc 2.39                                 | glibc 2.36                                                                |
| Image digest      | Not applicable                             | `sha256:934240a162082fd8b8a2f90cd5114446443f1eba1c5378f6687167ca405e6584` |
| Package           | `@confluentinc/kafka-javascript` 1.10.0    | Same                                                                      |
| librdkafka        | 2.15.0                                     | 2.15.0                                                                    |

The ambient host shell is Node 20.20.2. The isolated local target is not and
must not be treated as the actual GitHub self-hosted Node 24 runner.

## Gate Matrix

| Gate    | Local Node 24 | Pinned Bookworm | Actual self-hosted runner | Required outcome |
| ------- | ------------- | --------------- | ------------------------- | ---------------- |
| KJM-G01 | PASS          | PASS            | PENDING                   | **PENDING**      |
| KJM-G02 | PASS          | PASS            | PENDING                   | **PENDING**      |
| KJM-G03 | PASS          | PASS            | PENDING                   | **PENDING**      |
| KJM-G04 | PASS          | PASS            | PENDING                   | **PENDING**      |
| KJM-G05 | PASS          | PASS            | PENDING                   | **PENDING**      |
| KJM-G06 | PASS          | PASS            | PENDING                   | **PENDING**      |
| KJM-G07 | PASS          | PASS            | PENDING                   | **PENDING**      |
| KJM-G08 | PASS          | PASS            | PENDING                   | **PENDING**      |
| KJM-G09 | PASS          | PASS            | PENDING                   | **PENDING**      |
| KJM-G10 | PASS          | PASS            | PENDING                   | **PENDING**      |

## Evidence Summary

- G01: each final run started with absent `node_modules` and a separate empty
  store, then completed `pnpm install --frozen-lockfile` under Node 24.19.0 and
  exact pnpm 10.33.0.
- G02: Core resolves only candidate version 1.10.0. Lock and npm tarball
  integrity both equal
  `sha512-6gLgZSxbtlC5kR/VOG1JE2m8Lb2NwXMDJmkEDunyj8yV/VyzjLTqH/SojMJ/SdcmwUxmXVwf7VC4ATK/gQsKxg==`.
- G03: both install logs show download of
  `confluent-kafka-javascript-v1.10.0-node-v137-linux-glibc-x64.tar.gz` and
  `installed via remote`. Negative scans found no source-build, node-gyp, make,
  compiler, or fallback execution.
- G04: GitHub release asset API ID `463262216` reports size 5,303,578 and
  SHA-256 `ccc2a8b2fcf89e01c7dd6895ddfc2ad5599aff32bf090d6b9e02854f64e66358`.
  Both independent downloads matched the published size and digest.
- G05: an unmodified import loaded one expected `.node` addon. Package version
  was 1.10.0, `librdkafkaVersion` was 2.15.0, and both JavaScript surfaces were
  observed over that shared addon. Functional smoke used only `KafkaJS`.
- G06: `file` and `readelf` reported ELF64 x86-64 GNU/glibc. Full `ldd` output
  had no `not found` entry and no librdkafka/system-library workaround.
- G07: project Redpanda
  `v23.3.5@sha256:342d52b03d70e8c605897b1756d6faab14067af6f8a969264093dabbce1858dd`
  created a unique topic, exposed leader metadata, assigned one consumer, and
  acknowledged one producer record. Source offset `0` was manually committed
  and verified through Admin as next offset `1`.
- G08: success and injected-failure runs disconnected consumer, producer,
  consumer group, topic, and admin in recorded order. Both exited naturally
  with code 0 under the timeout supervisor and reported zero extra handles.
- G09: no package-manager command, compiler, build toolchain, node-gyp, source
  flag, or system librdkafka was installed or executed.
- G10: the required pinned Node 24 Bookworm Linux glibc x64 target passed. No
  Alpine/musl result was used to justify support.

## Commands Executed

```bash
docker compose -p plexica-kjm-local up -d --wait redpanda
PATH=<node-24.19.0>/bin:$PATH corepack prepare pnpm@10.33.0 --activate
bash services/core-api/scripts/native-spike/run-target.sh <evidence> <empty-store> localhost:19092 local-node24
docker run --rm --network host -v <worktree>:/workspace -v <evidence>:/evidence node:24-bookworm@sha256:934240a162082fd8b8a2f90cd5114446443f1eba1c5378f6687167ca405e6584 bash -c '<exact-pnpm-setup>; run-target.sh ...'
```

`run-target.sh` executed the frozen install, package list, install-log negative
scan, npm/release integrity verification, native load plus `file`/`readelf`/`ldd`,
and bounded success/failure Redpanda smokes. Complete generated evidence is in
`/tmp/opencode/kjm-evidence/{local-node24-final,pinned-bookworm-final}` and is
intentionally outside git.

## Limitations And Follow-up

- GitHub Actions was not run or observed locally. Runner identity, GitHub run
  identity, and immutable artifact review remain pending.
- An early verifier attempt failed due to an invalid `realpathSync` callback;
  that tooling defect was corrected and all final evidence used fresh worktrees
  and stores.
- An exploratory smoke with test consumer `fromBeginning:false` was assigned
  before production but missed the unique record. Final spike smokes use the
  plan-approved test-only `fromBeginning:true`, still wait for assignment before
  producing, and verify explicit offset `+1`. Production consumer settings were
  not changed.
- Run the manual `Kafka native dependency spike` workflow and review its
  `summary.json`, runner identity, full install logs, image identity, native
  linkage, integrity, and both smoke transcripts. Only a reviewed PASS/PASS
  artifact can authorize Phase 2.
