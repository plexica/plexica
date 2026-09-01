// services/dev-backends.ts
// In-memory registry of dev-mode plugin backends (tenantSlug|slug → proxy target).
// Used by the proxy to route requests to locally-running plugin backends
// during development (Plan §10.7). Dev mode is localhost-only.
//
// Keyed by tenant AND slug (M-1 / CodeRabbit): two tenants on the same dev
// machine may run plugins with the same slug; a slug-only key would let the
// second registration shadow the first and route the first tenant's proxy
// traffic to the wrong backend. Callers without a tenant (e.g. the core-side
// CRM probe in modules/plugin/index.ts) use a bare slug key.

export interface ProxyTarget {
  baseUrl: string;
  installId: string;
  uiUrl?: string;
  extensionPoints?: string[];
}

interface DevBackendEntry {
  target: ProxyTarget;
  enabled: boolean;
}

const devBackends = new Map<string, DevBackendEntry>();

function keyFor(tenantSlug: string | undefined, slug: string): string {
  return tenantSlug === undefined || tenantSlug === '' ? slug : `${tenantSlug}|${slug}`;
}

export function registerDevBackend(
  slug: string,
  target: { baseUrl: string; installId?: string; uiUrl?: string; extensionPoints?: string[] },
  tenantSlug?: string,
): void {
  devBackends.set(keyFor(tenantSlug, slug), {
    enabled: true,
    target: {
      baseUrl: target.baseUrl,
      installId: target.installId ?? slug,
      ...(target.uiUrl ? { uiUrl: target.uiUrl } : {}),
      ...(target.extensionPoints ? { extensionPoints: target.extensionPoints } : {}),
    },
  });
}

export function unregisterDevBackend(
  slug: string,
  installId?: string,
  tenantSlug?: string,
): void {
  const key = keyFor(tenantSlug, slug);
  const entry = devBackends.get(key);
  if (entry && (installId === undefined || entry.target.installId === installId)) {
    devBackends.delete(key);
  }
}

export function getDevBackend(slug: string, tenantSlug?: string): ProxyTarget | undefined {
  const entry = devBackends.get(keyFor(tenantSlug, slug));
  return entry?.enabled ? entry.target : undefined;
}

export function getDevBackendForInstallation(
  _slug: string,
  installId: string
): ProxyTarget | undefined {
  for (const entry of devBackends.values()) {
    if (entry.enabled && entry.target.installId === installId) return entry.target;
  }
  return undefined;
}

export function disableDevBackend(installId: string): void {
  for (const entry of devBackends.values()) {
    if (entry.target.installId === installId) entry.enabled = false;
  }
}

export function enableDevBackend(installId: string): void {
  for (const entry of devBackends.values()) {
    if (entry.target.installId === installId) entry.enabled = true;
  }
}