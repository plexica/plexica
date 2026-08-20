import { config } from './config.js';
import { adminRequestOk } from './keycloak-admin-internal.js';
import { buildAudienceMapperPayload } from './keycloak-admin-helpers.js';

interface ProtocolMapper extends Record<string, unknown> {
  id?: unknown;
  name?: unknown;
  config?: unknown;
}

const MAPPER_NAME = 'audience-mapper';

async function readMappers(realm: string, clientUuid: string): Promise<ProtocolMapper[]> {
  const response = await adminRequestOk(
    `/admin/realms/${realm}/clients/${clientUuid}/protocol-mappers/models`,
    'GET',
    undefined,
    { context: `Failed to read audience mapper in ${realm}` }
  );
  return (await response.json()) as ProtocolMapper[];
}

export async function reconcileApiAudienceMapper(realm: string, clientUuid: string): Promise<void> {
  const matches = (await readMappers(realm, clientUuid)).filter(({ name }) => name === MAPPER_NAME);
  if (matches.length > 1) throw new Error(`Multiple audience mappers exist in ${realm}`);
  const desired = buildAudienceMapperPayload(config.KEYCLOAK_API_AUDIENCE);
  const existing = matches[0];
  const path = `/admin/realms/${realm}/clients/${clientUuid}/protocol-mappers/models`;
  const context = `Failed to reconcile API audience mapper in ${realm}`;
  if (existing === undefined) {
    await adminRequestOk(path, 'POST', desired, { context });
  } else {
    await adminRequestOk(
      `${path}/${String(existing.id)}`,
      'PUT',
      { ...existing, ...desired },
      { context }
    );
  }

  const verified = (await readMappers(realm, clientUuid)).find(({ name }) => name === MAPPER_NAME);
  const mapperConfig = verified?.config as Record<string, unknown> | undefined;
  if (
    mapperConfig?.['included.client.audience'] !== config.KEYCLOAK_API_AUDIENCE ||
    mapperConfig['access.token.claim'] !== 'true'
  ) {
    throw new Error(`API audience mapper verification failed in ${realm}`);
  }
}
