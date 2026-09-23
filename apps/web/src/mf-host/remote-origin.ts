// mf-host/remote-origin.ts
// Shared origin allow-list for plugin remote assets (remoteEntry.js AND i18n
// bundle JSON). Extracted from plugin-loader so the i18n bundle fetcher (006-09)
// enforces exactly the same boundary as script injection.

// Allow-list of origins for remote script injection
export const ALLOWED_ORIGINS = [
  'http://localhost:4001',
  'http://localhost:4002',
  'http://localhost:4003',
  'http://localhost:4004',
  'http://localhost:4005',
  'http://127.0.0.1:4001',
];

// Exact object-storage asset origin in production (VITE_PLUGIN_ASSET_ORIGIN).
// Local dev still uses the storage default below; there is deliberately NO
// broad `storage.*` pattern — an attacker-controlled host must never pass.
const configuredAssetOrigin = import.meta.env.VITE_PLUGIN_ASSET_ORIGIN as string | undefined;

// CI runtime contract builds serve plugin assets from a per-project object
// storage server published on an ephemeral loopback port (dynamic-port
// mandate). The origin cannot be baked in at build time, so these builds
// trust strict loopback http origins; production builds keep the exact
// allow-list above.
declare const __PLEXICA_CI_RUNTIME_CONTRACT__: boolean;

export function ciRuntimeContractBuild(): boolean {
  return typeof __PLEXICA_CI_RUNTIME_CONTRACT__ !== 'undefined' && __PLEXICA_CI_RUNTIME_CONTRACT__;
}

const CI_LOOPBACK_ORIGIN_PATTERN = /^http:\/\/127\.0\.0\.1:[1-9][0-9]*$/;

export function isOriginAllowed(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      ALLOWED_ORIGINS.includes(parsed.origin) ||
      parsed.origin === configuredAssetOrigin ||
      parsed.origin === 'http://localhost:9000' ||
      (ciRuntimeContractBuild() && CI_LOOPBACK_ORIGIN_PATTERN.test(parsed.origin))
    );
  } catch {
    return false;
  }
}
