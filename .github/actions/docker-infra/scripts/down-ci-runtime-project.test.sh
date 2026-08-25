#!/usr/bin/env bash
set -euo pipefail

dir=$(cd -- "$(dirname -- "$0")" && pwd)
temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
mkdir "$temp/bin"; log="$temp/log"
project=plexica-ci-cleanup-123456
scope="ci-$(printf '%s' "$project" | sha256sum | cut -c1-28)"
export RUNNER_TEMP="$temp"
# Each scenario needs a PRISTINE runtime directory: init refuses an existing
# path, and a failed teardown scenario leaves its directory behind — a plain
# re-init would silently return empty and make the next assertion vacuous.
fresh_runtime() {
  rm -rf -- "$RUNNER_TEMP/plexica-ci/$project"
  CI_RUNTIME_DIR="$(bash "$dir/ci-runtime-env.sh" init "$project")"
  export CI_RUNTIME_DIR
}
fresh_runtime
printf 'KEYCLOAK_ADMIN_USER=ci-admin-user-0001\nKEYCLOAK_ADMIN_PASSWORD=plaintext-secret-0001\n' > "$CI_RUNTIME_DIR/host.env"
cat > "$temp/bin/docker" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  *'label=com.docker.compose.project='*) [[ "$*" == *'ps -aq'* ]] && printf 'compose\n' ;;
  # Two sidecars: every emitted ID must survive the selection loop and be
  # force-removed (a `read -a` teardown would only capture the first line).
  *'label=io.plexica.runtime-scope='*) [[ "$*" == *'ps -aq'* ]] && printf 'sidecar-1\nsidecar-2\n' ;;
  # Fields (comma-delimited): com.docker.compose.project (empty: Dockerode
  # sidecars carry no compose-managed metadata), io.plexica.runtime-project,
  # io.plexica.installation.
  *'inspect'*'io.plexica.installation'*) printf ',plexica-ci-cleanup-123456,123e4567-e89b-42d3-a456-426614174000\n' ;;
  *'inspect'*'NetworkSettings'*) printf 'plexica-ci-cleanup-123456_default\n' ;;
  *'inspect'*'.Name'*) printf '/plexica-plugin-%s-320159ebe3219112\n' "$CI_PLUGIN_SCOPE" ;;
  *'inspect'*) printf 'plexica-ci-cleanup-123456\n' ;;
  *'rm -f sidecar-1 sidecar-2'*) printf 'removed-sidecars\n' >> "$COMMAND_LOG" ;;
  compose*down*) printf 'down\n' >> "$COMMAND_LOG" ;;
esac
EOF
chmod +x "$temp/bin/docker"
PATH="$temp/bin:$PATH" COMMAND_LOG="$log" CI_PLUGIN_SCOPE="$scope" CI_COMPOSE_PROJECT="$project" bash "$dir/down-ci-runtime-project.sh"
node -e 'const lines=require("node:fs").readFileSync(process.argv[1],"utf8").trim().split("\n"); if (lines[0] !== "removed-sidecars" || lines[1] !== "down") process.exit(1)' "$log"
[[ ! -e "$CI_RUNTIME_DIR" ]] || { echo 'Teardown retained the runtime directory with plaintext credentials' >&2; exit 1; }
fresh_runtime
cat > "$temp/bin/docker" <<'EOF'
#!/usr/bin/env bash
 case "$*" in *'label=io.plexica.runtime-scope='*) [[ "$*" == *'ps -aq'* ]] && printf 'foreign\n' ;; *) printf ',plexica-ci-foreign-123456,123e4567-e89b-42d3-a456-426614174000\n' ;; esac
EOF
chmod +x "$temp/bin/docker"
if PATH="$temp/bin:$PATH" CI_COMPOSE_PROJECT="$project" bash "$dir/down-ci-runtime-project.sh"; then
  echo 'Teardown accepted an unlabelled or foreign sidecar' >&2; exit 1
fi
# Forged-ownership negative: plugin sidecars are created by Dockerode without
# compose-managed metadata, so teardown ownership is proven ONLY by the
# explicit io.plexica.runtime-project label. A sidecar that merely reuses the
# Compose project label (or omits ownership entirely) must be refused.
fresh_runtime
cat > "$temp/bin/docker" <<EOF
#!/usr/bin/env bash
case "\$*" in
  *'label=io.plexica.runtime-scope='*) [[ "\$*" == *'ps -aq'* ]] && printf 'forged\n' ;;
  *) printf ',,123e4567-e89b-42d3-a456-426614174000\n' ;;
esac
EOF
chmod +x "$temp/bin/docker"
if PATH="$temp/bin:$PATH" CI_COMPOSE_PROJECT="$project" bash "$dir/down-ci-runtime-project.sh"; then
  echo 'Teardown accepted a sidecar without explicit runtime-project ownership' >&2; exit 1
fi
# Regression (run 32909698601): a project whose runtime NEVER STARTED selects
# zero containers. `mapfile <<< ""` would yield one empty element and
# `docker rm -f ''` fails with "container name cannot be empty", breaking the
# if:always() teardown of failed jobs. Teardown must skip rm entirely and still
# run compose down + remove the runtime directory.
fresh_runtime
printf 'KEYCLOAK_ADMIN_USER=ci-admin-user-0001\nKEYCLOAK_ADMIN_PASSWORD=plaintext-secret-0001\n' > "$CI_RUNTIME_DIR/host.env"
log_empty="$temp/log-empty"
cat > "$temp/bin/docker" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  *'ps -aq'*) ;;
  *rm\ -f*) echo "unexpected docker rm on empty selection: $*" >&2; exit 1 ;;
  compose*down*) printf 'down\n' >> "$COMMAND_LOG" ;;
esac
EOF
chmod +x "$temp/bin/docker"
PATH="$temp/bin:$PATH" COMMAND_LOG="$log_empty" CI_COMPOSE_PROJECT="$project" bash "$dir/down-ci-runtime-project.sh"
[[ "$(cat "$log_empty")" == 'down' ]] || { echo 'Zero-sidecar teardown did not run compose down exactly once' >&2; exit 1; }
[[ ! -e "$CI_RUNTIME_DIR" ]] || { echo 'Zero-sidecar teardown retained the runtime directory' >&2; exit 1; }
