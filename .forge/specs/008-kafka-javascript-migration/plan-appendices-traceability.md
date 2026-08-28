# Plan 008 Appendices — Traceability, Compliance, and Risk (Kafka JavaScript Client Migration)

> Companion to `.forge/specs/008-kafka-javascript-migration/plan-appendices.md`,
> which holds §1—§8 (mappings, gate targets and matrix, file maps, test updates).
> This file holds §9—§17 (requirement traceability, constitution compliance,
> ADR-004 compatibility mappings, risks, command gates, dependency changes,
> admin helpers, Pino boundaries, and implementation invariants). Section
> anchors are preserved so `plan.md` and `adr-004-kafka-redpanda-event-bus.md`
> cross-references keep their target.

## 9. Requirement traceability (plan §10)

| Requirement | Plan sections   | Concrete implementation/tests                                                                       |
| ----------- | --------------- | --------------------------------------------------------------------------------------------------- |
| KJM-001     | 2.1-2.2, 4.1, 5 | `kafka-client.ts`, smoke test, verifier, manifests; final import audit                              |
| KJM-002     | 1, 4.4, 8       | existing Compose/Redpanda; smoke/verifier/rebalance integration                                     |
| KJM-003     | 1.1, 4.2, 8.1   | `kafka.ts`; event pipeline, DLQ durability, AC-06                                                   |
| KJM-004     | 4.2, 8.1        | `outbox-publisher.ts`; outbox integration + event pipeline                                          |
| KJM-005     | 4.2, 8.2        | `kafka-producer.ts`; producer lifecycle tests                                                       |
| KJM-006     | 4.2             | `kafka-client.ts`, `kafka-producer.ts`; config/lifecycle tests                                      |
| KJM-007     | 4.3, 6          | consumer manager/pattern/registry; consumer semantics + group-name tests                            |
| KJM-008     | 4.3             | consumer manager, DLQ consumer; consumer semantics, security, DLQ tests                             |
| KJM-009     | 4.3, 8.2        | assignment generation/guarded commit; real rebalance integration                                    |
| KJM-010     | 1.1, 8.1        | unchanged processor/DLQ service; DLQ durability, AC-06, deletion E2E                                |
| KJM-011     | 4.3, 8.1        | installation processor; two-tenant security and deletion tests                                      |
| KJM-012     | 4.5             | `kafka-errors.ts`, facade, health; client-config/producer/consumer/admin tests                      |
| KJM-013     | 4.5             | `kafka-logger.ts` and Kafka-specific logs; logger test                                              |
| KJM-014     | 4.4             | `kafka-admin.ts`, health, lag, verifier; admin + smoke tests                                        |
| KJM-015     | 4.2-4.3, 6      | `event-workers.ts`, `bootstrap.ts`; shutdown-order test                                             |
| KJM-016     | 4.1             | broker parser using only `KAFKA_BROKERS`; config tests                                              |
| KJM-017     | 5, 6            | manifests/lock/patch/Dockerfile/docs; frozen install and audits                                     |
| KJM-018     | 3.2, 5, 8.2     | SDK/CLI/example manifests read-only; SDK event compatibility tests/audit                            |
| KJM-019     | 8               | all listed unit/integration/Playwright tests; no Redpanda skip                                      |
| KJM-020     | 1, 11           | accepted ADR-004 amendment/Constitution v1.1; architecture guidance update                          |
| KJM-021     | 4.3             | concurrency 1 + guarded commit; unit ordering and real rebalance tests                              |
| KJM-022     | 4.3-4.4, 8      | assignment/leader gates and all-path cleanup in verifier/smoke/E2E probes                           |
| KJM-023     | 5.1-5.2, 7, 8.3 | uncommitted dual-target native spike; KJM-G01—G10 evidence and explicit PASS/FAIL                   |
| KJM-NFR-001 | 4.2-4.3, 8      | outbox, manual offset, fault/rebalance tests; zero premature commits                                |
| KJM-NFR-002 | 8.2             | `kafka-outbox-performance.int.test.ts` controlled 100-event real-outbox P95 assertion               |
| KJM-NFR-003 | 1.1, 4.5, 8.1   | event pipeline, two-tenant security, logger and AC-06 ciphertext tests                              |
| KJM-NFR-004 | 8.1             | existing `005-07-deletion.spec.ts` event-data proof                                                 |
| KJM-NFR-005 | 4.2-4.3, 8.2    | bounded 30 s teardown assertions and no owned handles                                               |
| KJM-NFR-006 | 3.2, 4.4, 8.1   | 200 ms health classification and unchanged Kafka status schema                                      |
| KJM-NFR-007 | 5, 8.3          | dual-target clean-store frozen install, checksum/load/link/smoke proof, no KafkaJS graph after PASS |
| KJM-NFR-008 | 6, 8.3          | lint/type/build/unit/int/E2E/coverage gates and <=200-line decomposition                            |

## 10. Constitution compliance report (plan §11.2)

| Article                      | Status               | Plan evidence                                                                                                                                           |
| ---------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1 / Rule 1              | Compliant            | Blocking Playwright DLQ/deletion/status flows updated for readiness; no infrastructure skip                                                             |
| Art. 2 / Rule 2              | Compliant by gate    | Dual-target frozen install/native/real-Redpanda Phase 1 proof blocks functional migration; CI/test/build gates block release                            |
| Art. 3 / Rule 3              | Compliant            | One production client and one compatibility API, no fallback/mixed transport; narrow uncommitted spike coexistence cannot ship; SDK stays HTTP-backed   |
| Art. 4 / Rule 4              | Compliant            | Explicit decomposition of 193/199-line files; all new authored files budgeted below 200 lines                                                           |
| Art. 5 / Rule 5              | Compliant            | ADR-004 records exact dependency, mandatory native nature of both APIs, conditional Phase 1 adoption, and governed FAIL decision                        |
| Art. 6 / Rule 6              | Compliant by process | Implementation commits use English Conventional Commit messages                                                                                         |
| Art. 7 / Architecture        | Compliant            | Fastify monolith and Kafka/Redpanda/outbox/DLQ design remain unchanged                                                                                  |
| Art. 8 / Quality/testing     | Compliant by gate    | Unit, real integration, Playwright coverage includes faults, races, security, performance, lifecycle; combined coverage must prove >=80% or block merge |
| Art. 9 / Security/operations | Compliant by gate    | Native integrity/load/link and no-handle checks block adoption; tenant prefilter/encryption/erasure and stable operations remain mandatory              |

## 11. ADR-004 compatibility mappings (adr-004 amendment 2026-08-27, decision item 3)

| Concern  | Required mapping                                                                                                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Common   | Trim and validate `KAFKA_BROKERS`; `clientId: plexica-core`; Pino adapter; client log level ERROR.                                                                                                    |
| Producer | `acks: -1`, `allowAutoTopicCreation: true`, three Produce retries, 100 ms initial backoff, and native `linger.ms: 0`; an awaited `send()` delivery report is the acknowledgement boundary.            |
| Consumer | `groupId`, 30 s session timeout, 3 s heartbeat, `fromBeginning: false`, and `autoCommit: false` are constructor settings; `run()` sets `partitionsConsumedConcurrently: 1`.                           |
| Admin    | Preserve list/create/delete topics, topic metadata, group offsets, topic offsets, and bounded health operations; normalize client-specific shapes and disconnect every transient client in `finally`. |

## 12. Principal risks (plan §12.2)

| Risk                                                                                             | Mitigation / release signal                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Experimental pnpm/native binary installation                                                     | Root build allowlist, frozen install, explicit package/librdkafka load; source fallback blocks release                                                                                                               |
| Compatibility API mistaken for pure JavaScript                                                   | ADR and Phase 1 require the same native addon/librdkafka for both JavaScript API surfaces                                                                                                                            |
| Prebuilt asset tampering/wrong target selection; host success masking production runtime failure | Match exact asset URL/name and locally computed SHA-256 to the GitHub release API digest in both targets; run an independent clean-store install/load/link/Redpanda/no-handle gate in the pinned Core Bookworm image |
| Silent offset advance during revoke; producer disconnect before delivery report                  | Constructor auto-commit false, generation guard, no-commit revoke, real rebalance test; owned send set, terminal admission, outbox retained on every unacknowledged path                                             |
| False readiness and missed CI events                                                             | Assignment/leader polling with bounded timeout; no fixed sleep proof                                                                                                                                                 |
| PII or broker/client object leakage                                                              | Logger drops client text/extra; numeric mapping; marker-based sanitization tests                                                                                                                                     |
| Admin client/topic/socket leak on timeout                                                        | Single ownership helper and outer script `finally`; open-handle/shutdown assertions                                                                                                                                  |
| Lag shape drift or accidental status redesign                                                    | Public schema unchanged; calculation isolated and tested; no UI/API edits                                                                                                                                            |
| File-size regression from consumer complexity                                                    | Mandatory decomposition before behavior changes; line gate runs before full integration                                                                                                                              |
| Current unit-only coverage is far below the constitutional target                                | Run combined coverage; block merge and escalate the pre-existing baseline rather than waive it or add unrelated refactors                                                                                            |

## 13. Compatibility API mode and post-PASS command gates (plan §4.1-4.3, §8.3.2)

Exact API mode used only after Phase 1 PASS:

```ts
import { KafkaJS } from '@confluentinc/kafka-javascript';
const { Kafka, logLevel } = KafkaJS;
new Kafka({ kafkaJS: { brokers, clientId: 'plexica-core', logLevel: logLevel.ERROR, logger } });
kafkaClient.producer({
  kafkaJS: { allowAutoTopicCreation: true, acks: -1, retry: { retries: 3, initialRetryTime: 100 } },
  'linger.ms': 0,
});
kafkaClient.consumer({
  kafkaJS: {
    groupId,
    sessionTimeout: 30_000,
    heartbeatInterval: 3_000,
    fromBeginning: false,
    autoCommit: false,
  },
  rebalance_cb,
});
```

Post-PASS full migration gates (run in order, no skip flags):

```bash
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm --filter core-api exec node -e "const k = require('@confluentinc/kafka-javascript'); if (k.librdkafkaVersion !== '2.15.0') process.exit(1)"
pnpm typecheck
pnpm --filter core-api build
pnpm --filter core-api test:unit
pnpm --filter @plexica/sdk test
pnpm --filter create-plexica-plugin test
pnpm lint
pnpm test:line-gate && pnpm check:lines
```

```bash
pnpm --filter core-api test:int
pnpm --filter core-api exec vitest run --coverage
pnpm --filter core-api exec node scripts/verify-kafka-roundtrip.mjs "$KAFKA_BROKERS" "kjm-local"
pnpm --filter web exec playwright test e2e/plugin-system/ac-06-dlq.spec.ts
pnpm --filter @plexica/admin exec playwright test e2e/005-07-deletion.spec.ts e2e/005-11-kafka-status.spec.ts
pnpm test
pnpm build
```

## 14. Dependency and native-install changes (plan §5)

| File                              | Required change                                                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `services/core-api/package.json`  | Replace `"kafkajs": "^2.2.4"` with exact `"@confluentinc/kafka-javascript": "1.10.0"`                                                   |
| `package.json`                    | Add `@confluentinc/kafka-javascript` to `pnpm.onlyBuiltDependencies`; remove the now-empty `patchedDependencies`                        |
| `pnpm-lock.yaml`                  | Regenerate with pnpm 10.33.0; add exact Confluent/native graph; remove patch metadata and all KafkaJS graph entries                     |
| `patches/kafkajs@2.2.4.patch`     | Delete                                                                                                                                  |
| `pnpm-workspace.yaml`             | Replace stale single-workspace dependency comment                                                                                       |
| `examples/plugins/crm/Dockerfile` | Remove `COPY patches/`, patch explanation, and builder-only manifest mutation; filtered deploy must succeed without a patch declaration |

## 15. Admin, metadata, health, and lag helpers (plan §4.4)

| Helper                                          | Contract                                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `withKafkaAdmin(operation)`                     | Create/connect one admin, run operation, disconnect once in `finally`; sanitized cleanup does not hide the primary failure             |
| `waitForTopicLeaders(admin, topics, timeoutMs)` | Poll `fetchTopicMetadata({topics, timeout})`; wait for every partition to have non-negative `leader` and a `leaderNode`; bounded retry |
| `getConsumerGroupLag(admin, groupId, topics)`   | `fetchOffsets` + `fetchTopicOffsets`; sum `max(0, high - committed)` per partition; unset/negative committed = low/start               |
| `probeKafkaAdmin(timeoutMs)`                    | Bounded `listTopics({timeout})`; stable success/timeout/client-failure outcome                                                         |

## 16. Pino bridge error boundaries (plan §4.5)

| Boundary                                          | Platform outcome                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| Producer closed                                   | `KAFKA_PRODUCER_CLOSED`, retryable by durable outbox after process restart |
| Any unacknowledged/failed delivery                | `KAFKA_SEND_FAILED`, outbox/DLQ source offset retained                     |
| Consumer transport/rebalance/commit failure       | `KAFKA_CONSUMER_RETRY`, source offset retained                             |
| Schema/identity/decrypt poison classification     | Existing bounded `DLQ_*`/event code, no raw client error                   |
| Health timeout                                    | `degraded`                                                                 |
| Fatal/auth/authorization/unreachable health error | `down`                                                                     |

## 17. Implementation invariants (plan §1.1)

1. An awaited successful Confluent delivery report is the only producer acknowledgement boundary; outbox deletion stays transactional in PostgreSQL.
2. `tenantId` remains the Kafka key; value and headers stay byte-for-byte equivalent JSON content; DLQ replay retains the explicit original partition.
3. Every consumer uses `autoCommit: false`; only `offset + 1` is committed after the required dispatch, intentional skip, permanent poison decision, or acknowledged DLQ/bridge write; revocation never commits in-flight work (completed-but-uncommitted records may replay under at-least-once).
4. Consumer assignment, not a sleep or `run()` resolution, is the readiness gate.
5. Shutdown closes admission, disconnects plugin consumers, stops DLQ/outbox workers, settles owned producer sends, then disconnects the producer before PostgreSQL/Redis; a timed-out native connect's cleanup is owned until settlement and awaited during shutdown.
6. Client logs/errors are normalized to stable platform codes and allowlisted coordinates; raw messages, objects, payloads, headers, keys, endpoints, credentials, and stacks are never logged.
7. The compatibility worker stores a successful `eachMessage` offset internally even with auto-commit disabled; stale generation/assignment or failed commit must throw so the client seeks the record.
8. Health retains its 200 ms contract. Phase 1 is a hard predecessor of every functional task; a temporary Confluent import may coexist with KafkaJS only in the uncommitted verification worktree.
