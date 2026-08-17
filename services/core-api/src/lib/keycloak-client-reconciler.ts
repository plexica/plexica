// keycloak-client-reconciler.ts
// Generic Keycloak OIDC client reconciler — single implementation shared by
// the master-realm admin client (keycloak-admin-client.ts) and the per-tenant
// web client (keycloak-tenant-client.ts). The upsert / scope-sync / read-back
// flow lives here; each caller supplies its own policy (desired payload, realm
// roles, validation surface) via ClientReconcileSpec.
//
// Attribute merge semantics: on update, desired attributes are MERGED over the
// current ones (`{ ...current.attributes, ...desired.attributes }`) instead of
// replacing the whole attributes object. Keycloak manages some attributes
// internally and a wholesale replace can drop them; desired keys always win,
// so the managed values still converge. (Previously the tenant client merged
// while the admin client replaced — the merge is the correct behavior and is
// now applied uniformly.)

import { adminRequest, adminRequestOk } from './keycloak-admin-internal.js';
import { reconcileApiAudienceMapper } from './keycloak-audience.js';

export interface KeycloakClient extends Record<string, unknown> {
  id?: unknown;
  attributes?: unknown;
}

export interface KeycloakRole {
  id: string;
  name: string;
}

/**
 * Top-level client fields verified by read-back after reconciliation.
 * Identical for every reconciled client; the per-client differences live in
 * the desired payload values, not in this list.
 */
const VALIDATED_FIELDS = [
  'publicClient',
  'standardFlowEnabled',
  'implicitFlowEnabled',
  'directAccessGrantsEnabled',
  'serviceAccountsEnabled',
  'fullScopeAllowed',
  'redirectUris',
  'webOrigins',
] as const;

export interface ClientReconcileSpec {
  /** Realm that owns the client ('master' for the platform admin client). */
  realm: string;
  clientId: string;
  /** Desired client representation, built by the caller's policy module. */
  desired: Record<string, unknown>;
  /**
   * Resolves the realm roles the client scope must contain. Callers decide
   * whether missing roles are created (admin) or rejected (tenant).
   */
  resolveRoles: () => Promise<KeycloakRole[]>;
  /** Expected realm role scope names after synchronization. */
  expectedScopeNames: readonly string[];
  /** Optional caller-specific read-back assertions (e.g. admin session caps). */
  extraValidation?: (client: KeycloakClient) => void;
}

function label(spec: ClientReconcileSpec): string {
  return `${spec.clientId} in ${spec.realm}`;
}

async function requestJson<T>(path: string, failure: string): Promise<T> {
  const response = await adminRequestOk(path, 'GET', undefined, { context: failure });
  return (await response.json()) as T;
}

async function readClient(spec: ClientReconcileSpec, uuid: string): Promise<KeycloakClient> {
  return requestJson<KeycloakClient>(
    `/admin/realms/${spec.realm}/clients/${uuid}`,
    `Failed to read ${label(spec)}`
  );
}

async function resolveClientUuid(spec: ClientReconcileSpec): Promise<string | null> {
  const matches = await requestJson<KeycloakClient[]>(
    `/admin/realms/${spec.realm}/clients?clientId=${encodeURIComponent(spec.clientId)}`,
    `Failed to find ${label(spec)}`
  );
  if (matches.length > 1) throw new Error(`Multiple ${label(spec)} clients exist`);
  if (matches[0] === undefined) return null;
  if (typeof matches[0].id !== 'string') throw new Error(`${label(spec)} has no UUID`);
  return matches[0].id;
}

async function upsertClient(spec: ClientReconcileSpec): Promise<string> {
  let uuid = await resolveClientUuid(spec);
  if (uuid === null) {
    const response = await adminRequest(
      `/admin/realms/${spec.realm}/clients`,
      'POST',
      spec.desired
    );
    if (response.status !== 201)
      throw new Error(`Failed to create ${label(spec)}: ${response.status}`);
    uuid = response.headers.get('Location')?.split('/').pop() ?? (await resolveClientUuid(spec));
  } else {
    const current = await readClient(spec, uuid);
    const currentAttributes = current.attributes as Record<string, unknown> | undefined;
    const desiredAttributes = spec.desired['attributes'] as Record<string, unknown> | undefined;
    await adminRequestOk(
      `/admin/realms/${spec.realm}/clients/${uuid}`,
      'PUT',
      {
        ...current,
        ...spec.desired,
        attributes: { ...currentAttributes, ...desiredAttributes },
      },
      { context: `Failed to update ${label(spec)}` }
    );
  }
  if (uuid === null || uuid === '') throw new Error(`Could not resolve ${label(spec)}`);
  return uuid;
}

async function synchronizeRoleScopes(spec: ClientReconcileSpec, uuid: string): Promise<void> {
  // Resolve roles BEFORE clearing the current mappings: if role resolution
  // fails, the client's existing scope is left untouched.
  const roles = await spec.resolveRoles();
  const path = `/admin/realms/${spec.realm}/clients/${uuid}/scope-mappings/realm`;
  const current = await requestJson<KeycloakRole[]>(
    path,
    `Failed to read role scopes for ${label(spec)}`
  );
  if (current.length > 0) {
    await adminRequestOk(path, 'DELETE', current, {
      context: `Failed to clear role scopes for ${label(spec)}`,
    });
  }
  await adminRequestOk(path, 'POST', roles, {
    context: `Failed to set role scopes for ${label(spec)}`,
  });
}

async function validateClient(spec: ClientReconcileSpec, uuid: string): Promise<void> {
  const client = await readClient(spec, uuid);
  for (const field of VALIDATED_FIELDS) {
    if (JSON.stringify(client[field]) !== JSON.stringify(spec.desired[field])) {
      throw new Error(`${label(spec)} has invalid ${field}`);
    }
  }
  const attributes = client.attributes as Record<string, unknown> | undefined;
  const desiredAttributes = spec.desired['attributes'] as Record<string, unknown>;
  for (const [name, value] of Object.entries(desiredAttributes)) {
    if (attributes?.[name] !== value) throw new Error(`${label(spec)} has invalid ${name}`);
  }
  spec.extraValidation?.(client);
  const scopes = await requestJson<Array<{ name?: unknown }>>(
    `/admin/realms/${spec.realm}/clients/${uuid}/scope-mappings/realm`,
    `Failed to verify role scopes for ${label(spec)}`
  );
  const names = scopes.map(({ name }) => name).sort();
  if (JSON.stringify(names) !== JSON.stringify([...spec.expectedScopeNames].sort())) {
    throw new Error(`${label(spec)} has invalid role scopes: ${JSON.stringify(names)}`);
  }
}

/**
 * Reconciles one OIDC client to its desired state: upsert, role-scope
 * synchronization, API audience mapper, then a full read-back validation.
 * Throws on any drift that could not be converged.
 */
export async function reconcileKeycloakClient(spec: ClientReconcileSpec): Promise<void> {
  const uuid = await upsertClient(spec);
  await synchronizeRoleScopes(spec, uuid);
  await reconcileApiAudienceMapper(spec.realm, uuid);
  await validateClient(spec, uuid);
}
