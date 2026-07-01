// services/dev-backends.ts
// In-memory registry of dev-mode plugin backends (slug → proxy target).
// Used by the proxy to route requests to locally-running plugin backends
// during development (Plan §10.7). Dev mode is localhost-only.

export interface ProxyTarget {
  baseUrl: string;
  installId: string;
}

const devBackends = new Map<string, ProxyTarget>();

export function registerDevBackend(
  slug: string,
  target: { baseUrl: string; installId?: string },
): void {
  devBackends.set(slug, { baseUrl: target.baseUrl, installId: target.installId ?? slug });
}

export function unregisterDevBackend(slug: string): void {
  devBackends.delete(slug);
}

export function getDevBackend(slug: string): ProxyTarget | undefined {
  return devBackends.get(slug);
}
