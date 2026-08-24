#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
temp=$(mktemp -d)
trap 'rm -rf "$temp"' EXIT
mkdir -m 700 "$temp/bin" "$temp/logs"

project=plexica-ci-sidecar-publish-01
pinned_registry=registry:2@sha256:a3d8aaa63ed8681a604f1dea0aa03f100d5895b6a58ace528858a7b332415373
cid=a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9
pushed_digest=275f15d87a0a09b8a71a08b30b4f91d1fca1e5b8d1d9fdd5fbb4d795d1e0c1a2
port=32771

cat >"$temp/bin/docker" <<MOCK
#!/usr/bin/env bash
printf 'docker %s\n' "\$*" >>"\${MOCK_LOG:?MOCK_LOG is required}"
case "\${1:-}" in
  buildx)
    [[ "\${3:-}" == inspect ]] || exit 1
    ref=\${4:?}
    printf 'Name: %s\nDigest: sha256:%s\n' "\$ref" "$pushed_digest"
    ;;
  run)
    [[ "\${MOCK_RUN_FAIL:-0}" == 1 ]] && exit 1
    printf '%s\n' "$cid"
    ;;
  port)
    printf '127.0.0.1:%s\n' "$port"
    ;;
  tag)
    ;;
  push)
    if [[ "\${MOCK_PUSH_FAIL:-0}" == 1 ]]; then
      echo 'denied: pushed what' >&2
      exit 1
    fi
    ;;
  rm)
    printf '%s\n' "\${3:-}" >>"\${MOCK_RM_LOG:?MOCK_RM_LOG is required}"
    ;;
esac
exit 0
MOCK
cat >"$temp/bin/curl" <<'MOCK'
#!/usr/bin/env bash
exit 0
MOCK
chmod +x "$temp/bin/docker" "$temp/bin/curl"

new_runtime() {
  local runner="$temp/$1"
  mkdir -m 700 "$runner"
  RUNNER_TEMP="$runner" bash "$script_dir/ci-runtime-env.sh" init "$project"
}

publish() {
  local runtime=$1 runner=$2 log_prefix=$3
  PATH="$temp/bin:$PATH" RUNNER_TEMP="$temp/$runner" CI_COMPOSE_PROJECT="$project" \
    CI_RUNTIME_DIR="$runtime" HARNESS_TAG="plexica-ci-sidecar-harness:$project" \
    MOCK_LOG="$temp/logs/$log_prefix-docker.log" MOCK_RM_LOG="$temp/logs/$log_prefix-rm.log" \
    bash "$script_dir/publish-sidecar-images.sh"
}

final_ref="127.0.0.1:$port/sidecar-harness@sha256:$pushed_digest"
expected_env="CI_SIDECAR_HARNESS_IMAGE=$final_ref"

runtime=$(new_runtime success-run)
output=$(publish "$runtime" success-run success)
[[ "$output" == "$final_ref" ]] || {
  echo 'Sidecar publish printed an unexpected final reference' >&2; exit 1;
}
env_file="$runtime/sidecar-images.env"
[[ -f "$env_file" ]] || { echo 'Sidecar images env file was not written' >&2; exit 1; }
[[ $(stat -c %a -- "$env_file") == 600 ]] || {
  echo 'Sidecar images env file is not mode 0600' >&2; exit 1;
}
content=$(cat -- "$env_file")
[[ "$content" == "$expected_env" ]] || {
  echo "Unexpected env file content: $content" >&2; exit 1;
}
grep -Fx "$cid" "$temp/logs/success-rm.log" >/dev/null || {
  echo 'Ephemeral registry was not removed after a successful publish' >&2; exit 1;
}
# Cleanup must be registered for EXIT and the INT/TERM signals too.
trap_line=$(grep -c "^trap " -- "$script_dir/publish-sidecar-images.sh")
[[ "$trap_line" == 2 ]] || {
  echo 'Ephemeral registry cleanup must be registered for EXIT and INT/TERM' >&2; exit 1;
}
grep -q "^trap 'remove_registry; exit 130' INT TERM$" -- "$script_dir/publish-sidecar-images.sh" || {
  echo 'Ephemeral registry cleanup misses the INT/TERM traps' >&2; exit 1;
}
# The ephemeral registry must carry the project + runtime-scope labels so
# scoped teardown tooling can attribute it, and must use the pinned
# registry:2@sha256 reference (no dynamic buildx inspection).
run_line=$(grep '^docker run -d ' "$temp/logs/success-docker.log")
scope=ci-$(printf '%s' "$project" | sha256sum | cut -c1-28)
[[ "$run_line" == *"--label com.docker.compose.project=$project "* ]] || {
  echo 'Ephemeral registry lacks the compose project label' >&2; exit 1;
}
[[ "$run_line" == *" $pinned_registry" ]] || {
  echo 'Ephemeral registry does not use the pinned registry:2 digest reference' >&2; exit 1;
}
[[ "$run_line" == *"--label io.plexica.runtime-scope=$scope "* ]] || {
  echo 'Ephemeral registry lacks the runtime-scope label' >&2; exit 1;
}
[[ $(find "$runtime" -maxdepth 1 -name '.sidecar-images.env.*' | wc -l) -eq 0 ]] || {
  echo 'Staging artifacts were left behind in the runtime directory' >&2; exit 1;
}

runtime=$(new_runtime push-fail)
if MOCK_PUSH_FAIL=1 publish "$runtime" push-fail push >"$temp/logs/push-fail.out" 2>&1; then
  echo 'Sidecar publish succeeded despite a failed push' >&2; exit 1
fi
[[ ! -s "$runtime/sidecar-images.env" ]] || {
  echo 'Env file was written despite a failed push' >&2; exit 1;
}
grep -Fx "$cid" "$temp/logs/push-rm.log" >/dev/null || {
  echo 'Ephemeral registry was not removed after a failed push' >&2; exit 1;
}
