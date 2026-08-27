#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 4 ]]; then
  printf 'Usage: run-target.sh <evidence-dir> <store-dir> <brokers> <scope>\n' >&2
  exit 2
fi

evidence_dir=$1
store_dir=$2
brokers=$3
scope=$4
script_dir=services/core-api/scripts/native-spike

test -d "$evidence_dir"
test ! -e node_modules
test ! -e "$store_dir"
mkdir "$store_dir"

{
  printf 'target=%s\n' "$scope"
  printf 'node_modules_before=absent\n'
  printf 'store=%s\n' "$store_dir"
  printf 'store_entries_before=%s\n' "$(ls -A "$store_dir" | wc -l)"
  printf 'command=pnpm install --frozen-lockfile --store-dir <empty-store> --reporter=append-only\n'
  node --version
  pnpm --version
  pnpm install --frozen-lockfile --store-dir "$store_dir" --reporter=append-only
} 2>&1 | tee "$evidence_dir/install.log"

pnpm --filter core-api list @confluentinc/kafka-javascript --depth 0 --json \
  > "$evidence_dir/package-list.json"
node "$script_dir/verify-install-log.mjs" "$evidence_dir/install.log" \
  > "$evidence_dir/install-verification.json"
node "$script_dir/verify-integrity.mjs" > "$evidence_dir/integrity.json"
env -u LD_LIBRARY_PATH node "$script_dir/verify-native.mjs" > "$evidence_dir/native.json"

start_time=$(date +%s)
timeout --signal=TERM --kill-after=5s 45s \
  env -u LD_LIBRARY_PATH node "$script_dir/redpanda-smoke.mjs" "$brokers" "$scope" success \
  > "$evidence_dir/smoke-success.jsonl"
duration=$(( $(date +%s) - start_time ))
printf 'status=natural-exit\nexit_code=0\nduration_seconds=%s\n' "$duration" \
  > "$evidence_dir/smoke-success-supervisor.txt"

start_time=$(date +%s)
timeout --signal=TERM --kill-after=5s 45s \
  env -u LD_LIBRARY_PATH node "$script_dir/redpanda-smoke.mjs" "$brokers" "$scope" failure \
  > "$evidence_dir/smoke-failure.jsonl"
duration=$(( $(date +%s) - start_time ))
printf 'status=natural-exit\nexit_code=0\nduration_seconds=%s\n' "$duration" \
  > "$evidence_dir/smoke-failure-supervisor.txt"

printf '{"target":"%s","status":"PASS"}\n' "$scope" > "$evidence_dir/result.json"
