export const CONSUMER_GROUP_PREFIX = 'plugin-';

const INSTALL_UUID_LENGTH = 36;
const INSTALL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ConsumerGroupName {
  installId: string;
  tenantSlug: string;
}

export function parseConsumerGroupName(groupId: string): ConsumerGroupName | null {
  if (!groupId.startsWith(CONSUMER_GROUP_PREFIX)) return null;
  const rest = groupId.slice(CONSUMER_GROUP_PREFIX.length);
  const installId = rest.slice(0, INSTALL_UUID_LENGTH);
  const tenantSlug = rest.slice(INSTALL_UUID_LENGTH + 1);
  if (!INSTALL_UUID_RE.test(installId) || tenantSlug.length === 0) return null;
  return { installId, tenantSlug };
}

export function extractInstallIds(groups: string[]): string[] {
  const ids: string[] = [];
  for (const group of groups) {
    const parsed = parseConsumerGroupName(group);
    if (parsed !== null) ids.push(parsed.installId);
  }
  return ids;
}

export function buildGroupId(installId: string, tenantSlug: string): string {
  return `${CONSUMER_GROUP_PREFIX}${installId}-${tenantSlug}`;
}
