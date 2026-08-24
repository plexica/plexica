#!/usr/bin/env bash
set -euo pipefail

dir=$(cd -- "$(dirname -- "$0")" && pwd)
temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
mkdir "$temp/bin"
export RUNNER_TEMP="$temp"
project=plexica-ci-render-123456
runtime="$(bash "$dir/ci-runtime-env.sh" init "$project")"
cat > "$temp/bin/docker" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  *'version --format'*) printf '24.0.0\n' ;;
  *'compose version --short'*) printf '2.24.4\n' ;;
  *'config --format json'*)
    host=${CI_RENDER_HOST:-127.0.0.1}
    published=${CI_RENDER_PUBLISHED-__absent__}
    node -e '
      const host = process.argv[1];
      const published = process.argv[2] === "__absent__" ? undefined : process.argv[2];
      const ports = (target) => {
        const port = { host_ip: host, target };
        if (published !== undefined) port.published = published;
        return [port];
      };
       const services = Object.fromEntries([["postgres", 5432], ["keycloak", 8080], ["redpanda", 19092], ["core-api-e2e", 3001], ["web-e2e", 3000], ["admin-e2e", 3002]].map(([name, target]) => [name, { ports: ports(target) }]));
        for (const service of ["core-api-e2e", "web-e2e", "admin-e2e"]) {
          services[service].image = "node:24-bookworm@sha256:immutable";
          services[service].command = process.env.CI_RENDER_AMBIENT ? "pnpm start" : "corepack enable && corepack prepare pnpm@10.33.0 --activate && pnpm start";
        }
        services["core-api-e2e"].environment = { NODE_ENV: "production", KEYCLOAK_URL: "http://keycloak:8080", KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE: "http://keycloak:8080", PLUGIN_DOCKER_HOST: "http://plugin-docker-proxy:2375" };
       services["plugin-docker-proxy"] = { networks: { "plugin-docker-control": { aliases: ["plugin-docker-proxy"] } } };
       services["keycloak-init"] = { environment: { KEYCLOAK_WEB_ORIGIN: process.env.CI_RENDER_STATIC ? "http://localhost:3000" : undefined } };
      services.redpanda.command = [];
       process.stdout.write(JSON.stringify({ services }));
     ' "$host" "$published"
     ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$temp/bin/docker"
run() { PATH="$temp/bin:$PATH" CI_COMPOSE_PROJECT="$project" CI_RUNTIME_DIR="$runtime" bash "$dir/verify-ci-compose-render.sh" "$project"; }
run
if CI_RENDER_HOST=0.0.0.0 run >/dev/null 2>&1; then
  echo 'Render guard accepted a non-loopback publication' >&2; exit 1
fi
if ! CI_RENDER_PUBLISHED='' run >/dev/null 2>&1; then
  echo 'Render guard rejected a dynamic publication with empty published field' >&2; exit 1
fi
if CI_RENDER_PUBLISHED=32000 run >/dev/null 2>&1; then
  echo 'Render guard accepted a concrete published port' >&2; exit 1
fi
if CI_RENDER_STATIC=1 run >/dev/null 2>&1; then
  echo 'Render guard accepted a static Keycloak CI origin' >&2; exit 1
fi
if CI_RENDER_AMBIENT=1 run >/dev/null 2>&1; then
  echo 'Render guard accepted an ambient pnpm command' >&2; exit 1
fi
if CI_COMPOSE_PROJECT=plexica-ci-foreign-123456 CI_RUNTIME_DIR="$runtime" PATH="$temp/bin:$PATH" bash "$dir/verify-ci-compose-render.sh" "$project" >/dev/null 2>&1; then
  echo 'Render guard accepted a mismatched CI project context' >&2; exit 1
fi
if PATH="$temp/bin:$PATH" CI_COMPOSE_PROJECT="$project" bash "$dir/verify-ci-compose-render.sh" "$project" >/dev/null 2>&1; then
  echo 'Render guard accepted an absent CI runtime context' >&2; exit 1
fi

# Unstubbed: on a fresh runtime dir (nothing published yet) every compose invocation must
# render, because init pre-creates the eagerly resolved env_file entries — and no
# post-discovery variable may be required at project-load time.
if command -v docker >/dev/null 2>&1 && docker version >/dev/null 2>&1; then
  root=$(cd -- "$dir/../../../.." && pwd)
  fresh_project=plexica-ci-render-fresh-123456
  fresh_runtime="$(bash "$dir/ci-runtime-env.sh" init "$fresh_project")"
  [[ -f "$fresh_runtime/sidecar-images.env" ]] || { echo 'init did not pre-create sidecar-images.env' >&2; exit 1; }
  [[ -f "$fresh_runtime/browser-endpoints.env" ]] || { echo 'init did not pre-create browser-endpoints.env' >&2; exit 1; }
  for pattern in '${WEB_E2E_PUBLIC_BASE:' '${ADMIN_E2E_PUBLIC_BASE:' '${KEYCLOAK_PUBLIC_ISSUER_BASE:'; do
    if grep -F "$pattern" "$root/docker-compose.ci.yml" "$root/infra/compose/docker-compose.ci-runtime-services.yml" >/dev/null; then
      echo "Compose overlay still requires $pattern...} eagerly" >&2; exit 1;
    fi
  done
  compose_cmd=(docker compose --project-name "$fresh_project" -f "$root/docker-compose.yml" -f "$root/docker-compose.ci.yml")
  fresh_scope="ci-$(printf '%s' "$fresh_project" | sha256sum | cut -c1-28)"
  render_fresh() {
    env -u WEB_E2E_PUBLIC_BASE -u ADMIN_E2E_PUBLIC_BASE -u KEYCLOAK_PUBLIC_ISSUER_BASE \
      CI_COMPOSE_PROJECT="$fresh_project" CI_RUNTIME_DIR="$fresh_runtime" \
      CI_RUNTIME_SCOPE="$fresh_scope" "${compose_cmd[@]}" "$@" >/dev/null
  }
  if ! render_fresh config; then
    echo 'Compose render failed on a fresh runtime directory before discovery' >&2; exit 1
  fi
  # Scoped-selection contract: every rendered runtime service must carry the
  # per-project Plexica scope label so diagnostics require BOTH labels.
  rendered=$(env -u WEB_E2E_PUBLIC_BASE -u ADMIN_E2E_PUBLIC_BASE -u KEYCLOAK_PUBLIC_ISSUER_BASE \
    CI_COMPOSE_PROJECT="$fresh_project" CI_RUNTIME_DIR="$fresh_runtime" \
    CI_RUNTIME_SCOPE="$fresh_scope" "${compose_cmd[@]}" config --format json)
  node -e '
    const scope = process.argv[1];
    const services = JSON.parse(process.argv[2]).services;
    for (const [name, value] of Object.entries(services)) {
      if ((value.labels ?? {})["io.plexica.runtime-scope"] !== scope) {
        throw new Error(`Service ${name} does not carry the per-project runtime-scope label`);
      }
    }
  ' "$fresh_scope" "$rendered"
  # Read-only-workspace contract: web/admin preview must load its TS config via
  # the in-memory runner loader. The default bundle loader writes a temp .mjs
  # into node_modules/.vite-temp inside the :ro mount and crashes with EROFS.
  node -e '
    const services = JSON.parse(process.argv[1]).services;
    for (const name of ["web-e2e", "admin-e2e"]) {
      const command = Array.isArray(services[name].command)
        ? services[name].command.join(" ")
        : String(services[name].command ?? "");
      if (!command.includes("--configLoader runner")) {
        throw new Error(`Service ${name} does not use --configLoader runner; vite preview would crash on the read-only workspace mount`);
      }
    }
  ' "$rendered"
  # Simulate late discovery with stub loopback URLs: the writer populates the env file
  # and the rendered model must embed those values for every consumer service.
  bash "$dir/ci-runtime-env.sh" write-browser-endpoints "$fresh_runtime" \
    WEB_E2E_PUBLIC_BASE http://127.0.0.1:32000 \
    ADMIN_E2E_PUBLIC_BASE http://127.0.0.1:32001 \
    KEYCLOAK_PUBLIC_ISSUER_BASE http://127.0.0.1:32004
  rendered=$(env -u WEB_E2E_PUBLIC_BASE -u ADMIN_E2E_PUBLIC_BASE -u KEYCLOAK_PUBLIC_ISSUER_BASE \
    CI_COMPOSE_PROJECT="$fresh_project" CI_RUNTIME_DIR="$fresh_runtime" CI_RUNTIME_SCOPE="$fresh_scope" "${compose_cmd[@]}" config --format json)
  node -e '
    const config = JSON.parse(process.argv[1]);
    const core = config.services["core-api-e2e"].environment ?? {};
    const init = config.services["keycloak-init"].environment ?? {};
    if (core.KEYCLOAK_PUBLIC_ISSUER_BASE !== "http://127.0.0.1:32004") throw new Error("core-api-e2e missed the discovered issuer");
    if (init.WEB_E2E_PUBLIC_BASE !== "http://127.0.0.1:32000") throw new Error("keycloak-init missed the discovered web origin");
    if (init.ADMIN_E2E_PUBLIC_BASE !== "http://127.0.0.1:32001") throw new Error("keycloak-init missed the discovered admin origin");
  ' "$rendered"
  # Round-trip, env_file kind: container.env is parsed literally by Compose,
  # so the rendered model must embed exactly what the writer meant — including
  # a comma that %q quoting would have mangled into a literal backslash.
  comma_password='comma,password-43-characters-long-value'
  bash "$dir/ci-runtime-env.sh" write-container "$fresh_runtime" \
    EVENT_KEY_ENCRYPTION_KEY AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
  bash "$dir/ci-runtime-env.sh" write-container "$fresh_runtime" \
    KEYCLOAK_ADMIN_PASSWORD "$comma_password"
  rendered=$(env -u WEB_E2E_PUBLIC_BASE -u ADMIN_E2E_PUBLIC_BASE -u KEYCLOAK_PUBLIC_ISSUER_BASE \
    CI_COMPOSE_PROJECT="$fresh_project" CI_RUNTIME_DIR="$fresh_runtime" CI_RUNTIME_SCOPE="$fresh_scope" "${compose_cmd[@]}" config --format json)
  node -e '
    const core = JSON.parse(process.argv[1]).services["core-api-e2e"].environment ?? {};
    if (core.EVENT_KEY_ENCRYPTION_KEY !== "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA") throw new Error("container.env scalar diverged in Compose render");
    if (core.KEYCLOAK_ADMIN_PASSWORD !== process.argv[2]) throw new Error("container.env comma value was not read literally by Compose");
  ' "$rendered" "$comma_password"
fi
