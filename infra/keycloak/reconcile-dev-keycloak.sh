#!/usr/bin/env bash

set -Eeo pipefail

KCADM=/opt/keycloak/bin/kcadm.sh
CLIENT_FILE=/opt/keycloak/data/admin-client-realm.json

for realm in $("$KCADM" get realms --fields realm \
  | sed -n 's/.*"realm"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'); do
  "$KCADM" update "realms/$realm" -s sslRequired=none
  printf 'keycloak-init: sslRequired=none applied to realm: %s\n' "$realm"
done

# Undo the former E2E-wide 24-hour override on persistent development volumes.
"$KCADM" update realms/master -s accessTokenLifespan=300
master_realm=$("$KCADM" get realms/master --fields accessTokenLifespan | tr -d '[:space:]')
case "$master_realm" in
  *'"accessTokenLifespan":300'*) ;;
  *)
    printf 'keycloak-init: ERROR: master realm token TTL is not 300 seconds\n' >&2
    exit 1
    ;;
esac

# Remove the legacy committed-secret/full-scope E2E client from existing volumes.
legacy_uuid=$("$KCADM" get clients -r master -q clientId=e2e-api --fields id \
  | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
if [ -n "$legacy_uuid" ]; then
  "$KCADM" delete "clients/$legacy_uuid" -r master
  printf 'keycloak-init: legacy e2e-api client deleted\n'
fi

client_uuid=$("$KCADM" get clients -r master -q clientId=plexica-admin --fields id \
  | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

if [ -z "$client_uuid" ]; then
  "$KCADM" create clients -r master -f "$CLIENT_FILE"
  client_uuid=$("$KCADM" get clients -r master -q clientId=plexica-admin --fields id \
    | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  [ -n "$client_uuid" ] || {
    printf 'keycloak-init: ERROR: plexica-admin creation returned no UUID\n' >&2
    exit 1
  }
  printf 'keycloak-init: plexica-admin client created\n'
fi

# Always update, including pre-existing clients, to remove configuration drift.
"$KCADM" update "clients/$client_uuid" -r master -f "$CLIENT_FILE"
client_json=$("$KCADM" get "clients/$client_uuid" -r master)
compact_client=$(printf '%s' "$client_json" | tr -d '[:space:]')

require_client_fragment() {
  case "$compact_client" in
    *"$1"*) ;;
    *)
      printf 'keycloak-init: ERROR: plexica-admin verification failed for %s\n' "$2" >&2
      exit 1
      ;;
  esac
}

require_client_fragment '"publicClient":true' publicClient
require_client_fragment '"standardFlowEnabled":true' standardFlowEnabled
require_client_fragment '"implicitFlowEnabled":false' implicitFlowEnabled
require_client_fragment '"directAccessGrantsEnabled":false' directAccessGrantsEnabled
require_client_fragment '"redirectUris":["http://localhost:3002/callback"]' redirectUris
require_client_fragment '"webOrigins":["http://localhost:3002"]' webOrigins
require_client_fragment '"pkce.code.challenge.method":"S256"' pkce
require_client_fragment '"post.logout.redirect.uris":"http://localhost:3002/login"' post_logout
printf 'keycloak-init: plexica-admin client reconciled and verified\n'

roles_json=$("$KCADM" get roles -r master --fields name)
compact_roles=$(printf '%s' "$roles_json" | tr -d '[:space:]')
case "$compact_roles" in
  *'"name":"super_admin"'*)
    printf 'keycloak-init: super_admin role already exists\n'
    ;;
  *)
    "$KCADM" create roles -r master \
      -s name=super_admin \
      -s 'description=Super administrator with full platform access'
    printf 'keycloak-init: super_admin role created\n'
    ;;
esac
