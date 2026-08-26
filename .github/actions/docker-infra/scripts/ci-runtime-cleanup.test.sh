#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/ci-test-env-guard.sh"

dir=$(dirname "$0")
temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
project=plexica-ci-cleanup-123456
scope="ci-$(printf '%s' "$project" | sha256sum | cut -c1-28)"
export RUNNER_TEMP="$temp"; runtime="$(bash "$dir/ci-runtime-env.sh" init "$project")"; mkdir -p "$temp/bin"
log="$temp/log"
export COMMAND_LOG="$log"
printf 'MINIO_SECRET_KEY=super-secret\nDATABASE_URL=postgresql://user:database-secret@postgres:5432/plexica\n' > "$runtime/container.env"
printf 'POSTGRES_HOST_URL=postgresql://user:database-secret@127.0.0.1:32000/plexica\n' > "$runtime/host.env"
printf 'postgres owned 32000:5432/tcp\n' > "$runtime/prior-port-sentinel.txt"
cat > "$temp/bin/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "\$COMMAND_LOG"
case "\$*" in
  *'ps -aq'*) printf 'owned\n' ;;
  # Fields (comma-delimited): com.docker.compose.project,
  # io.plexica.runtime-project, io.plexica.runtime-scope,
  # io.plexica.installation (compose-managed: no Plexica labels).
  *'inspect'*) printf '%s,,%s,\n' 'plexica-ci-cleanup-123456' '$scope' ;;
  *'ps -a'*) printf 'owned service running\n' ;;
  *'events'*) printf '{"authorization":"Bearer canary.token","email":"person@example.test","url":"http://alice:secret@host/?token=super-secret"}\n' ;;
  *'logs'*) printf 'password=super-secret encoded=super%%2Dsecret b64=c3VwZXItc2VjcmV0 escaped=super\\\\u002dsecret authorization=Bearer canary.token db=postgresql://user:database-secret@postgres:5432/plexica\n' ;;
esac
EOF
chmod +x "$temp/bin/docker"
PATH="$temp/bin:$PATH" COMMAND_LOG="$log" CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" bash "$dir/collect-ci-runtime-diagnostics.sh"
# Selection must require BOTH the Compose project label and the runtime-scope label.
grep -F "label=com.docker.compose.project=$project --filter label=io.plexica.runtime-scope=$scope" "$log" >/dev/null
# Regression: "now" is not a valid docker time value ("failed to parse value
# as time or duration"), so events must be bounded by a real timestamp.
if grep -F -- '--until now' "$log" >/dev/null; then
  echo 'docker events used an unparseable "--until now" value' >&2; exit 1;
fi
grep -F -- '--since 1h --until' "$log" >/dev/null
# Canary scan counts matches without printing secret-bearing lines.
for canary in super-secret super%2Dsecret c3VwZXItc2VjcmV0 'super\u002dsecret' database-secret canary.token person@example.test alice:secret; do
  matches=$(grep -RIF "$canary" "$runtime/diagnostics" | wc -l || true)
  [[ "$matches" == 0 ]] || { echo "Canary leaked into diagnostics ($matches matches): $canary" >&2; exit 1; }
done
test -f "$runtime/diagnostics/logs.txt"
test -f "$runtime/diagnostics/endpoints.txt" && test -f "$runtime/diagnostics/port-sentinel.txt"
rm "$runtime/prior-port-sentinel.txt" "$runtime/diagnostics/port-sentinel.txt"
PATH="$temp/bin:$PATH" COMMAND_LOG="$log" CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" bash "$dir/collect-ci-runtime-diagnostics.sh"
test -s "$runtime/diagnostics/port-sentinel.txt"
printf 'password=super-secret\n' > "$runtime/admission.env"
if PATH="$temp/bin:$PATH" CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" bash "$dir/collect-ci-runtime-diagnostics.sh"; then exit 1; fi
rm "$runtime/admission.env"
# The failed collection already copied the unsanitized artifact into the
# diagnostics output; drop the directory so later positive collections start
# from a clean slate.
rm -rf "$runtime/diagnostics"
cat > "$temp/bin/docker" <<'EOF'
#!/usr/bin/env bash
case "$*" in *'ps -aq'*) printf 'foreign\n' ;; *'inspect'*) printf 'plexica-ci-foreign-123456,,%s,123e4567-e89b-42d3-a456-426614174000\n' "$CI_PLUGIN_SCOPE" ;; esac
EOF
chmod +x "$temp/bin/docker"
if PATH="$temp/bin:$PATH" CI_PLUGIN_SCOPE="$scope" CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" bash "$dir/collect-ci-runtime-diagnostics.sh"; then exit 1; fi
# Forged-label negative: a foreign container carrying ONLY a valid-looking
# com.docker.compose.project label (no Plexica runtime-scope label) must be
# refused even though its project label matches this run.
cat > "$temp/bin/docker" <<'EOF'
#!/usr/bin/env bash
case "$*" in *'ps -aq'*) printf 'forged\n' ;; *'inspect'*) printf '%s,,,\n' 'plexica-ci-cleanup-123456' ;; esac
EOF
chmod +x "$temp/bin/docker"
if PATH="$temp/bin:$PATH" CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" bash "$dir/collect-ci-runtime-diagnostics.sh"; then exit 1; fi
# Plugin sidecar path: ownership is proven by io.plexica.runtime-project (the
# proxy stamps no compose-managed metadata), so a sidecar carrying the scope,
# a UUID installation label, the derived name, and the project network is
# accepted even without com.docker.compose.project.
sidecar_name="plexica-plugin-$scope-$(printf '%s' '123e4567-e89b-42d3-a456-426614174000' | sha256sum | cut -c1-16)"
cat > "$temp/bin/docker" <<EOF
#!/usr/bin/env bash
case "\$*" in
  *'ps -aq'*) printf 'sidecar\n' ;;
  *'inspect'*'io.plexica.installation'*) printf ',%s,%s,123e4567-e89b-42d3-a456-426614174000\n' '$project' '$scope' ;;
  *'inspect'*'NetworkSettings'*) printf '$(printf '%s_default' "$project")\n' ;;
  *'inspect'*'.Name'*) printf '/$sidecar_name\n' ;;
esac
EOF
chmod +x "$temp/bin/docker"
PATH="$temp/bin:$PATH" CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" bash "$dir/collect-ci-runtime-diagnostics.sh"
# Forged-ownership negative: same sidecar shape but WITHOUT the explicit
# runtime-project label must be refused — a matching compose label (or its
# absence) proves nothing for Dockerode-created sidecars.
cat > "$temp/bin/docker" <<EOF
#!/usr/bin/env bash
case "\$*" in
  *'ps -aq'*) printf 'sidecar\n' ;;
  *) printf ',,%s,123e4567-e89b-42d3-a456-426614174000\n' '$scope' ;;
esac
EOF
chmod +x "$temp/bin/docker"
if PATH="$temp/bin:$PATH" CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" bash "$dir/collect-ci-runtime-diagnostics.sh"; then
  echo 'Diagnostics accepted a sidecar without explicit runtime-project ownership' >&2; exit 1;
fi
