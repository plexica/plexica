// services/dev-plugin-store.ts
// In-memory store of dev-registered plugins, keyed per (tenant, slug).
// Dev mode is localhost-only but multi-tenant: two tenants on the same dev
// machine may legitimately run plugins with the same slug. Tenant-scoped keys
// prevent cross-tenant unregister/conflicts and keep the list per-tenant.
// Held in memory only — dev mode is ephemeral by design (Plan §10.7).

export interface DevPluginEntry {
  slug: string;
  backendUrl: string;
  installId?: string;
  tenantSlug: string;
  uiUrl?: string;
  extensionPoints: string[];
  actions: Array<{ action: string; defaultRole: string }>;
  events: string[];
  consumerGroupId?: string;
  registeredAt: Date;
}

const devPlugins = new Map<string, DevPluginEntry>();

function devKey(tenantSlug: string, slug: string): string {
  return `${tenantSlug}:${slug}`;
}

export function getDevPlugin(tenantSlug: string, slug: string): DevPluginEntry | undefined {
  return devPlugins.get(devKey(tenantSlug, slug));
}

export function setDevPlugin(tenantSlug: string, slug: string, entry: DevPluginEntry): void {
  devPlugins.set(devKey(tenantSlug, slug), entry);
}

export function deleteDevPlugin(tenantSlug: string, slug: string): DevPluginEntry | undefined {
  const key = devKey(tenantSlug, slug);
  const entry = devPlugins.get(key);
  if (entry) devPlugins.delete(key);
  return entry;
}

export function listDevPlugins(tenantSlug: string): DevPluginEntry[] {
  return Array.from(devPlugins.values()).filter((p) => p.tenantSlug === tenantSlug);
}