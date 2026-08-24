#!/usr/bin/env bash
set -euo pipefail

dir=$(cd -- "$(dirname -- "$0")" && pwd)
temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
mkdir "$temp/bin"; log="$temp/log"
project=plexica-ci-cleanup-123456
scope="ci-$(printf '%s' "$project" | sha256sum | cut -c1-28)"
export RUNNER_TEMP="$temp"
export CI_RUNTIME_DIR="$(bash "$dir/ci-runtime-env.sh" init "$project")"
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
export CI_RUNTIME_DIR="$(bash "$dir/ci-runtime-env.sh" init "$project")"
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
export CI_RUNTIME_DIR="$(bash "$dir/ci-runtime-env.sh" init "$project")"
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
