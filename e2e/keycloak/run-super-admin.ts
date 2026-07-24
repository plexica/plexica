import { randomBytes, randomUUID } from 'node:crypto';

import { adminFetch, assertExplicitLoopbackE2eTarget } from './admin-api.js';

import type { KeycloakRole } from './realm-role.js';

export const SUPER_ADMIN_USER_ENV = 'PLAYWRIGHT_SUPER_ADMIN_USER';
export const SUPER_ADMIN_PASSWORD_ENV = 'PLAYWRIGHT_SUPER_ADMIN_PASS';
export const SUPER_ADMIN_UUID_ENV = 'PLAYWRIGHT_SUPER_ADMIN_UUID';

const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

interface UserRepresentation {
  id?: unknown;
  username?: unknown;
  createdTimestamp?: unknown;
}

function userPrefix(suite: 'admin' | 'web'): string {
  return `plexica-playwright-${suite}-user-`;
}

async function lookupUser(token: string, username: string): Promise<UserRepresentation | null> {
  const response = await adminFetch(
    token,
    `/admin/realms/master/users?username=${encodeURIComponent(username)}&exact=true`,
    'GET'
  );
  if (!response.ok) throw new Error(`E2E super-admin lookup failed: HTTP ${response.status}`);
  const users = (await response.json()) as UserRepresentation[];
  if (users.length > 1) throw new Error(`Multiple master users found for ${username}`);
  return users[0] ?? null;
}

async function deleteUser(token: string, uuid: string): Promise<void> {
  const response = await adminFetch(token, `/admin/realms/master/users/${uuid}`, 'DELETE');
  if (!response.ok && response.status !== 404) {
    throw new Error(`E2E super-admin deletion failed: HTTP ${response.status}`);
  }
}

async function cleanupStaleUsers(token: string, suite: 'admin' | 'web'): Promise<void> {
  const prefix = userPrefix(suite);
  const response = await adminFetch(
    token,
    `/admin/realms/master/users?search=${encodeURIComponent(prefix)}&max=100`,
    'GET'
  );
  if (!response.ok) throw new Error(`Stale E2E user lookup failed: HTTP ${response.status}`);
  const cutoff = Date.now() - STALE_AFTER_MS;
  const users = (await response.json()) as UserRepresentation[];
  for (const user of users) {
    if (
      typeof user.id === 'string' &&
      typeof user.username === 'string' &&
      user.username.startsWith(prefix) &&
      typeof user.createdTimestamp === 'number' &&
      user.createdTimestamp < cutoff
    ) {
      await deleteUser(token, user.id);
    }
  }
}

async function removeBootstrapRole(
  token: string,
  bootstrapUsername: string,
  role: KeycloakRole
): Promise<void> {
  const user = await lookupUser(token, bootstrapUsername);
  if (typeof user?.id !== 'string')
    throw new Error(`Bootstrap user ${bootstrapUsername} not found`);
  const path = `/admin/realms/master/users/${user.id}/role-mappings/realm`;
  const response = await adminFetch(token, path, 'GET');
  if (!response.ok) throw new Error(`Bootstrap role read failed: HTTP ${response.status}`);
  const roles = (await response.json()) as Array<{ id?: unknown; name?: unknown }>;
  if (roles.some(({ name }) => name === role.name)) {
    const deletion = await adminFetch(token, path, 'DELETE', [role]);
    if (!deletion.ok) throw new Error(`Bootstrap role cleanup failed: HTTP ${deletion.status}`);
  }
}

async function setOnlySuperAdminRole(
  token: string,
  userUuid: string,
  role: KeycloakRole
): Promise<void> {
  const path = `/admin/realms/master/users/${userUuid}/role-mappings/realm`;
  const currentResponse = await adminFetch(token, path, 'GET');
  if (!currentResponse.ok)
    throw new Error(`E2E user role read failed: HTTP ${currentResponse.status}`);
  const current = (await currentResponse.json()) as Array<Record<string, unknown>>;
  if (current.length > 0) {
    const deletion = await adminFetch(token, path, 'DELETE', current);
    if (!deletion.ok) throw new Error(`E2E user role cleanup failed: HTTP ${deletion.status}`);
  }
  const mapping = await adminFetch(token, path, 'POST', [role]);
  if (!mapping.ok) throw new Error(`E2E user role mapping failed: HTTP ${mapping.status}`);
  const verifyResponse = await adminFetch(token, path, 'GET');
  if (!verifyResponse.ok)
    throw new Error(`E2E user role verification failed: HTTP ${verifyResponse.status}`);
  const verified = (await verifyResponse.json()) as Array<{ name?: unknown }>;
  if (verified.length !== 1 || verified[0]?.name !== 'super_admin') {
    throw new Error(`E2E user has unexpected direct realm roles: ${JSON.stringify(verified)}`);
  }
}

export async function createRunScopedSuperAdmin(
  token: string,
  suite: 'admin' | 'web',
  role: KeycloakRole
): Promise<void> {
  assertExplicitLoopbackE2eTarget();
  await cleanupStaleUsers(token, suite);
  const bootstrapUsername = process.env['KEYCLOAK_ADMIN_USER'] ?? 'admin';
  await removeBootstrapRole(token, bootstrapUsername, role);

  const username = `${userPrefix(suite)}${randomUUID()}`;
  const password = `${randomBytes(32).toString('base64url')}!Aa1`;
  if (username === bootstrapUsername)
    throw new Error('E2E super-admin must differ from bootstrap admin');
  let uuid = '';
  try {
    const response = await adminFetch(token, '/admin/realms/master/users', 'POST', {
      username,
      enabled: true,
      credentials: [{ type: 'password', value: password, temporary: false }],
    });
    if (response.status !== 201)
      throw new Error(`E2E super-admin creation failed: HTTP ${response.status}`);
    uuid = response.headers.get('Location')?.split('/').pop() ?? '';
    if (uuid === '') {
      const found = await lookupUser(token, username);
      if (typeof found?.id !== 'string')
        throw new Error('E2E super-admin creation returned no UUID');
      uuid = found.id;
    }
    process.env[SUPER_ADMIN_USER_ENV] = username;
    process.env[SUPER_ADMIN_PASSWORD_ENV] = password;
    process.env[SUPER_ADMIN_UUID_ENV] = uuid;
    await setOnlySuperAdminRole(token, uuid, role);
  } catch (error) {
    let cleanupError: unknown;
    try {
      const cleanupUser = uuid === '' ? await lookupUser(token, username) : { id: uuid };
      if (typeof cleanupUser?.id === 'string') await deleteUser(token, cleanupUser.id);
    } catch (caught) {
      cleanupError = caught;
    }
    delete process.env[SUPER_ADMIN_USER_ENV];
    delete process.env[SUPER_ADMIN_PASSWORD_ENV];
    delete process.env[SUPER_ADMIN_UUID_ENV];
    if (cleanupError !== undefined) {
      throw new AggregateError([error, cleanupError], 'E2E super-admin setup and cleanup failed');
    }
    throw error;
  }
}

export async function deleteRunScopedSuperAdmin(token: string): Promise<void> {
  assertExplicitLoopbackE2eTarget();
  const uuid = process.env[SUPER_ADMIN_UUID_ENV];
  if (uuid !== undefined) await deleteUser(token, uuid);
  delete process.env[SUPER_ADMIN_USER_ENV];
  delete process.env[SUPER_ADMIN_PASSWORD_ENV];
  delete process.env[SUPER_ADMIN_UUID_ENV];
}
