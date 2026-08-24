#!/usr/bin/env bash
set -euo pipefail

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
  'build -q'*) printf 'sha256:1111111111111111111111111111111111111111111111111111111111111111\n' ;;
esac
exit 0
EOF
cat > "$temp/bin/publish-sidecar-images.sh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$0" >> "$COMMAND_LOG"
[[ "${HARNESS_TAG:-}" == plexica-ci-sidecar-harness:* ]]
digest=$(printf 'a%.0s' {1..64})
printf 'CI_SIDECAR_HARNESS_IMAGE=127.0.0.1:5000/sidecar-harness@sha256:%s\n' \
  "$digest" > "$CI_RUNTIME_DIR/sidecar-images.env"
EOF
chmod +x "$temp/bin/"*
PATH="$temp/bin:$PATH" PUBLISH_SIDECAR_IMAGES_CMD="$temp/bin/publish-sidecar-images.sh" COMMAND_LOG="$temp/commands" RUNNER_TEMP="$temp" CI_COMPOSE_PROJECT="$CI_COMPOSE_PROJECT" CI_RUNTIME_DIR="$runtime" \
  bash "$script_dir/verify-ci-sidecar-lifecycle.sh"
pinned="127.0.0.1:5000/sidecar-harness@sha256:$(printf 'a%.0s' {1..64})"
grep -F "CI_SIDECAR_HARNESS_IMAGE=$pinned" "$temp/commands" >/dev/null
# The publisher must be resolved via PUBLISH_SIDECAR_IMAGES_CMD: PATH
# prepending alone would let the real production script shadow this fixture.
grep -Fx "$temp/bin/publish-sidecar-images.sh" "$temp/commands" >/dev/null
if grep -F "$script_dir/publish-sidecar-images.sh" "$temp/commands" >/dev/null; then
  echo 'Sidecar proof invoked the real publisher instead of the test stub' >&2; exit 1
fi
# Digest-vs-dead-registry cache-hit proof: the pinned ref is resolved from the
# local daemon store after the ephemeral registry was removed.
grep -Fx "image inspect $pinned" "$temp/commands" >/dev/null
if grep -F "CI_SIDECAR_HARNESS_IMAGE=$CI_COMPOSE_PROJECT" "$temp/commands" >/dev/null; then
  echo 'Sidecar proof used the unpinned local harness tag' >&2; exit 1
fi
# Layer hygiene: EXIT cleanup must remove the tag AND rmi the recorded build
# image id so build layers do not accumulate in the daemon store per run.
harness_id='sha256:1111111111111111111111111111111111111111111111111111111111111111'
grep -F 'build -q --tag plexica-ci-sidecar-harness:plexica-ci-sidecar-test-123456 ' "$temp/commands" >/dev/null
grep -Fx 'image rm -f plexica-ci-sidecar-harness:plexica-ci-sidecar-test-123456' "$temp/commands" >/dev/null
grep -Fx "rmi -f $harness_id" "$temp/commands" >/dev/null
rm -f "$runtime/sidecar-images.env"
cat > "$temp/bin/publish-sidecar-images.sh" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
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
digest=$(printf 'b%.0s' {1..64})
printf 'CI_SIDECAR_HARNESS_IMAGE=127.0.0.1:5000/sidecar-harness@sha256:%s\n' \
  "$digest" > "$CI_RUNTIME_DIR/sidecar-images.env"
EOF
chmod +x "$temp/bin/publish-sidecar-images.sh"
PATH="$temp/bin:$PATH" PUBLISH_SIDECAR_IMAGES_CMD="$temp/bin/publish-sidecar-images.sh" COMMAND_LOG="$temp/commands-publish" RUNNER_TEMP="$temp" CI_COMPOSE_PROJECT="$CI_COMPOSE_PROJECT" CI_RUNTIME_DIR="$runtime" \
  bash "$script_dir/verify-ci-sidecar-lifecycle.sh" --publish-only
grep -Fx 'publish' "$temp/commands-publish" >/dev/null
if grep -F ' exec ' "$temp/commands-publish" >/dev/null; then
  echo 'Publish-only mode ran the in-container proof phase' >&2; exit 1
fi

# Idempotency: existing digest-pinned evidence skips rebuild and republish.
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
digest=$(printf 'c%.0s' {1..64})
printf 'CI_SIDECAR_HARNESS_IMAGE=127.0.0.1:5000/sidecar-harness@sha256:%s\n' \
  "$digest" > "$CI_RUNTIME_DIR/sidecar-images.env"
EOF
cat > "$temp/bin/docker" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$COMMAND_LOG"
case "$*" in
  'image inspect'*) exit 97 ;;
esac
exit 0
EOF
chmod +x "$temp/bin/"*
: > "$temp/commands-inspectfail"
if PATH="$temp/bin:$PATH" PUBLISH_SIDECAR_IMAGES_CMD="$temp/bin/publish-sidecar-images.sh" COMMAND_LOG="$temp/commands-inspectfail" RUNNER_TEMP="$temp" CI_COMPOSE_PROJECT="$CI_COMPOSE_PROJECT" CI_RUNTIME_DIR="$runtime" \
  bash "$script_dir/verify-ci-sidecar-lifecycle.sh"; then
  echo 'Sidecar proof accepted a digest ref unresolvable after registry teardown' >&2; exit 1
fi
grep -F 'image inspect 127.0.0.1:5000/sidecar-harness@sha256:' "$temp/commands-inspectfail" >/dev/null
if grep -F ' exec ' "$temp/commands-inspectfail" >/dev/null; then
  echo 'In-container proof ran despite failed digest resolution' >&2; exit 1
fi
