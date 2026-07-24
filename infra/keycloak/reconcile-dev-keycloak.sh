#!/usr/bin/env bash

set -Eeo pipefail

KCADM=/opt/keycloak/bin/kcadm.sh

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

/bin/bash /opt/keycloak/bin/reconcile-admin-client.sh
/bin/bash /opt/keycloak/bin/reconcile-tenant-clients.sh
