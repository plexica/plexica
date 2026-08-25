#!/usr/bin/env bash
set -euo pipefail

dir=$(cd -- "$(dirname -- "$0")" && pwd)
script="$dir/provision-e2e-postgres-ca.sh"
temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
ca_dir="$temp/plexica-ci/e2e-postgres-ca"

# Regression guard for the unprivileged-runner failure: the system trust store
# must never be written by an unguarded (non-sudo) command, and the staged CA
# must live inside the runner-owned runtime directory.
if grep -Ev 'sudo -n ' "$script" | grep -q '/usr/local/share/ca-certificates'; then
  echo 'System trust store is written without a sudo -n guard' >&2; exit 1
fi
grep -F 'postgres-ca.crt' "$script" >/dev/null || { echo 'CA is not staged inside the runtime directory' >&2; exit 1; }

# First run on a fresh runner: generates material, stages postgres-ca.crt and
# exports the three contract keys — succeeding without any root access.
mkdir -m 700 -p "$ca_dir"
eval "$(bash "$script" "$ca_dir")"
[[ $E2E_POSTGRES_TLS_SOURCE == "$ca_dir" ]]
[[ $NODE_EXTRA_CA_CERTS == "$ca_dir/postgres-ca.crt" && $SSL_CERT_FILE == "$ca_dir/postgres-ca.crt" ]]
[[ -f $NODE_EXTRA_CA_CERTS && $(stat -c %a "$NODE_EXTRA_CA_CERTS") == 644 ]]
[[ $(stat -c %a "$ca_dir") == 700 && -f $ca_dir/ca.key && $(stat -c %a "$ca_dir/ca.key") == 600 ]]
staged=$(openssl x509 -in "$NODE_EXTRA_CA_CERTS" -noout -fingerprint -sha256)
generated=$(openssl x509 -in "$ca_dir/ca.crt" -noout -fingerprint -sha256)
[[ $staged == "$generated" ]]

# Idempotent re-run: same fingerprint, marker reused, still exports all keys.
marker_before=$(cat "$ca_dir/.trust-installed")
cert_inode=$(stat -c %i "$ca_dir/ca.crt")
eval "$(bash "$script" "$ca_dir")"
[[ $NODE_EXTRA_CA_CERTS == "$ca_dir/postgres-ca.crt" && $SSL_CERT_FILE == "$ca_dir/postgres-ca.crt" ]]
[[ $(cat "$ca_dir/.trust-installed") == "$marker_before" ]]
[[ $(stat -c %i "$ca_dir/ca.crt") == "$cert_inode" ]]

# Existing-material reuse: pre-created CA content is never regenerated.
echo stale > "$ca_dir/ca.key"
eval "$(bash "$script" "$ca_dir")"
grep -qx stale "$ca_dir/ca.key"

# Best-effort install: a failing sudo must not fail the job nor leave a marker
# claiming success, while the exports above remain fully functional.
rm -rf "$temp/bin" "$ca_dir"
mkdir -m 700 -p "$ca_dir" "$temp/bin"
cat > "$temp/bin/sudo" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
chmod +x "$temp/bin/sudo"
eval "$(PATH="$temp/bin:$PATH" bash "$script" "$ca_dir")"
[[ $NODE_EXTRA_CA_CERTS == "$ca_dir/postgres-ca.crt" && -f $NODE_EXTRA_CA_CERTS ]]
