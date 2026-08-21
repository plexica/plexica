#!/usr/bin/env bash
set -euo pipefail

fail() { printf '%s\n' "$*" >&2; exit 1; }
project=${1:?project is required}
dir=${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}
marker=${PLEXICA_CI_RUNNER_MARKER:-/etc/plexica-ci-concurrent-e2e}
[[ -r "$marker" ]] || fail 'Missing readable plexica-ci-concurrent-e2e runner marker'
cpus=$(getconf _NPROCESSORS_ONLN 2>/dev/null) || fail 'Cannot measure online CPUs'
if [[ -r /sys/fs/cgroup/memory.max ]]; then
  memory=$(cat /sys/fs/cgroup/memory.max); used=$(cat /sys/fs/cgroup/memory.current)
elif [[ -r /sys/fs/cgroup/memory/memory.limit_in_bytes ]]; then
  memory=$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes); used=$(cat /sys/fs/cgroup/memory/memory.usage_in_bytes)
else
  fail 'Cannot read cgroup memory limit and usage'
fi
[[ "$memory" != max ]] || fail 'Cgroup memory limit must be finite'
available=$(awk '/MemAvailable:/ {print $2 * 1024}' /proc/meminfo) || fail 'Cannot measure memory headroom'
(( memory > used )) || fail 'Cgroup memory usage exceeds its limit'
headroom=$(( memory - used )); (( available < headroom )) && headroom=$available
docker_root=$(docker info --format '{{.DockerRootDir}}' 2>/dev/null) || fail 'Cannot read Docker root'
free=$(df -PB1 "$docker_root" | awk 'NR == 2 {print $4}') || fail 'Cannot measure Docker root free space'
(( cpus >= 4 )) || fail 'Runner requires at least 4 online CPUs'
(( memory >= 16 * 1024 * 1024 * 1024 )) || fail 'Runner requires at least 16 GiB cgroup memory'
(( headroom >= 12 * 1024 * 1024 * 1024 )) || fail 'Runner requires at least 12 GiB headroom'
(( free >= 60 * 1024 * 1024 * 1024 )) || fail 'Runner requires at least 60 GiB Docker root free space'
mkdir -p "$dir"; chmod 700 "$dir"
printf 'project=%s\ncpus=%s\ncgroup_memory_bytes=%s\nheadroom_bytes=%s\ndocker_root_free_bytes=%s\n' \
  "$project" "$cpus" "$memory" "$headroom" "$free" > "$dir/admission.env"
chmod 600 "$dir/admission.env"
