#!/usr/bin/env bash
# shellcheck shell=bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
runtime=${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}
exports=$(bash "$script_dir/ci-runtime-env.sh" export-host "$runtime" "${CI_RUNTIME_HOST_STAGE:-complete}")
eval "$exports"
