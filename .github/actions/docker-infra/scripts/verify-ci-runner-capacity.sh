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
if [[ -r "$cgroup_root/memory.max" ]]; then
  memory=$(cat "$cgroup_root/memory.max"); used=$(cat "$cgroup_root/memory.current")
elif [[ -r "$cgroup_root/memory/memory.limit_in_bytes" ]]; then
  memory=$(cat "$cgroup_root/memory/memory.limit_in_bytes"); used=$(cat "$cgroup_root/memory/memory.usage_in_bytes")
else
  fail 'Cannot read cgroup memory limit and usage'
fi
[[ "$memory" != max ]] || fail 'Cgroup memory limit must be finite'
available=$(awk '/MemAvailable:/ {print $2 * 1024}' "$meminfo") || fail 'Cannot measure memory headroom'
(( memory > used )) || fail 'Cgroup memory usage exceeds its limit'
headroom=$(( memory - used )); (( available < headroom )) && headroom=$available
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
