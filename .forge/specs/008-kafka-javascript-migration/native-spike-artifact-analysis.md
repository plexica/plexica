# Artifact Analysis — Phase 1 Native-Dependency Spike (Run 33081239038)

**Date:** 2026-08-27 14:15–14:19 UTC  
**Workflow:** `Kafka native dependency spike` (`.github/workflows/kafka-native-spike.yml` @ `2c74783`) — fixed `v4` + explicit `Enforce Phase 1 gate`  
**Branch/SHA:** `feat/kafka-javascript-migration` / `2c747836052300fb7a7d42652991ea77c2f29441`  
**Runner:** `dev-server-4` (self-hosted) — `dev-server 6.8.0-138-generic x86_64 GNU/Linux`  
**Run:** `33081239038` attempt `1` — conclusion `success` — artifact `kafka-native-spike-33081239038-1`

## Verdict

**overall: PASS** — `KJM-G01…G10 = PASS/PASS` on **both** required targets. Production migration is now authorized.

```json
{
  "overall": "PASS",
  "targets": [
    { "name": "runner", "workflowOutcome": "success", "complete": true },
    { "name": "core-runtime", "workflowOutcome": "success", "complete": true }
  ]
}
```

The `Enforce Phase 1 gate` step printed the summary and exited 0 only after confirming `overall == PASS` and both `steps.runner.outcome == success` / `steps.core.outcome == success`. `Upload immutable spike evidence` ran with `if: always()` so evidence is present even on failure — this time it was not needed.

## Target Identities

| Fact | Runner (self-hosted) | Pinned Core runtime |
|---|---|---|
| `runner.json` | `dev-server-4`, Node `v24.19.0`, modules `137`, napi `10`, arch `x64`, platform `linux`, glibcRuntime `2.39`, cpus `Intel Xeon E3-1245 V2` | N/A (container) |
| Image digest | — | `node:24-bookworm@sha256:934240a162082fd8b8a2f90cd5114446443f1eba1c5378f6687167ca405e6584` — verified via `docker image inspect` (`Architecture amd64`, `Os linux`, `NODE_VERSION 24.19.0`) |
| Redpanda | `docker.redpanda.com/redpandadata/redpanda:v23.3.5@sha256:342d52b03d70e8c605897b1756d6faab14067af6f8a969264093dabbce1858dd` (same for both) |
| Node ABI | 137 | 137 |

Ambient host vs isolated store distinction is preserved: the runner verification used a fresh `_work/_temp/kjm-runner-33081239038-1` worktree and empty store `kjm-runner-store-...`, not the host's ambient `node_modules`.

## Gate Evidence

### G01 — Clean frozen install
Both `install.log` show fresh `pnpm install --frozen-lockfile --store-dir <empty> --reporter=append-only` after `test ! -e node_modules` and `test ! -e <store>`. No cache reuse.

### G02 — Exact version
`package-list.json` (both): `"@confluentinc/kafka-javascript": "1.10.0"` with resolved `https://registry.npmjs.org/.../kafka-javascript-1.10.0.tgz`. `integrity.json` frozenLockIntegrity equals `sha512-6gLgZSxbtlC5kR/VOG1JE2m8Lb2NwXMDJmkEDunyj8yV/VyzjLTqH/SojMJ/SdcmwUxmXVwf7VC4ATK/gQsKxg==` in both.

### G03 — No source build
`install-verification.json` (both): `"remotePrebuilt": true`, `"sourceBuildExecution": false`, `"violations": []`. `install.log` shows `[info] check checked for "...confluent-kafka-javascript.node" (not found)` then `GET https://github.com/.../confluent-kafka-javascript-v1.10.0-node-v137-linux-glibc-x64.tar.gz` and `is installed via remote` with `extracted file count: 28` and `ok`. No `node-gyp`, `make`, or fallback-to-build execution beyond the remote download.

### G04 — Release asset integrity
`integrity.json` (both):
- `name` = `confluent-kafka-javascript-v1.10.0-node-v137-linux-glibc-x64.tar.gz`
- `size` = `5303578`, `downloadedSize` = `5303578`, `publishedDigest` = `sha256:ccc2a8b2fcf89e01c7dd6895ddfc2ad5599aff32bf090d6b9e02854f64e66358`, `localSha256` = same. Match verified in both targets. API URL `https://api.github.com/repos/confluentinc/confluent-kafka-javascript/releases/assets/463262216` matches plan.

### G05 — Native load + versions
`native.json` (both): `"packageVersion":"1.10.0"`, `"librdkafkaVersion":"2.15.0"`, `addonPath` ends with `build/Release/confluent-kafka-javascript.node`. `fileOutput` reports `ELF 64-bit LSB shared object, x86-64`. No load error. The package was imported once and the addon loaded without `hasAddon`/`hasUnresolved` flags.

### G06 — ELF / ldd compatibility
Both `fileOutput` = ELF64 x86-64 GNU. `lddOutput` contains `libstdc++.so.6 => /lib/x86_64-linux-gnu/libstdc++.so.6`, `libm`, `libgcc_s`, `libc.so.6`, `/lib64/ld-linux-x86-64.so.2` and **no `not found`** entry. No system librdkafka workaround installed.

### G07 — Real Redpanda admin/topic + acknowledged produce + assignment + offset
Both `smoke-success.jsonl` sequences identical in structure:
- `admin-topic-ready` partition 0 leader 0
- `consumer-assigned` partitions 1
- `producer-acknowledged` reports 1
- `consumer-received` sourceOffset "0"
- `offset-verified` sourceOffset "0" committedOffset "1" (explicit `offset+1` manual commit verified via Admin)
- `shutdown` order `consumer → producer → consumer-group → topic → admin` each `complete`
- `handles-verified` leaked 0, `smoke-complete` with expected Redpanda image

Supervisor `status=natural-exit exit_code=0 duration_seconds=1` for both.

### G08 — Ordered shutdown + no leaked handles + failure injection
Both `smoke-failure.jsonl` show injected-failure path also completes: `admin-topic-ready → consumer-assigned → shutdown* → handles-verified leaked 0 → injected-failure-cleanup-verified`. No consumer/producer skipped. Both supervisors natural-exit.

### G09 — No toolchain
`install.log` (both) never invokes compiler/make/Python; `install-verification.json` violations empty. The runner did not install `build-essential` or `librdkafka-dev`.

### G10 — Pinned Bookworm still glibc, not Alpine
Core runtime explicitly pulled and inspected the digest-pinned `node:24-bookworm` image; runner remains `x64 glibc 2.39` (not musl). No Alpine/musl result used to claim support.

## Workflow Fixes Verified

- Checkout/setup-node/upload-artifact now `@v4` (previously `@v7` would have 404’d).
- `Enforce Phase 1 gate` correctly required `overall == PASS` plus both outcomes `success`; it printed the summary and succeeded, so the job stays green only on true PASS. Without it, `continue-on-error: true` could have hidden a failure.

## Limitations / Follow-up

- Evidence is for `linux glibc x64` only (both targets). `arm64` digest `5f057e2c...` exists in plan but was not exercised — acceptable because current self-hosted fleet and Core runtime are `x64`.
- Artifact retention 30 days; `summary.json` is the single blocking signal for later CI. No secrets leaked in logs (verified no `headers`, `key`, or Redpanda credentials in smoke output).
- Local isolated Node 24 and Bookworm evidence from earlier (`/tmp/opencode/kjm-evidence/*-final`) is now superseded by this self-hosted artifact and may be archived.

## Decision

**Phase 1 gate: PASS** — authorized to proceed to full functional migration on `KafkaJS` compatibility API at exact `1.10.0` (ADR-004 amendment). Next step is `/forge-tasks` → implement producer/consumer/admin/topic/health/shutdown/log/error mapping per `plan.md` §§2–9, then dual-model `/forge-review`.
