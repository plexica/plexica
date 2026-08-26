#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/ci-test-env-guard.sh"

script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
runtime=$(RUNNER_TEMP="$temp" bash "$script_dir/ci-runtime-env.sh" init plexica-ci-sidecar-test-123456)
if RUNNER_TEMP="$temp" CI_COMPOSE_PROJECT=plexica-ci-sidecar-test-123456 CI_RUNTIME_DIR="$runtime" bash "$script_dir/verify-ci-sidecar-lifecycle.sh"; then
  echo 'Sidecar proof accepted a runner without admission evidence' >&2; exit 1
fi

mkdir "$temp/bin"
export CI_COMPOSE_PROJECT=plexica-ci-sidecar-test-123456
printf 'project=%s\n' "$CI_COMPOSE_PROJECT" > "$runtime/admission.env"
chmod 600 "$runtime/admission.env"
cat > "$temp/bin/docker" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$COMMAND_LOG"
case "$*" in
  'build -q'*)
    case "$*" in
      *'ci-sidecar-harness.Dockerfile'*) printf 'sha256:1111111111111111111111111111111111111111111111111111111111111111\n' ;;
      *'plugins/crm/Dockerfile'*) printf 'sha256:2222222222222222222222222222222222222222222222222222222222222222\n' ;;
    esac ;;
  # The CRM presence probe targets the deterministic per-project tag (no
  # digest); MOCK_CRM_ABSENT simulates it not being cached yet.
  'image inspect'*)
    if [[ "${MOCK_CRM_ABSENT:-0}" == 1 && "$*" != *'@sha256:'* ]]; then exit 1; fi ;;
esac
exit 0
EOF
cat > "$temp/bin/publish-sidecar-images.sh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$0" >> "$COMMAND_LOG"
[[ "${HARNESS_TAG:-}" == plexica-ci-sidecar-harness:* ]]
[[ "${PLUGIN_IMAGE_TAG:-}" == plexica-crm-plugin:* ]]
digest=$(printf 'a%.0s' {1..64})
crmdigest=$(printf 'd%.0s' {1..64})
printf 'CI_SIDECAR_HARNESS_IMAGE=127.0.0.1:5000/sidecar-harness@sha256:%s\n' \
  "$digest" > "$CI_RUNTIME_DIR/sidecar-images.env"
printf 'PLUGIN_SIDECAR_IMAGE=127.0.0.1:5000/plexica-crm-plugin@sha256:%s\n' \
  "$crmdigest" >> "$CI_RUNTIME_DIR/sidecar-images.env"
EOF
chmod +x "$temp/bin/"*
PATH="$temp/bin:$PATH" PUBLISH_SIDECAR_IMAGES_CMD="$temp/bin/publish-sidecar-images.sh" COMMAND_LOG="$temp/commands" RUNNER_TEMP="$temp" CI_COMPOSE_PROJECT="$CI_COMPOSE_PROJECT" CI_RUNTIME_DIR="$runtime" \
  bash "$script_dir/verify-ci-sidecar-lifecycle.sh"
pinned="127.0.0.1:5000/sidecar-harness@sha256:$(printf 'a%.0s' {1..64})"
crmpinned="127.0.0.1:5000/plexica-crm-plugin@sha256:$(printf 'd%.0s' {1..64})"
grep -F "CI_SIDECAR_HARNESS_IMAGE=$pinned" "$temp/commands" >/dev/null
# The publisher must be resolved via PUBLISH_SIDECAR_IMAGES_CMD: PATH
# prepending alone would let the real production script shadow this fixture.
grep -Fx "$temp/bin/publish-sidecar-images.sh" "$temp/commands" >/dev/null
if grep -F "$script_dir/publish-sidecar-images.sh" "$temp/commands" >/dev/null; then
  echo 'Sidecar proof invoked the real publisher instead of the test stub' >&2; exit 1
fi
# Digest-vs-dead-registry cache-hit proof: BOTH pinned refs are resolved from
# the local daemon store after the ephemeral registry was removed.
grep -Fx "image inspect $pinned" "$temp/commands" >/dev/null
grep -Fx "image inspect $crmpinned" "$temp/commands" >/dev/null
if grep -F "CI_SIDECAR_HARNESS_IMAGE=$CI_COMPOSE_PROJECT" "$temp/commands" >/dev/null; then
  echo 'Sidecar proof used the unpinned local harness tag' >&2; exit 1
fi
# In-container proof contract: the exec must run the real lifecycle mjs whose probe retries startup refusals.
grep -F 'core-api-e2e node /workspace/services/core-api/scripts/verify-ci-sidecar-lifecycle.mjs' "$temp/commands" >/dev/null
# Layer hygiene + digest survival: EXIT cleanup must untag each built tag but
# NEVER rmi the recorded build image ids: the digest-pinned refs published to
# sidecar-images.env point at those very image objects and are the only
# surviving reference once the ephemeral registry exits. Run 32762992133: a
# forced `docker rmi -f <build id>` orphaned them, degrading every install
# with a dead-registry pull failure.
harness_id='sha256:1111111111111111111111111111111111111111111111111111111111111111'
grep -F 'build -q --tag plexica-ci-sidecar-harness:plexica-ci-sidecar-test-123456 ' "$temp/commands" >/dev/null
grep -Fx 'image rm -f plexica-ci-sidecar-harness:plexica-ci-sidecar-test-123456' "$temp/commands" >/dev/null
if grep -F "rmi -f $harness_id" "$temp/commands" >/dev/null; then
  echo 'Sidecar proof rmi-ed the harness image object referenced by its digest pin' >&2; exit 1
fi
# A pre-cached CRM image is reused untouched: no CRM build, no CRM cleanup.
if grep -F 'plugins/crm/Dockerfile' "$temp/commands" >/dev/null; then
  echo 'Sidecar proof rebuilt an already-present CRM plugin image' >&2; exit 1
fi
if grep -F 'rmi -f sha256:2222' "$temp/commands" >/dev/null; then
  echo 'Sidecar proof rmi-ed a pre-existing CRM image build output' >&2; exit 1
fi

# Missing CRM image: the proof must build it from the plugin Dockerfile before
# publication, and its EXIT cleanup must leave the published digest ref alive
# (untag only — never rmi the build output).
rm -f "$runtime/sidecar-images.env"
PATH="$temp/bin:$PATH" PUBLISH_SIDECAR_IMAGES_CMD="$temp/bin/publish-sidecar-images.sh" COMMAND_LOG="$temp/commands-crm-build" RUNNER_TEMP="$temp" CI_COMPOSE_PROJECT="$CI_COMPOSE_PROJECT" CI_RUNTIME_DIR="$runtime" \
  MOCK_CRM_ABSENT=1 bash "$script_dir/verify-ci-sidecar-lifecycle.sh"
crm_id='sha256:2222222222222222222222222222222222222222222222222222222222222222'
crm_build="build -q --tag plexica-crm-plugin:$CI_COMPOSE_PROJECT --file $PWD/examples/plugins/crm/Dockerfile $PWD"
grep -Fx "$crm_build" "$temp/commands-crm-build" >/dev/null ||
  { echo 'Sidecar proof did not build the missing CRM plugin image before publishing' >&2; exit 1; }
build_line=$(grep -n '^build -q --tag plexica-crm-plugin' "$temp/commands-crm-build" | cut -d: -f1)
publish_line=$(grep -n '^publish-sidecar\|/publish-sidecar-images.sh$' "$temp/commands-crm-build" | head -1 | cut -d: -f1)
[[ -n "$build_line" && -n "$publish_line" && "$build_line" -lt "$publish_line" ]] || {
  echo 'CRM image was built after sidecar publication started' >&2; exit 1;
}
if grep -Fx "rmi -f $crm_id" "$temp/commands-crm-build" >/dev/null; then
  echo 'CRM build output was rmi-ed although its digest pin must survive' >&2; exit 1;
fi

# Partial evidence (harness line only) is stale and must republish, not be
# trusted as complete two-image evidence.
printf 'CI_SIDECAR_HARNESS_IMAGE=%s\n' "$pinned" > "$runtime/sidecar-images.env"
: > "$temp/commands-partial"
cat > "$temp/bin/publish-sidecar-images.sh" <<'EOF'
#!/usr/bin/env bash
printf 'republish-partial\n' >> "$COMMAND_LOG"
digest=$(printf 'e%.0s' {1..64})
crmdigest=$(printf 'f%.0s' {1..64})
printf 'CI_SIDECAR_HARNESS_IMAGE=127.0.0.1:5000/sidecar-harness@sha256:%s\n' "$digest" > "$CI_RUNTIME_DIR/sidecar-images.env"
printf 'PLUGIN_SIDECAR_IMAGE=127.0.0.1:5000/plexica-crm-plugin@sha256:%s\n' "$crmdigest" >> "$CI_RUNTIME_DIR/sidecar-images.env"
EOF
chmod +x "$temp/bin/publish-sidecar-images.sh"
PATH="$temp/bin:$PATH" PUBLISH_SIDECAR_IMAGES_CMD="$temp/bin/publish-sidecar-images.sh" COMMAND_LOG="$temp/commands-partial" RUNNER_TEMP="$temp" CI_COMPOSE_PROJECT="$CI_COMPOSE_PROJECT" CI_RUNTIME_DIR="$runtime" \
  bash "$script_dir/verify-ci-sidecar-lifecycle.sh" --publish-only
grep -Fx 'republish-partial' "$temp/commands-partial" >/dev/null ||
  { echo 'Partial sidecar-images.env evidence was trusted without republishing' >&2; exit 1; }
rm -f "$runtime/sidecar-images.env"
cat > "$temp/bin/publish-sidecar-images.sh" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$temp/bin/publish-sidecar-images.sh"
if PATH="$temp/bin:$PATH" PUBLISH_SIDECAR_IMAGES_CMD="$temp/bin/publish-sidecar-images.sh" COMMAND_LOG="$temp/commands-failclosed" RUNNER_TEMP="$temp" CI_COMPOSE_PROJECT="$CI_COMPOSE_PROJECT" CI_RUNTIME_DIR="$runtime" \
  bash "$script_dir/verify-ci-sidecar-lifecycle.sh"; then
  echo 'Sidecar proof accepted missing sidecar-images.env evidence' >&2; exit 1
fi

# --publish-only publishes digest-pinned evidence without running the in-container proof.
rm -f "$runtime/sidecar-images.env"
: > "$temp/commands-publish"
cat > "$temp/bin/publish-sidecar-images.sh" <<'EOF'
#!/usr/bin/env bash
printf 'publish\n' >> "$COMMAND_LOG"
[[ "${HARNESS_TAG:-}" == plexica-ci-sidecar-harness:* ]]
[[ "${PLUGIN_IMAGE_TAG:-}" == plexica-crm-plugin:* ]]
digest=$(printf 'b%.0s' {1..64})
crmdigest=$(printf 'c%.0s' {1..64})
printf 'CI_SIDECAR_HARNESS_IMAGE=127.0.0.1:5000/sidecar-harness@sha256:%s\n' \
  "$digest" > "$CI_RUNTIME_DIR/sidecar-images.env"
printf 'PLUGIN_SIDECAR_IMAGE=127.0.0.1:5000/plexica-crm-plugin@sha256:%s\n' \
  "$crmdigest" >> "$CI_RUNTIME_DIR/sidecar-images.env"
EOF
chmod +x "$temp/bin/publish-sidecar-images.sh"
PATH="$temp/bin:$PATH" PUBLISH_SIDECAR_IMAGES_CMD="$temp/bin/publish-sidecar-images.sh" COMMAND_LOG="$temp/commands-publish" RUNNER_TEMP="$temp" CI_COMPOSE_PROJECT="$CI_COMPOSE_PROJECT" CI_RUNTIME_DIR="$runtime" \
  bash "$script_dir/verify-ci-sidecar-lifecycle.sh" --publish-only
grep -Fx 'publish' "$temp/commands-publish" >/dev/null
if grep -F ' exec ' "$temp/commands-publish" >/dev/null; then
  echo 'Publish-only mode ran the in-container proof phase' >&2; exit 1
fi

# Idempotency: existing complete two-image evidence skips rebuild and republish.
: > "$temp/commands-idempotent"
cat > "$temp/bin/publish-sidecar-images.sh" <<'EOF'
#!/usr/bin/env bash
printf 'republish\n' >> "$COMMAND_LOG"
EOF
chmod +x "$temp/bin/publish-sidecar-images.sh"
for mode in '' '--publish-only'; do
  PATH="$temp/bin:$PATH" PUBLISH_SIDECAR_IMAGES_CMD="$temp/bin/publish-sidecar-images.sh" COMMAND_LOG="$temp/commands-idempotent" RUNNER_TEMP="$temp" CI_COMPOSE_PROJECT="$CI_COMPOSE_PROJECT" CI_RUNTIME_DIR="$runtime" \
    bash "$script_dir/verify-ci-sidecar-lifecycle.sh" $mode
done
if grep -F 'republish' "$temp/commands-idempotent" >/dev/null; then
  echo 'Existing digest-pinned evidence triggered a rebuild and republish' >&2; exit 1
fi
[[ $(grep -c ' exec ' "$temp/commands-idempotent") == 1 ]]

# Digest-vs-dead-registry fail-closed path: a digest-pinned ref that does not
# resolve from the local daemon store after registry teardown must abort before
# the in-container proof runs.
rm -f "$runtime/sidecar-images.env"
cat > "$temp/bin/publish-sidecar-images.sh" <<'EOF'
#!/usr/bin/env bash
[[ "${HARNESS_TAG:-}" == plexica-ci-sidecar-harness:* ]]
[[ "${PLUGIN_IMAGE_TAG:-}" == plexica-crm-plugin:* ]]
digest=$(printf 'c%.0s' {1..64})
crmdigest=$(printf '9%.0s' {1..64})
printf 'CI_SIDECAR_HARNESS_IMAGE=127.0.0.1:5000/sidecar-harness@sha256:%s\n' \
  "$digest" > "$CI_RUNTIME_DIR/sidecar-images.env"
printf 'PLUGIN_SIDECAR_IMAGE=127.0.0.1:5000/plexica-crm-plugin@sha256:%s\n' \
  "$crmdigest" >> "$CI_RUNTIME_DIR/sidecar-images.env"
EOF
cat > "$temp/bin/docker" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$COMMAND_LOG"
if [[ "$*" == 'image inspect'* ]]; then exit 97; fi
EOF
chmod +x "$temp/bin/docker"
: > "$temp/commands-inspectfail"
if PATH="$temp/bin:$PATH" PUBLISH_SIDECAR_IMAGES_CMD="$temp/bin/publish-sidecar-images.sh" COMMAND_LOG="$temp/commands-inspectfail" RUNNER_TEMP="$temp" CI_COMPOSE_PROJECT="$CI_COMPOSE_PROJECT" CI_RUNTIME_DIR="$runtime" \
  bash "$script_dir/verify-ci-sidecar-lifecycle.sh"; then
  echo 'Sidecar proof accepted a digest ref unresolvable after registry teardown' >&2; exit 1
fi
grep -F 'image inspect 127.0.0.1:5000/sidecar-harness@sha256:' "$temp/commands-inspectfail" >/dev/null
if grep -F ' exec ' "$temp/commands-inspectfail" >/dev/null; then
  echo 'In-container proof ran despite failed digest resolution' >&2; exit 1
fi
