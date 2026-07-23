# Keycloak Client Reconciliation

The development `keycloak-init` service reconciles `plexica-admin` and every
`plexica-web` client in a `plexica-*` realm on each `docker compose up`. This
updates existing persistent volumes, not only newly imported realms. The admin
client uses `http://localhost:3002` unless `KEYCLOAK_ADMIN_ORIGIN` is explicitly
set.

Production uses the built core API migration command during deployment, after
the core API build and before application traffic is switched:

```bash
NODE_ENV=production \
KEYCLOAK_ADMIN_ORIGIN=https://admin.plexica.app \
pnpm --filter core-api keycloak:reconcile-clients
```

Run it with production `KEYCLOAK_URL` and admin credentials in the deployment's
secret environment. `KEYCLOAK_ADMIN_ORIGIN` is mandatory in production and must
be one exact HTTPS origin with no path, query, fragment, localhost, or wildcard.
The reconciler derives only `<origin>/callback` and `<origin>/login`.

The same migration enumerates all `plexica-*` realms, derives each tenant slug,
and applies exact `https://<slug>.plexica.io/callback` and tenant-preserving
logout URIs. It synchronizes the narrow role scopes (`super_admin` only for the
master-realm admin client; `member` and `tenant_admin` for tenant clients).

`plexica-admin` uses Authorization Code Flow with PKCE S256, with implicit and
direct grants disabled and `fullScopeAllowed=false`. Its Keycloak 26 client
session idle and maximum lifespan overrides are both 3600 seconds. The master
realm SSO idle and maximum lifespan are also reconciled to 3600 seconds so every
privileged session, including bootstrap Admin REST, is bounded. Tenant realms
are not modified by this session-policy step.

Every client and role mapping is read back after reconciliation. Production
read-back fails closed if localhost, a wildcard, an unexpected URI or flow, a
broader role scope, or an unsafe privileged session limit remains. Any failure
must leave the deployment step red; rerunning the migration is idempotent.

Playwright setup uses the bootstrap administrator only for Keycloak Admin REST.
Each suite creates a random run-scoped master-realm user and helper client,
scopes both to `super_admin`, passes the random credentials to workers, and
deletes both in teardown. Failed setup cleans the current run, while guarded
prefix cleanup removes marked artifacts older than six hours on later runs.
