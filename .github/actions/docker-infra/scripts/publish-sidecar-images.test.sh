#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
temp=$(mktemp -d)
trap 'rm -rf "$temp"' EXIT
mkdir -m 700 "$temp/bin" "$temp/logs"

project=plexica-ci-sidecar-publish-01
pinned_registry=registry:2@sha256:a3d8aaa63ed8681a604f1dea0aa03f100d5895b6a58ace528858a7b332415373
cid=a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9
harness_digest=275f15d87a0a09b8a71a08b30b4f91d1fca1e5b8d1d9fdd5fbb4d795d1e0c1a2
plugin_digest=884f15d87a0a09b8a71a08b30b4f91d1fca1e5b8d1d9fdd5fbb4d795d1e09999
port=32771

cat >"$temp/bin/docker" <<MOCK
#!/usr/bin/env bash
printf 'docker %s\n' "\$*" >>"\${MOCK_LOG:?MOCK_LOG is required}"
case "\${1:-}" in
  image)
    [[ "\${2:-}" == inspect ]] || exit 1
    inspect_ref="\${*: -1}"
    case "\$inspect_ref" in
      *'/sidecar-harness:'*) printf '127.0.0.1:%s/sidecar-harness@sha256:%s\n' "$port" "$harness_digest" ;;
      *) printf '127.0.0.1:%s/%s\n' "$port" "\$(printf '%s' "\$inspect_ref" | sed -E 's#127\\.0\\.0\\.1:[0-9]+/([^:]+):latest#\\1@sha256:$plugin_digest#')" ;;
    esac
    ;;
  pull)
    if [[ "\$*" == *'/sidecar-harness:'* && "\${MOCK_PULL_FAIL:-0}" == 1 ]]; then
      echo 'manifest unknown' >&2; exit 1;
    fi
    if [[ "\$*" != *'/sidecar-harness:'* && "\${MOCK_PLUGIN_PULL_FAIL:-0}" == 1 ]]; then
      echo 'manifest unknown' >&2; exit 1;
    fi
    ;;
  run)
    [[ "\${MOCK_RUN_FAIL:-0}" == 1 ]] && exit 1
    printf '%s\n' "$cid"
    ;;
  port) printf '127.0.0.1:%s\n' "$port" ;;
  tag) ;;
  push)
    if [[ "\${2:-}" == *'/sidecar-harness'* && "\${MOCK_PUSH_FAIL:-0}" == 1 ]]; then
      echo 'denied: pushed what' >&2; exit 1;
    fi
    if [[ "\${2:-}" != *'/sidecar-harness'* && "\${MOCK_PLUGIN_PUSH_FAIL:-0}" == 1 ]]; then
      echo 'denied: pushed what' >&2; exit 1;
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
  shift 3
  PATH="$temp/bin:$PATH" RUNNER_TEMP="$temp/$runner" CI_COMPOSE_PROJECT="$project" \
    CI_RUNTIME_DIR="$runtime" HARNESS_TAG="plexica-ci-sidecar-harness:$project" \
    PLUGIN_IMAGE_TAG="${PLUGIN_IMAGE_TAG_OVERRIDE:-plexica-crm-plugin:$project}" \
    MOCK_LOG="$temp/logs/$log_prefix-docker.log" MOCK_RM_LOG="$temp/logs/$log_prefix-rm.log" \
    bash "$script_dir/publish-sidecar-images.sh"
}

harness_ref="127.0.0.1:$port/sidecar-harness@sha256:$harness_digest"
plugin_ref="127.0.0.1:$port/plexica-crm-plugin@sha256:$plugin_digest"

runtime=$(new_runtime success-run)
output=$(publish "$runtime" success-run success)
expected_output="CI_SIDECAR_HARNESS_IMAGE=$harness_ref
PLUGIN_SIDECAR_IMAGE=$plugin_ref"
[[ "$output" == "$expected_output" ]] || {
  echo 'Sidecar publish printed unexpected final references' >&2; exit 1;
}
env_file="$runtime/sidecar-images.env"
[[ -f "$env_file" ]] || { echo 'Sidecar images env file was not written' >&2; exit 1; }
[[ $(stat -c %a -- "$env_file") == 600 ]] || {
  echo 'Sidecar images env file is not mode 0600' >&2; exit 1;
}
content=$(cat -- "$env_file")
expected_env="CI_SIDECAR_HARNESS_IMAGE=$harness_ref
PLUGIN_SIDECAR_IMAGE=$plugin_ref"
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
# Both images must follow the push -> pull -> RepoDigests inspection order
# (buildx is absent on self-hosted runners), harness first, plugin second.
node -e '
const lines = require("node:fs").readFileSync(process.argv[1], "utf8").trim().split("\n");
const lastIndexOf = (pattern) => { let idx = -1; for (let i = 0; i < lines.length; i++) if (lines[i].endsWith(pattern)) idx = i; return idx; };
for (const repo of ["sidecar-harness", "plexica-crm-plugin"]) {
  const pushed = lines.findIndex((line) => line.endsWith(` push 127.0.0.1:'"$port"'/${repo}`));
  const pulled = lines.findIndex((line) => line.endsWith(` pull 127.0.0.1:'"$port"'/${repo}:latest`));
  const inspected = lastIndexOf(` image inspect --format {{index .RepoDigests 0}} 127.0.0.1:'"$port"'/${repo}:latest`);
  const tagged = lines.findIndex((line) => line.includes(` tag  `) && line.endsWith(` 127.0.0.1:'"$port"'/${repo}`));
  if ([pushed, pulled, inspected].some((v) => v < 0) || !(tagged < pushed && pushed < pulled && pulled <= inspected)) {
    console.error("ordering violated for", repo); process.exit(1);
  }
}
if (!(lastIndexOf("/sidecar-harness") < lines.findIndex((line) => line.includes(" push 127.0.0.1:'"$port"'/plexica-crm-plugin")))) {
  console.error("harness must be published before the plugin image"); process.exit(1);
}
' "$temp/logs/success-docker.log"
if grep -q '^docker buildx' "$temp/logs/success-docker.log"; then
  echo 'Sidecar publish still resolves the digest via buildx imagetools' >&2; exit 1;
fi
# A nested-registry plugin tag keeps only its final path segment as repo name.
runtime=$(new_runtime nested-tag)
PLUGIN_IMAGE_TAG_OVERRIDE='ghcr.io.example:1447/acme/nested/plexica-crm-plugin:9.9.9' \
  publish "$runtime" nested-tag nested >/dev/null
nested_ref="127.0.0.1:$port/plexica-crm-plugin@sha256:$plugin_digest"
grep -Fx "PLUGIN_SIDECAR_IMAGE=$nested_ref" "$runtime/sidecar-images.env" >/dev/null || {
  echo 'Nested plugin tag lost its repository name during publish' >&2; exit 1;
}

fail_case() {
  local name=$1 log_prefix=$2 shift_args_env=("$@")
  runtime=$(new_runtime "$name")
  local envs=("${@:3}")
  if env "${envs[@]}" bash -c "
    PATH=\"$temp/bin:\$PATH\" RUNNER_TEMP=\"$temp/$name\" CI_COMPOSE_PROJECT='$project' \
    CI_RUNTIME_DIR='$runtime' HARNESS_TAG='plexica-ci-sidecar-harness:$project' \
    PLUGIN_IMAGE_TAG='plexica-crm-plugin:$project' \
    MOCK_LOG=\"$temp/logs/$log_prefix-docker.log\" MOCK_RM_LOG=\"$temp/logs/$log_prefix-rm.log\" \
    bash '$script_dir/publish-sidecar-images.sh'
  " >"$temp/logs/$log_prefix.out" 2>&1; then
    echo "Sidecar publish succeeded despite failure scenario: $name" >&2; exit 1
  fi
  [[ ! -s "$runtime/sidecar-images.env" ]] || {
    echo "Env file was written despite failure scenario: $name" >&2; exit 1;
  }
  grep -Fx "$cid" "$temp/logs/$log_prefix-rm.log" >/dev/null || {
    echo "Ephemeral registry was not removed after failure scenario: $name" >&2; exit 1;
  }
}

fail_case harness-push-fail push MOCK_PUSH_FAIL=1
fail_case plugin-push-fail plugin-push MOCK_PLUGIN_PUSH_FAIL=1
fail_case harness-pull-fail pull MOCK_PULL_FAIL=1
fail_case plugin-pull-fail plugin-pull MOCK_PLUGIN_PULL_FAIL=1
