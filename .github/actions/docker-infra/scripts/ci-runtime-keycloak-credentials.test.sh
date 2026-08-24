#!/usr/bin/env bash
set -euo pipefail

dir=$(cd -- "$(dirname -- "$0")" && pwd)
temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
export RUNNER_TEMP="$temp"
project_a=plexica-ci-keycloak-a-123456
project_b=plexica-ci-keycloak-b-123456
runtime_a=$(bash "$dir/ci-runtime-env.sh" init "$project_a")
runtime_b=$(bash "$dir/ci-runtime-env.sh" init "$project_b")
bash "$dir/ci-runtime-keycloak-credentials.sh" "$project_a" "$runtime_a"
bash "$dir/ci-runtime-keycloak-credentials.sh" "$project_b" "$runtime_b"
# Final content only: exactly the three credential keys, mode 600.
diff <(cut -d= -f1 "$runtime_a/keycloak-credentials.env" | sort) \
  <(printf 'KEYCLOAK_ADMIN_USER\nKEYCLOAK_ADMIN_PASSWORD\nKEYCLOAK_E2E_CLIENT_SECRET\n' | sort) >/dev/null || {
  echo 'Keycloak credentials file has unexpected keys' >&2; exit 1;
}
source "$runtime_a/keycloak-credentials.env"; a="$KEYCLOAK_ADMIN_PASSWORD:$KEYCLOAK_E2E_CLIENT_SECRET"
source "$runtime_b/keycloak-credentials.env"; b="$KEYCLOAK_ADMIN_PASSWORD:$KEYCLOAK_E2E_CLIENT_SECRET"
[[ "$a" != "$b" && $(stat -c %a "$runtime_a/keycloak-credentials.env") == 600 ]]
if CI_COMPOSE_PROJECT="$project_a" CI_RUNTIME_DIR="$runtime_b" bash "$dir/ci-runtime-keycloak-credentials.sh" "$project_a" "$runtime_b"; then
  echo 'Keycloak credentials accepted a foreign runtime project' >&2; exit 1
fi

# Round-trip: the writer encodes with printf %q; every consumer sources the
# file from bash, so each written value must be byte-identical after sourcing.
write_env() {
  umask 077
  printf 'KEYCLOAK_ADMIN_USER=%q\nKEYCLOAK_ADMIN_PASSWORD=%q\nKEYCLOAK_E2E_CLIENT_SECRET=%q\n' \
    "$1" "$2" "$3" > "$1.env.check"
}
hostile_values=(
  'p@ss w0rd!#$%&*()'
  "single'quote and \"double\" quote"
  '\backslash\sequences\and%percent'
  '$(injection attempt) and `backticks`'
  $'tab\tseparator and\nnewline'
  ' leading and trailing spaces '
  '~!@#$%^&*()_+-={}[]|\\:;"<>?,./'
  'ünicode-àccents-and-日本語'
)
for i in "${!hostile_values[@]}"; do
  user="ci-admin-user-$i"
  password="${hostile_values[$i]}"
  secret="${hostile_values[$((i + 1)) % ${#hostile_values[@]}]}"
  (
    cd "$temp"
    write_env "$user" "$password" "$secret"
    source "$user.env.check"
    [[ "$KEYCLOAK_ADMIN_USER" == "$user" &&
       "$KEYCLOAK_ADMIN_PASSWORD" == "$password" &&
       "$KEYCLOAK_E2E_CLIENT_SECRET" == "$secret" ]] || {
      echo "Round-trip diverged for value: $password" >&2; exit 1;
    }
  ) || { echo 'Sourced credentials differ from written values' >&2; exit 1; }
done
