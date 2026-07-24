// services/dev-backends.ts
// In-memory registry of dev-mode plugin backends (slug → proxy target).
// Used by the proxy to route requests to locally-running plugin backends
// during development (Plan §10.7). Dev mode is localhost-only.

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

export function registerDevBackend(
  slug: string,
  target: { baseUrl: string; installId?: string; uiUrl?: string; extensionPoints?: string[] },
): void {
  devBackends.set(slug, {
    enabled: true,
    target: {
      baseUrl: target.baseUrl,
      installId: target.installId ?? slug,
      ...(target.uiUrl ? { uiUrl: target.uiUrl } : {}),
      ...(target.extensionPoints ? { extensionPoints: target.extensionPoints } : {}),
    },
  });
}

export function unregisterDevBackend(slug: string, installId?: string): void {
  const entry = devBackends.get(slug);
  if (entry && (installId === undefined || entry.target.installId === installId)) {
    devBackends.delete(slug);
  }
}

export function getDevBackend(slug: string): ProxyTarget | undefined {
  const entry = devBackends.get(slug);
  return entry?.enabled ? entry.target : undefined;
}

export function getDevBackendForInstallation(
  slug: string,
  installId: string
): ProxyTarget | undefined {
  const entry = devBackends.get(slug);
  return entry?.enabled && entry.target.installId === installId
    ? entry.target
    : undefined;
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
