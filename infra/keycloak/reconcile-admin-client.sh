#!/usr/bin/env bash

set -Eeo pipefail

KCADM=/opt/keycloak/bin/kcadm.sh
ADMIN_ORIGIN=${KEYCLOAK_ADMIN_ORIGIN:-http://localhost:3002}
NODE_ENV=${NODE_ENV:-development}

if [[ ! "$ADMIN_ORIGIN" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]+)?$ ]]; then
  printf 'keycloak-init: ERROR: admin origin must be an exact HTTP(S) origin\n' >&2
  exit 1
fi
if [ "$NODE_ENV" = production ]; then
  case "$ADMIN_ORIGIN" in
    https://localhost|https://localhost:*|https://127.0.0.1|https://127.0.0.1:*|*'*'*)
      printf 'keycloak-init: ERROR: production admin origin is unsafe\n' >&2
      exit 1
      ;;
    https://*) ;;
    *)
      printf 'keycloak-init: ERROR: production admin origin must use HTTPS\n' >&2
      exit 1
      ;;
  esac
fi

callback_uri="$ADMIN_ORIGIN/callback"
logout_uri="$ADMIN_ORIGIN/login"
payload=$(printf '%s' \
  '{"clientId":"plexica-admin","name":"Plexica Admin App","enabled":true,' \
  '"protocol":"openid-connect","publicClient":true,"standardFlowEnabled":true,' \
  '"implicitFlowEnabled":false,"directAccessGrantsEnabled":false,' \
  '"serviceAccountsEnabled":false,"authorizationServicesEnabled":false,' \
  '"bearerOnly":false,"fullScopeAllowed":false,' \
  "\"redirectUris\":[\"$callback_uri\"],\"webOrigins\":[\"$ADMIN_ORIGIN\"]," \
  "\"attributes\":{\"pkce.code.challenge.method\":\"S256\"," \
  "\"post.logout.redirect.uris\":\"$logout_uri\"," \
  '"client.session.idle.timeout":"3600","client.session.max.lifespan":"3600"}}')

"$KCADM" update realms/master \
  -s ssoSessionIdleTimeout=3600 \
  -s ssoSessionMaxLifespan=3600
compact_realm=$("$KCADM" get realms/master | tr -d '[:space:]')
for fragment in '"ssoSessionIdleTimeout":3600' '"ssoSessionMaxLifespan":3600'; do
  case "$compact_realm" in
    *"$fragment"*) ;;
    *)
      printf 'keycloak-init: ERROR: master realm session limits were not applied\n' >&2
      exit 1
      ;;
  esac
done

if ! "$KCADM" get roles/super_admin -r master >/dev/null 2>&1; then
  "$KCADM" create roles -r master -s name=super_admin \
    -s 'description=Super administrator with full platform access'
fi

client_uuid=$("$KCADM" get clients -r master -q clientId=plexica-admin --fields id \
  | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
if [ -z "$client_uuid" ]; then
  "$KCADM" create clients -r master -b "$payload"
  client_uuid=$("$KCADM" get clients -r master -q clientId=plexica-admin --fields id \
    | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
else
  "$KCADM" update "clients/$client_uuid" -r master -b "$payload" -n
fi
[ -n "$client_uuid" ] || {
  printf 'keycloak-init: ERROR: plexica-admin has no UUID\n' >&2
  exit 1
}
/bin/bash /opt/keycloak/bin/reconcile-audience-mapper.sh master "$client_uuid"

scope_path="clients/$client_uuid/scope-mappings/realm"
current_scopes=$("$KCADM" get "$scope_path" -r master --fields id,name)
compact_scopes=$(printf '%s' "$current_scopes" | tr -d '[:space:]')
if [ "$compact_scopes" != '[]' ]; then
  "$KCADM" delete "$scope_path" -r master -b "$compact_scopes"
fi
super_admin=$("$KCADM" get roles/super_admin -r master --fields id,name | tr -d '[:space:]')
"$KCADM" create "$scope_path" -r master -b "[$super_admin]"

compact_client=$("$KCADM" get "clients/$client_uuid" -r master | tr -d '[:space:]')
for fragment in \
  '"publicClient":true' \
  '"standardFlowEnabled":true' \
  '"implicitFlowEnabled":false' \
  '"directAccessGrantsEnabled":false' \
  '"fullScopeAllowed":false' \
  "\"redirectUris\":[\"$callback_uri\"]" \
  "\"webOrigins\":[\"$ADMIN_ORIGIN\"]" \
  '"pkce.code.challenge.method":"S256"' \
  "\"post.logout.redirect.uris\":\"$logout_uri\"" \
  '"client.session.idle.timeout":"3600"' \
  '"client.session.max.lifespan":"3600"'; do
  case "$compact_client" in
    *"$fragment"*) ;;
    *)
      printf 'keycloak-init: ERROR: plexica-admin verification failed\n' >&2
      exit 1
      ;;
  esac
done
if [ "$NODE_ENV" = production ]; then
  case "$compact_client" in
    *localhost*|*'*'*)
      printf 'keycloak-init: ERROR: unsafe production admin read-back\n' >&2
      exit 1
      ;;
  esac
fi
mapped_scopes=$("$KCADM" get "$scope_path" -r master --fields name | tr -d '[:space:]')
[ "$mapped_scopes" = '[{"name":"super_admin"}]' ] || {
  printf 'keycloak-init: ERROR: plexica-admin role scopes are not least privilege\n' >&2
  exit 1
}
printf 'keycloak-init: plexica-admin reconciled and verified for %s\n' "$ADMIN_ORIGIN"
