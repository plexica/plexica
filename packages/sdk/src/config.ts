// config.ts
// PluginConfig resolution — applies the platform env fallbacks so PluginSDK
// and the standalone emitNotification() entry point resolve identical
// defaults (single source of truth; ADR-019 identity/auth).

import type { PluginConfig } from './types.js';

/**
 * Resolve a PluginConfig applying the same environment fallbacks the platform
 * runtime injects:
 * - `apiUrl`: `config.apiUrl || CORE_API_URL || http://localhost:3001`.
 *   Uses `||` (not `??`): an empty apiUrl must fall back to the loopback dev
 *   default, and only that default is allowed over cleartext HTTP.
 * - `serviceToken`: `config.serviceToken ?? PLEXICA_SERVICE_TOKEN`
 * - `installId`: `config.installId ?? PLEXICA_INSTALL_ID`
 */
export function resolvePluginConfig(config: PluginConfig): PluginConfig {
  const apiUrl = config.apiUrl || process.env['CORE_API_URL'] || 'http://localhost:3001';
  const serviceToken = config.serviceToken ?? process.env['PLEXICA_SERVICE_TOKEN'];
  const installId = config.installId ?? process.env['PLEXICA_INSTALL_ID'];
  return {
    ...config,
    apiUrl,
    // CWE-319 allowlist passthrough (F9): default = no allowlist = safest.
    // Explicitly materialized so resolved configs are never accidentally
    // permissive.
    allowHttpHosts: config.allowHttpHosts ?? [],
    allowHttpInternal: config.allowHttpInternal ?? false,
    ...(serviceToken ? { serviceToken } : {}),
    ...(installId ? { installId } : {}),
  };
}