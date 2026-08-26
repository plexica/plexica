#!/usr/bin/env bash
# Parse host and port from a PostgreSQL connection URL.
#
# Usage:
#   source "$(dirname "$0")/parse-postgres-url.sh"
#   parse_postgres_url "postgresql://user:pass@127.0.0.1:54329/db"
#   echo "$PARSED_PG_HOST"  # 127.0.0.1
#   echo "$PARSED_PG_PORT"  # 54329
#
# The port defaults to 5432 when absent or non-numeric.

parse_postgres_url() {
  local url="$1"
  local authority rest

  authority="${url#*://}"
  authority="${authority%%\?*}"
  authority="${authority%%#*}"
  authority="${authority%%/*}"

  if [[ "$authority" == *@* ]]; then
    authority="${authority##*@}"
  fi

  case "$authority" in
    "["*)
      PARSED_PG_HOST="${authority%%]*}"
      PARSED_PG_HOST="${PARSED_PG_HOST#[}"
      rest="${authority#*]}"
      PARSED_PG_PORT="${rest#:}"
      ;;
    *:*)
      PARSED_PG_HOST="${authority%:*}"
      PARSED_PG_PORT="${authority##*:}"
      ;;
    *)
      PARSED_PG_HOST="$authority"
      PARSED_PG_PORT=""
      ;;
  esac

  if [[ -z "$PARSED_PG_PORT" || ! "$PARSED_PG_PORT" =~ ^[0-9]+$ ]]; then
    PARSED_PG_PORT=5432
  fi
}
