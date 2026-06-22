#!/usr/bin/env bash
# ============================================================================
# check-test-env.sh
# Pre-flight check for integration test environment.
# Verifies that required services (PostgreSQL) are reachable before tests run.
# Reports warnings for optional services (Redis, Keycloak, MinIO, Redpanda).
#
# Usage: ./scripts/check-test-env.sh [--quiet]
#   --quiet  Only output on failure (for CI/automated use)
#
# Exit codes:
#   0 — all critical services available
#   1 — critical service unavailable (PostgreSQL)
# ============================================================================

set -euo pipefail

QUIET=false
if [[ "${1:-}" == "--quiet" ]]; then
  QUIET=true
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ── Configuration ──────────────────────────────────────────────────────────
# Load from .env if available
ENV_FILE="$(dirname "$0")/../../.env"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source <(grep -E '^(POSTGRES_|REDIS_|KEYCLOAK_|MINIO_|KAFKA_)' "$ENV_FILE" \
    | sed 's/^/export /' 2>/dev/null || true)
fi

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-plexica}"
POSTGRES_DB="${POSTGRES_DB:-plexica}"

REDIS_PORT="${REDIS_PORT:-6379}"
KEYCLOAK_PORT="${KEYCLOAK_PORT:-8080}"
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
MINIO_PORT="${MINIO_PORT:-9000}"
MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://localhost:9000}"
KAFKA_BROKERS="${KAFKA_BROKERS:-localhost:19092}"
SMTP_PORT="${SMTP_PORT:-1025}"

# ── Helpers ────────────────────────────────────────────────────────────────

log_info()  { $QUIET && return 0; echo -e "${CYAN}[CHECK]${NC} $*"; }
log_ok()    { $QUIET && return 0; echo -e "${GREEN}[  OK]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_fail()  { echo -e "${RED}[FAIL]${NC} $*"; }

check_tcp() {
  local host="$1" port="$2" name="$3"
  nc -z -w3 "$host" "$port" 2>/dev/null
}

check_http() {
  local url="$1" name="$2"
  curl -sf --max-time 3 "$url" > /dev/null 2>&1
}

# ── Service Checks ─────────────────────────────────────────────────────────

echo ""
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║  Plexica — Integration Test Environment Check   ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo ""

FAILED=false
WARNINGS=false

# ── PostgreSQL (CRITICAL) ───────────────────────────────────────────────
log_info "Checking PostgreSQL (${POSTGRES_HOST}:${POSTGRES_PORT})..."
if check_tcp "$POSTGRES_HOST" "$POSTGRES_PORT" "PostgreSQL"; then
  # Find the DATABASE_URL from .env
  DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD:-changeme}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"

  # Try authenticating via Prisma client (Node.js)
  SCRIPT_DIR="$(dirname "$0")"
  CHECK_SCRIPT="${SCRIPT_DIR}/check-db-connect.mjs"
  if [[ -f "$CHECK_SCRIPT" ]]; then
    DB_AUTH_RESULT=$(DATABASE_URL="$DB_URL" node "$CHECK_SCRIPT" 2>/dev/null) || true

    if [[ "$DB_AUTH_RESULT" == "OK" ]]; then
      log_ok "PostgreSQL is reachable and authenticated (${POSTGRES_HOST}:${POSTGRES_PORT})"
    elif [[ "$DB_AUTH_RESULT" == "AUTH_FAILED" ]]; then
      log_fail "PostgreSQL port open but AUTHENTICATION FAILED"
      log_fail "  Check POSTGRES_USER / POSTGRES_PASSWORD in your .env file"
      log_fail "  User: ${POSTGRES_USER}, DB: ${POSTGRES_DB}"
      log_fail "  Password from .env may not match the actual PostgreSQL instance"
      log_fail "  Fix: update .env or adjust credentials in PostgreSQL"
      log_fail "    docker compose down -v && docker compose up -d postgres"
      FAILED=true
    elif [[ "$DB_AUTH_RESULT" == "DB_MISSING" ]]; then
      log_warn "PostgreSQL port open, but database '${POSTGRES_DB}' does not exist"
      log_warn "  Run: docker compose up -d postgres (init scripts will create it)"
    else
      log_ok "PostgreSQL port open (${POSTGRES_HOST}:${POSTGRES_PORT})"
      if [[ -n "$DB_AUTH_RESULT" ]]; then
        log_warn "  (detailed check: ${DB_AUTH_RESULT})"
      fi
    fi
  else
    log_ok "PostgreSQL port open (${POSTGRES_HOST}:${POSTGRES_PORT})"
  fi
else
  log_fail "PostgreSQL is NOT reachable (${POSTGRES_HOST}:${POSTGRES_PORT})"
  log_fail "  Integration tests require PostgreSQL. Start it with:"
  log_fail "    docker compose up -d postgres"
  FAILED=true
fi

# ── Redis (important — tests handle absence gracefully) ─────────────────
log_info "Checking Redis (localhost:${REDIS_PORT})..."
if check_tcp "localhost" "$REDIS_PORT" "Redis"; then
  log_ok "Redis is reachable (localhost:${REDIS_PORT})"
else
  log_warn "Redis is NOT reachable — rate-limit and caching tests will be skipped"
  log_warn "  Start it with: docker compose up -d redis"
  WARNINGS=true
fi

# ── Keycloak (important — tests handle absence gracefully) ──────────────
log_info "Checking Keycloak (${KEYCLOAK_URL})..."
if check_http "${KEYCLOAK_URL}/realms/master" "Keycloak"; then
  log_ok "Keycloak is reachable (${KEYCLOAK_URL})"
else
  log_warn "Keycloak is NOT reachable — auth/integration tests will be skipped"
  log_warn "  Start it with: docker compose up -d keycloak"
  log_warn "  (first startup takes ~60s)"
  WARNINGS=true
fi

# ── MinIO (optional) ────────────────────────────────────────────────────
log_info "Checking MinIO (${MINIO_ENDPOINT}/minio/health/live)..."
if check_http "${MINIO_ENDPOINT}/minio/health/live" "MinIO"; then
  # Check if MinIO credentials work by hitting the bucket listing endpoint
  # (requires a properly signed request — just note the health check passed)
  log_ok "MinIO is reachable (${MINIO_ENDPOINT})"

  # Quick auth check: try accessing the admin API (may fail if no credentials)
  ADMIN_URL="${MINIO_ENDPOINT%/}/minio/admin/v3/info"
  MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-minioadmin}"
  MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-changeme}"
  if curl -sf --max-time 3 -u "${MINIO_ACCESS_KEY}:${MINIO_SECRET_KEY}" "$ADMIN_URL" > /dev/null 2>&1; then
    :  # credentials work
  else
    log_warn "  MinIO is up but credentials may be incorrect"
    log_warn "  Check MINIO_ACCESS_KEY / MINIO_SECRET_KEY in your .env"
  fi
else
  log_warn "MinIO is NOT reachable — file-upload tests will be skipped"
  log_warn "  Start it with: docker compose up -d minio"
  WARNINGS=true
fi

# ── Redpanda/Kafka (optional) ──────────────────────────────────────────
log_info "Checking Redpanda/Kafka (${KAFKA_BROKERS})..."
KAFKA_HOST="${KAFKA_BROKERS%:*}"
KAFKA_PORT="${KAFKA_BROKERS##*:}"
if check_tcp "$KAFKA_HOST" "$KAFKA_PORT" "Redpanda"; then
  log_ok "Redpanda/Kafka is reachable (${KAFKA_HOST}:${KAFKA_PORT})"
else
  log_warn "Redpanda/Kafka is NOT reachable — event bus tests will be skipped"
  log_warn "  Start it with: docker compose up -d redpanda"
  WARNINGS=true
fi

# ── SMTP/Mailpit (optional) ────────────────────────────────────────────
log_info "Checking Mailpit/SMTP (localhost:${SMTP_PORT})..."
if check_tcp "localhost" "$SMTP_PORT" "Mailpit"; then
  log_ok "Mailpit/SMTP is reachable (localhost:${SMTP_PORT})"
else
  log_warn "Mailpit/SMTP is NOT reachable — email notification tests will be skipped"
  log_warn "  Start it with: docker compose up -d mailpit"
  WARNINGS=true
fi

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
if $FAILED; then
  echo -e "${RED}  ✗ CRITICAL: One or more required services are not running.${NC}"
  echo -e "${RED}    Integration tests CANNOT proceed.${NC}"
  echo ""
  echo -e "  ${YELLOW}Quick fix:${NC} docker compose up -d"
  echo ""
  exit 1
elif $WARNINGS && ! $QUIET; then
  echo -e "${YELLOW}  ⚠  All critical services are up. Some optional services are down.${NC}"
  echo -e "${YELLOW}  Some integration tests will be skipped.${NC}"
  echo ""
  echo -e "  ${CYAN}Full stack:${NC} docker compose up -d"
  echo ""
else
  echo -e "${GREEN}  ✓ All services are reachable.${NC}"
  echo ""
fi

exit 0
