// admin-guard.ts
// Pre-removal safety guard: prevents removeUser() from leaving a tenant with
// zero active tenant_admin accounts.
//
// SOURCE OF TRUTH: tenant_admin is a Keycloak REALM role, not a tenant-DB
// concept. Searched first — prisma/tenant-schema/core-models.prisma's
// UserProfile has no role column, and service.ts:listRoles() only returns
// static role *metadata* for the UI matrix, never a per-user assignment.
// keycloak-tenant-client.ts's TENANT_ROLES confirms 'tenant_admin' is
// provisioned as a realm role. The only authoritative source for "who holds
// tenant_admin right now" is therefore Keycloak's role-membership endpoint:
// GET /admin/realms/{realm}/roles/tenant_admin/users.
//
// TWO-PHASE CHECK (TOCTOU fix): removeUser() runs this guard twice with the
// SAME pre-fetched admin set —
//   1. fast path, before the transaction, on the outer client: rejects the
//      common last-admin case without opening a transaction;
//   2. authoritative, inside the transaction, AFTER the per-tenant advisory
//      lock (repository-mutations.ts:lockTenantAdminRemoval) and on the
//      transaction client: a concurrent remover of the OTHER last admin
//      either already holds the lock (we wait for its COMMIT, then see its
//      soft delete and throw 409) or arrives after us. Phase 1 alone was a
//      check-then-act race: two admins removing each other concurrently both
//      passed it and committed, leaving zero active admins.
//
// RESIDUAL KEYCLOAK-SIDE WINDOW (ACCEPTED RISK): the phase-2 re-check
// reuses the admin set fetched BEFORE this transaction waited on the
// advisory lock — re-fetching inside the transaction is deliberately
// rejected, since an HTTP call must never sit inside an open DB
// transaction (see service-remove.ts). If a tenant_admin grant is REVOKED
// from the Keycloak console between the fetch and the re-check, the stale
// set still counts that account as a remaining admin and the removal of
// the real last admin passes. The window is operationally narrow: it
// requires a concurrent console revocation inside the lock wait
// (milliseconds in practice), and the other direction is safe — a
// concurrent GRANT can only cause a spurious 409 the operator can retry.
// The DB-side race this fix targets — two removeUser() calls passing
// phase 1 simultaneously — is fully closed by the lock.
//
// FAIL-OPEN ON KEYCLOAK ERRORS, BY DESIGN: this mirrors the existing
// best-effort treatment of disableRealmUser/terminateUserSessions in
// service-remove.ts — both already log-and-continue when Keycloak is
// unreachable or the realm doesn't (yet) exist. Making this guard fail
// CLOSED instead would turn a Keycloak outage into a total user-management
// outage, which the rest of this module deliberately avoids. The documented
// trade-off: while Keycloak is down the last-admin protection is suspended
// and the DB removal proceeds. In normal operation (Keycloak reachable,
// realm provisioned) the guard is enforced in both phases.

import { adminRequest } from '../../lib/keycloak-admin-internal.js';
import { logger } from '../../lib/logger.js';
import { ConflictError } from '../../lib/app-error.js';

import { findActiveProfileKeycloakIds } from './repository.js';

import type { TenantDbClient } from '../../lib/tenant-database.js';

interface KeycloakRoleUser {
  id: string;
}

/**
 * Fetches the Keycloak user IDs currently holding the tenant_admin realm
 * role. Returns null when Keycloak cannot be reached or answers with an
 * error status — callers treat null as fail-open (see module docstring).
 *
 * Performs an HTTP call: it MUST run outside any database transaction (a
 * transaction must never sit open across the network).
 */
export async function fetchTenantAdminKeycloakIds(realm: string): Promise<Set<string> | null> {
  try {
    const res = await adminRequest(`/admin/realms/${realm}/roles/tenant_admin/users`, 'GET');
    if (!res.ok) {
      throw new Error(`Keycloak returned ${res.status} listing tenant_admin role holders`);
    }
    const users = (await res.json()) as KeycloakRoleUser[];
    return new Set(users.map((u) => u.id));
  } catch (err) {
    logger.error(
      { err: String(err), realm },
      'user-management: could not verify remaining tenant_admin count — proceeding without the last-admin guard'
    );
    return null;
  }
}

/**
 * Throws ConflictError if `targetUserId` holds tenant_admin (per the
 * pre-fetched `adminKeycloakIds`) AND no OTHER active profile in this tenant
 * does. A no-op (returns normally) when:
 *  - `adminKeycloakIds` is null (Keycloak unreachable — fail-open, see module
 *    docstring); the DB is not even queried in this case, or
 *  - the target does not hold tenant_admin (removing a regular member never
 *    empties the tenant of admins — see routes.ts's separate, unconditional
 *    self-removal check for the case where the actor IS the sole admin
 *    removing themselves).
 *
 * The `db` parameter decides atomicity: pass the interactive `$transaction`
 * client — after the per-tenant advisory lock — for the authoritative check,
 * or the plain outer client for the pre-transaction fast path.
 */
export async function assertNotLastTenantAdmin(
  db: TenantDbClient,
  targetUserId: string,
  targetKeycloakUserId: string,
  adminKeycloakIds: Set<string> | null
): Promise<void> {
  if (adminKeycloakIds === null) return;
  if (!adminKeycloakIds.has(targetKeycloakUserId)) return;

  const activeProfiles = await findActiveProfileKeycloakIds(db);
  const remainingAdmins = activeProfiles.filter(
    (p) => p.userId !== targetUserId && adminKeycloakIds.has(p.keycloakUserId)
  );

  if (remainingAdmins.length === 0) {
    throw new ConflictError('Cannot remove the last active tenant admin');
  }
}
