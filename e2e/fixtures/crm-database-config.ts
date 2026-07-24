import crypto from 'node:crypto';

export const CRM_E2E_INSTALL_ID = '44000000-0000-4000-8000-000000000004';
export const CRM_E2E_ROLE = `plugin_${CRM_E2E_INSTALL_ID.replace(/-/g, '_')}`;
export const CRM_E2E_SCHEMA = 'tenant_e2e';

export function crmE2ePassword(databaseUrl: string): string {
  const database = new URL(databaseUrl).pathname;
  return crypto.createHash('sha256').update(`crm-e2e:${database}`).digest('base64url');
}

export function crmRestrictedDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.username = CRM_E2E_ROLE;
  url.password = crmE2ePassword(databaseUrl);
  url.search = '';
  url.searchParams.set('options', `-c search_path=${CRM_E2E_SCHEMA}`);
  return url.toString();
}
