#!/usr/bin/env bash

set -Eeo pipefail

KCADM=/opt/keycloak/bin/kcadm.sh

realm_names=$("$KCADM" get realms --fields realm \
  | sed -n 's/.*"realm"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
for realm in $realm_names; do
  case "$realm" in
    plexica-*) ;;
    *) continue ;;
  esac
  slug=${realm#plexica-}
  case "$slug" in
    ''|*[!a-z0-9-]*)
      printf 'keycloak-init: ERROR: invalid tenant realm name: %s\n' "$realm" >&2
      exit 1
      ;;
  esac

  callback_uri=http://localhost:3000/callback
  logout_uri="http://localhost:3000/?tenant=$slug"
  payload=$(printf '%s' \
    "{\"clientId\":\"plexica-web\",\"name\":\"plexica-web\",\"enabled\":true," \
    '"protocol":"openid-connect","publicClient":true,"standardFlowEnabled":true,' \
    '"implicitFlowEnabled":false,"directAccessGrantsEnabled":false,' \
    '"serviceAccountsEnabled":false,"authorizationServicesEnabled":false,' \
    '"bearerOnly":false,"fullScopeAllowed":false,' \
    "\"redirectUris\":[\"$callback_uri\"],\"webOrigins\":[\"http://localhost:3000\"]," \
    "\"attributes\":{\"pkce.code.challenge.method\":\"S256\"," \
    "\"post.logout.redirect.uris\":\"$logout_uri\"}}")

  client_uuid=$("$KCADM" get clients -r "$realm" -q clientId=plexica-web --fields id \
    | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  if [ -z "$client_uuid" ]; then
    "$KCADM" create clients -r "$realm" -b "$payload"
    client_uuid=$("$KCADM" get clients -r "$realm" -q clientId=plexica-web --fields id \
      | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  else
    "$KCADM" update "clients/$client_uuid" -r "$realm" -b "$payload" -n
  fi
  [ -n "$client_uuid" ] || {
    printf 'keycloak-init: ERROR: plexica-web has no UUID in %s\n' "$realm" >&2
    exit 1
  }
  /bin/bash /opt/keycloak/bin/reconcile-audience-mapper.sh "$realm" "$client_uuid"

  scope_path="clients/$client_uuid/scope-mappings/realm"
  current_scopes=$("$KCADM" get "$scope_path" -r "$realm" --fields id,name)
  compact_scopes=$(printf '%s' "$current_scopes" | tr -d '[:space:]')
  if [ "$compact_scopes" != '[]' ]; then
    "$KCADM" delete "$scope_path" -r "$realm" -b "$compact_scopes"
  fi
  member=$("$KCADM" get roles/member -r "$realm" --fields id,name | tr -d '[:space:]')
  tenant_admin=$("$KCADM" get roles/tenant_admin -r "$realm" --fields id,name | tr -d '[:space:]')
  "$KCADM" create "$scope_path" -r "$realm" -b "[$member,$tenant_admin]"

  compact_client=$("$KCADM" get "clients/$client_uuid" -r "$realm" | tr -d '[:space:]')
  for fragment in \
    '"implicitFlowEnabled":false' \
    '"directAccessGrantsEnabled":false' \
    '"fullScopeAllowed":false' \
    "\"redirectUris\":[\"$callback_uri\"]" \
    '"webOrigins":["http://localhost:3000"]' \
    '"pkce.code.challenge.method":"S256"' \
    "\"post.logout.redirect.uris\":\"$logout_uri\""; do
    case "$compact_client" in
      *"$fragment"*) ;;
      *)
        printf 'keycloak-init: ERROR: plexica-web verification failed in %s\n' "$realm" >&2
        exit 1
        ;;
    esac
  done
  mapped_scopes=$("$KCADM" get "$scope_path" -r "$realm" --fields name | tr -d '[:space:]')
  case "$mapped_scopes" in
    '[{"name":"member"},{"name":"tenant_admin"}]'|\
      '[{"name":"tenant_admin"},{"name":"member"}]') ;;
    *)
      printf 'keycloak-init: ERROR: plexica-web role scopes invalid in %s\n' "$realm" >&2
      exit 1
      ;;
  esac
  printf 'keycloak-init: plexica-web reconciled and verified in %s\n' "$realm"
done
