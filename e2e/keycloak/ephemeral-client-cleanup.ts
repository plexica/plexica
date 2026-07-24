import { adminFetch } from './admin-api.js';

const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export async function deleteLegacyE2eApiClient(token: string): Promise<void> {
  const lookup = await adminFetch(token, '/admin/realms/master/clients?clientId=e2e-api', 'GET');
  if (!lookup.ok) throw new Error(`Legacy e2e-api lookup failed: HTTP ${lookup.status}`);
  const clients = (await lookup.json()) as Array<{ id?: unknown }>;
  for (const client of clients) {
    if (typeof client.id !== 'string') throw new Error('Legacy e2e-api lookup returned no UUID');
    const response = await adminFetch(token, `/admin/realms/master/clients/${client.id}`, 'DELETE');
    if (!response.ok && response.status !== 404) {
      throw new Error(`Legacy e2e-api deletion failed: HTTP ${response.status}`);
    }
  }
}

export async function cleanupStaleEphemeralClients(
  token: string,
  suite: 'admin' | 'web'
): Promise<void> {
  const prefix = `plexica-playwright-${suite}-`;
  const lookup = await adminFetch(token, '/admin/realms/master/clients?first=0&max=1000', 'GET');
  if (!lookup.ok) throw new Error(`Stale E2E client lookup failed: HTTP ${lookup.status}`);
  const clients = (await lookup.json()) as Array<{
    id?: unknown;
    clientId?: unknown;
    attributes?: unknown;
  }>;
  const cutoff = Date.now() - STALE_AFTER_MS;
  for (const client of clients) {
    if (
      typeof client.id !== 'string' ||
      typeof client.clientId !== 'string' ||
      !client.clientId.startsWith(prefix)
    ) {
      continue;
    }
    const readBack = await adminFetch(token, `/admin/realms/master/clients/${client.id}`, 'GET');
    if (!readBack.ok) throw new Error(`Stale E2E client read failed: HTTP ${readBack.status}`);
    const representation = (await readBack.json()) as { attributes?: Record<string, unknown> };
    const attributes = representation.attributes;
    const createdAt = Number(attributes?.['plexica.e2e.created-at']);
    if (!Number.isFinite(createdAt) || createdAt >= cutoff) continue;
    const response = await adminFetch(token, `/admin/realms/master/clients/${client.id}`, 'DELETE');
    if (!response.ok && response.status !== 404) {
      throw new Error(`Stale E2E client deletion failed: HTTP ${response.status}`);
    }
  }
}

export async function cleanupClientWithoutLocation(token: string, clientId: string): Promise<void> {
  const lookup = await adminFetch(
    token,
    `/admin/realms/master/clients?clientId=${encodeURIComponent(clientId)}`,
    'GET'
  );
  if (!lookup.ok) throw new Error(`Ephemeral client cleanup lookup failed: HTTP ${lookup.status}`);
  const matches = (await lookup.json()) as Array<{ id?: unknown }>;
  if (matches.length !== 1 || typeof matches[0]?.id !== 'string') {
    throw new Error(`Ephemeral client cleanup lookup returned ${matches.length} matches`);
  }
  const response = await adminFetch(
    token,
    `/admin/realms/master/clients/${matches[0].id}`,
    'DELETE'
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`Ephemeral client cleanup failed: HTTP ${response.status}`);
  }
}
