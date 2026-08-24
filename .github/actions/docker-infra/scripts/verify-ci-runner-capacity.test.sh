#!/usr/bin/env bash
set -euo pipefail

script="$(dirname "$0")/verify-ci-runner-capacity.sh"
temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
mkdir -p "$temp/bin" "$temp/cgroup"
printf '17179869184\n' > "$temp/cgroup/memory.max"; printf '0\n' > "$temp/cgroup/memory.current"
printf 'MemAvailable: 16777216 kB\n' > "$temp/meminfo"
cat > "$temp/bin/getconf" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "${TEST_CPUS:-4}"
EOF
cat > "$temp/bin/docker" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$TEST_DOCKER_ROOT"
EOF
cat > "$temp/bin/df" <<'EOF'
#!/usr/bin/env bash
printf 'Filesystem 1B-blocks Used Available Use%% Mounted on\n/dev/test 1 1 %s 1%% /\n' "${TEST_FREE:-64424509440}"
EOF
chmod +x "$temp/bin/"*
runtime=$(RUNNER_TEMP="$temp" bash "$(dirname "$script")/ci-runtime-env.sh" init plexica-ci-contract-123456)
run() { PATH="$temp/bin:$PATH" TEST_DOCKER_ROOT="$temp" RUNNER_TEMP="$temp" CI_RUNTIME_DIR="$runtime" CI_CAPACITY_LOCK_PATH="$temp/capacity.lock" CI_CGROUP_ROOT="$temp/cgroup" CI_MEMINFO_PATH="$temp/meminfo" bash "$script" plexica-ci-contract-123456; }
run
# Final content only: admission.env holds exactly the evidence keys and values
# this run measured, mode 600.
[[ $(stat -c %a "$runtime/admission.env") == 600 ]]
diff <(cut -d= -f1 "$runtime/admission.env" | sort) \
  <(printf 'cpus\ncgroup_memory_bytes\ndocker_root_free_bytes\nheadroom_bytes\nproject\n' | sort) >/dev/null || {
  echo 'admission.env has unexpected keys' >&2; exit 1;
}
source "$runtime/admission.env"
[[ "$project" == plexica-ci-contract-123456 && "$cpus" == 4 && "$cgroup_memory_bytes" == 17179869184 &&
   "$headroom_bytes" == 17179869184 && "$docker_root_free_bytes" == 64424509440 ]] || {
  echo 'admission.env recorded wrong measurements' >&2; exit 1;
}
if TEST_CPUS=3 run; then echo 'Admission accepted too few CPUs' >&2; exit 1; fi
printf '17179869183\n' > "$temp/cgroup/memory.max"
if run; then echo 'Admission accepted too little cgroup memory' >&2; exit 1; fi
printf '17179869184\n' > "$temp/cgroup/memory.max"; printf '4294967297\n' > "$temp/cgroup/memory.current"
if run; then echo 'Admission accepted too little headroom' >&2; exit 1; fi
printf '0\n' > "$temp/cgroup/memory.current"
if TEST_FREE=64424509439 run; then echo 'Admission accepted too little Docker storage' >&2; exit 1; fi
# Serialized admission: sequential invocations both succeed while sharing one lock file.
run && run
if [[ ! -s "$temp/capacity.lock" ]]; then echo 'Capacity lock file was not created' >&2; exit 1; fi
# Simulated concurrent holder: a held exclusive lock must make admission fail closed.
( flock -x 9; sleep 5 ) 9>"$temp/capacity.lock" & holder=$!
sleep 0.5
if CI_CAPACITY_LOCK_TIMEOUT=1 run; then echo 'Admission ignored held capacity lock' >&2; exit 1; fi
wait "$holder"
run
