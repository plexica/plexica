import { adminFetch } from './admin-api.js';

export interface KeycloakRole {
  id: string;
  name: string;
}

async function responseFailure(response: Response): Promise<string> {
  const detail = await response.text().catch(() => '');
  return `HTTP ${response.status}${detail === '' ? '' : ` ${detail}`}`;
}

export async function ensureSuperAdminForUser(
  token: string,
  username: string
): Promise<KeycloakRole> {
  const createResponse = await adminFetch(token, '/admin/realms/master/roles', 'POST', {
    name: 'super_admin',
    description: 'Super administrator with full platform access',
  });
  if (!createResponse.ok && createResponse.status !== 409) {
    throw new Error(`Failed to create super_admin role: ${await responseFailure(createResponse)}`);
  }

  const roleResponse = await adminFetch(token, '/admin/realms/master/roles/super_admin', 'GET');
  if (!roleResponse.ok) {
    throw new Error(`Failed to read super_admin role: ${await responseFailure(roleResponse)}`);
  }
  const role = (await roleResponse.json()) as Partial<KeycloakRole>;
  if (typeof role.id !== 'string' || role.name !== 'super_admin') {
    throw new Error('Keycloak returned an invalid super_admin role representation');
  }

  const userResponse = await adminFetch(
    token,
    `/admin/realms/master/users?username=${encodeURIComponent(username)}&exact=true`,
    'GET'
  );
  if (!userResponse.ok) {
    throw new Error(`Failed to look up master user: ${await responseFailure(userResponse)}`);
  }
  const users = (await userResponse.json()) as Array<{ id?: unknown }>;
  const userId = users[0]?.id;
  if (typeof userId !== 'string') {
    throw new Error(`Master user ${username} was not found`);
  }

  const mappingResponse = await adminFetch(
    token,
    `/admin/realms/master/users/${userId}/role-mappings/realm`,
    'POST',
    [role]
  );
  if (!mappingResponse.ok) {
    throw new Error(`Failed to assign super_admin role: ${await responseFailure(mappingResponse)}`);
  }
  return { id: role.id, name: role.name };
}
