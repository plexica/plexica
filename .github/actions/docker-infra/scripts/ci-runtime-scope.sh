#!/usr/bin/env bash
set -euo pipefail

project=${1:?project is required}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$script_dir/ci-runtime-path.sh"
valid_ci_project "$project" || { echo 'Invalid CI Compose project ID' >&2; exit 1; }
printf 'ci-%s\n' "$(printf '%s' "$project" | sha256sum | cut -c1-28)"
