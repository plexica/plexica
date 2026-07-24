#!/usr/bin/env bash

set -Eeo pipefail

KCADM=/opt/keycloak/bin/kcadm.sh
realm=$1
client_uuid=$2
audience=${KEYCLOAK_API_AUDIENCE:-plexica-api}
mapper_path="clients/$client_uuid/protocol-mappers/models"
mapper_payload=$(printf '%s' \
  '{"name":"audience-mapper","protocol":"openid-connect",' \
  '"protocolMapper":"oidc-audience-mapper","consentRequired":false,' \
  "\"config\":{\"included.client.audience\":\"$audience\"," \
  '"id.token.claim":"false","access.token.claim":"true"}}')
mapper_id=$("$KCADM" get "$mapper_path" -r "$realm" --fields id,name \
  | sed -n \
    -e '/"id"/ { s/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/; h; }' \
    -e '/"name"[[:space:]]*:[[:space:]]*"audience-mapper"/ { x; p; q; }')
if [ -n "$mapper_id" ]; then
  update_payload=$(printf '{"id":"%s",%s' "$mapper_id" "${mapper_payload#\{}")
  "$KCADM" update "$mapper_path/$mapper_id" -r "$realm" -b "$update_payload"
else
  "$KCADM" create "$mapper_path" -r "$realm" -b "$mapper_payload"
fi
compact_mappers=$("$KCADM" get "$mapper_path" -r "$realm" | tr -d '[:space:]')
case "$compact_mappers" in
  *"\"name\":\"audience-mapper\""*"\"included.client.audience\":\"$audience\""*) ;;
  *)
    printf 'keycloak-init: ERROR: API audience mapper verification failed in %s\n' "$realm" >&2
    exit 1
    ;;
esac
