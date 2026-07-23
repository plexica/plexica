// keycloak-admin-client.ts
// Keycloak user provisioning helpers used by global-setup.ts.

import { adminFetch } from '../../../e2e/keycloak/admin-api.js';

export interface KeycloakUser {
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  password: string;
  requiredActions?: string[];
  /** Realm-level roles to assign after user creation (e.g. ['tenant_admin']). */
  realmRoles?: string[];
}

export async function setTenantClientOrigin(
  token: string,
  realm: string,
  origin: string
): Promise<void> {
  const lookup = await adminFetch(
    token,
    `/admin/realms/${realm}/clients?clientId=plexica-web`,
    'GET'
  );
  if (!lookup.ok) throw new Error(`Could not find plexica-web in ${realm}: HTTP ${lookup.status}`);
  const clients = (await lookup.json()) as Array<{
    id?: string;
    attributes?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  const client = clients[0];
  if (client?.id === undefined) throw new Error(`plexica-web is missing in ${realm}`);

  const update = await adminFetch(token, `/admin/realms/${realm}/clients/${client.id}`, 'PUT', {
    ...client,
    redirectUris: [`${origin}/callback`],
    webOrigins: [origin],
    attributes: {
      ...client.attributes,
      'post.logout.redirect.uris': `${origin}/`,
    },
  });
  if (!update.ok)
    throw new Error(`Could not configure plexica-web in ${realm}: HTTP ${update.status}`);
}

/**
 * Assigns realm-level roles to a Keycloak user.
 * Resolves each role name to its Keycloak representation, then posts the mapping.
 * Idempotent — assigning an already-assigned role is a no-op (Keycloak returns 204).
 */
async function assignRealmRoles(
  token: string,
  realm: string,
  userId: string,
  roleNames: string[]
): Promise<void> {
  const roleRepresentations: Array<{ id: string; name: string }> = [];
  for (const roleName of roleNames) {
    const res = await adminFetch(token, `/admin/realms/${realm}/roles/${roleName}`, 'GET');
    if (!res.ok) {
      throw new Error(`Role '${roleName}' not found in realm ${realm}: HTTP ${res.status}`);
    }
    const role = (await res.json()) as { id: string; name: string };
    roleRepresentations.push({ id: role.id, name: role.name });
  }
  if (roleRepresentations.length === 0) return;

  const mapRes = await adminFetch(
    token,
    `/admin/realms/${realm}/users/${userId}/role-mappings/realm`,
    'POST',
    roleRepresentations
  );
  if (!mapRes.ok && mapRes.status !== 204) {
    throw new Error(`Could not assign roles to user ${userId}: HTTP ${mapRes.status}`);
  }
}

/**
 * Creates (or resets the password of) a Keycloak user in the given realm.
 * Handles 409 (already exists) idempotently — resets password and profile.
 * Assigns realm roles if specified (idempotent — already-assigned roles are a no-op).
 */
export async function upsertUser(token: string, realm: string, user: KeycloakUser): Promise<void> {
  const userPayload: Record<string, unknown> = {
    username: user.username,
    email: user.email,
    enabled: true,
    emailVerified: true,
    ...(user.firstName !== undefined ? { firstName: user.firstName } : {}),
    ...(user.lastName !== undefined ? { lastName: user.lastName } : {}),
    ...(user.requiredActions !== undefined ? { requiredActions: user.requiredActions } : {}),
    credentials: [{ type: 'password', value: user.password, temporary: false }],
  };

  const createRes = await adminFetch(token, `/admin/realms/${realm}/users`, 'POST', userPayload);

  if (createRes.status === 201) {
    // Assign roles for newly created user — need to resolve userId from Location header or lookup.
    if (user.realmRoles !== undefined && user.realmRoles.length > 0) {
      let userId: string | null = null;
      const location = createRes.headers.get('Location') ?? '';
      userId = location.split('/').pop() ?? null;
      if (userId === null || userId === '') {
        const lookupRes = await adminFetch(
          token,
          `/admin/realms/${realm}/users?username=${encodeURIComponent(user.username)}&exact=true`,
          'GET'
        );
        if (lookupRes.ok) {
          const users = (await lookupRes.json()) as Array<{ id: string }>;
          userId = users[0]?.id ?? null;
        }
      }
      if (userId !== null) {
        await assignRealmRoles(token, realm, userId, user.realmRoles);
      }
    }
    return;
  }

  if (createRes.status !== 409) {
    throw new Error(
      `Failed to create user ${user.username} in realm ${realm}: ${createRes.status} ${await createRes.text()}`
    );
  }

  // 409 — user already exists: look up their ID, reset password, update profile.
  const lookupRes = await adminFetch(
    token,
    `/admin/realms/${realm}/users?username=${encodeURIComponent(user.username)}&exact=true`,
    'GET'
  );
  if (!lookupRes.ok) {
    throw new Error(
      `Failed to look up existing user ${user.username} in realm ${realm}: ${lookupRes.status}`
    );
  }
  const users = (await lookupRes.json()) as Array<{ id: string }>;
  const userId = users[0]?.id;
  if (userId === undefined) {
    throw new Error(`User ${user.username} reported as 409 but not found in lookup`);
  }

  const resetRes = await adminFetch(
    token,
    `/admin/realms/${realm}/users/${userId}/reset-password`,
    'PUT',
    { type: 'password', value: user.password, temporary: false }
  );
  if (!resetRes.ok) {
    throw new Error(
      `Failed to reset password for ${user.username} in realm ${realm}: ${resetRes.status}`
    );
  }

  // Update profile fields and re-apply required actions for idempotency.
  const profileUpdate: Record<string, unknown> = {};
  if (user.firstName !== undefined) profileUpdate['firstName'] = user.firstName;
  if (user.lastName !== undefined) profileUpdate['lastName'] = user.lastName;
  if (user.requiredActions !== undefined) profileUpdate['requiredActions'] = user.requiredActions;

  if (Object.keys(profileUpdate).length > 0) {
    const updateRes = await adminFetch(
      token,
      `/admin/realms/${realm}/users/${userId}`,
      'PUT',
      profileUpdate
    );
    if (!updateRes.ok) {
      throw new Error(`Could not update profile for ${user.username}: HTTP ${updateRes.status}`);
    }
  }

  // Assign roles for existing user (idempotent — already-assigned roles are a no-op).
  if (user.realmRoles !== undefined && user.realmRoles.length > 0) {
    await assignRealmRoles(token, realm, userId, user.realmRoles);
  }
}

// Re-export theme helpers so global-setup.ts can import from one place.
export { setRealmPlexicaTheme } from './keycloak-theme-helpers.js';
