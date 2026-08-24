#!/usr/bin/env bash
set -euo pipefail

fail() { printf '%s\n' "$*" >&2; exit 1; }
project=${1:?project is required}
dir=${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}
lock_path=${CI_CAPACITY_LOCK_PATH:-/tmp/plexica-ci-capacity-admission.lock}
cgroup_root=${CI_CGROUP_ROOT:-/sys/fs/cgroup}
meminfo=${CI_MEMINFO_PATH:-/proc/meminfo}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$script_dir/ci-runtime-path.sh"
validate_ci_runtime "$project" "$dir" || fail 'Unsafe CI runtime directory'
# Serialize the measure-and-admit window: concurrent jobs measuring headroom
# simultaneously could each see the full headroom and double-book memory.
# An exclusive lock on a machine-shared path (not the per-job runtime dir)
# ensures only one job measures and writes admission.env at a time.
lock_timeout=${CI_CAPACITY_LOCK_TIMEOUT:-120}
[[ "$lock_timeout" =~ ^[1-9][0-9]*$ ]] || fail 'Capacity lock timeout must be a positive integer seconds'
if ! exec 9>"$lock_path"; then fail 'Cannot open capacity admission lock'; fi
flock -w "$lock_timeout" 9 || fail 'Timed out waiting for capacity admission lock'
printf 'pid=%s\n' "$$" >&9
# Residual race (documented for reviewers): the lock covers only measurement
# and evidence write. Memory consumed AFTER admission is not reserved by
# Linux here — we hold no cgroup delegation, so a second job admitted right
# after release may still overcommit between admission and actual usage.
# Full guarantee would require cgroup-based reservation, out of scope.
cpus=$(getconf _NPROCESSORS_ONLN 2>/dev/null) || fail 'Cannot measure online CPUs'
# Cgroup layouts differ across self-hosted runners: v2 exposes memory.max and
# memory.current at the root, v1 nests them under memory/, and unconstrained
# hosts report "max" (v2) or a ~int64-max sentinel (v1) instead of a finite
# limit — or no controller files at all. Probe v2 first, then v1, then fall
# back to /proc/meminfo alone; any unbounded or missing limit derives the
# effective total from MemTotal so unconstrained hosts are admitted on their
# real memory while every numeric threshold below stays fail-closed.
memory=$(awk '/^MemTotal:/ {print $2 * 1024; ok = 1} END {exit !ok}' "$meminfo") ||
  fail 'Cannot read MemTotal from meminfo'
[[ "$memory" =~ ^[0-9]+$ ]] || fail 'MemTotal is not a byte count'
limit=''; used=''
if [[ -r "$cgroup_root/memory.max" ]]; then
  limit=$(cat "$cgroup_root/memory.max") || fail 'Cannot read cgroup v2 memory limit'
  used=$(cat "$cgroup_root/memory.current") || fail 'Cannot read cgroup v2 memory usage'
elif [[ -r "$cgroup_root/memory/memory.limit_in_bytes" ]]; then
  limit=$(cat "$cgroup_root/memory/memory.limit_in_bytes") || fail 'Cannot read cgroup v1 memory limit'
  used=$(cat "$cgroup_root/memory/memory.usage_in_bytes") || fail 'Cannot read cgroup v1 memory usage'
fi
constrained=0
if [[ -n "$limit" && "$limit" != max ]]; then
  [[ "$limit" =~ ^[0-9]+$ ]] || fail 'Cgroup memory limit is not a byte count'
  [[ "$used" =~ ^[0-9]+$ ]] || fail 'Cgroup memory usage is not a byte count'
  # awk comparison: v1 sentinels exceed bash int64 range.
  if awk -v l="$limit" 'BEGIN {exit !(l < 4611686018427387904)}'; then constrained=1; memory=$limit; fi
fi
available=$(awk '/^MemAvailable:/ {print $2 * 1024; ok = 1} END {exit !ok}' "$meminfo") ||
  fail 'Cannot measure memory headroom'
[[ "$available" =~ ^[0-9]+$ ]] || fail 'MemAvailable is not a byte count'
headroom=$available
if (( constrained )); then
  (( memory > used )) || fail 'Cgroup memory usage exceeds its limit'
  headroom=$(( memory - used ))
fi
(( available < headroom )) && headroom=$available
docker_root=$(docker info --format '{{.DockerRootDir}}' 2>/dev/null) || fail 'Cannot read Docker root'
free=$(df -PB1 "$docker_root" | awk 'NR == 2 {print $4}') || fail 'Cannot measure Docker root free space'
(( cpus >= 4 )) || fail 'Runner requires at least 4 online CPUs'
(( memory >= 16 * 1024 * 1024 * 1024 )) || fail 'Runner requires at least 16 GiB cgroup memory'
(( headroom >= 12 * 1024 * 1024 * 1024 )) || fail 'Runner requires at least 12 GiB headroom'
(( free >= 60 * 1024 * 1024 * 1024 )) || fail 'Runner requires at least 60 GiB Docker root free space'
# Atomic tmp+mv: a crash mid-write must never leave a partial admission.env
# that later idempotent reads would treat as poisoned evidence.
temp=$(mktemp "$dir/admission.env.XXXXXX")
printf 'project=%s\ncpus=%s\ncgroup_memory_bytes=%s\nheadroom_bytes=%s\ndocker_root_free_bytes=%s\n' \
  "$project" "$cpus" "$memory" "$headroom" "$free" > "$temp"
chmod 600 "$temp"
mv "$temp" "$dir/admission.env"
flock -u 9
exec 9>&-
