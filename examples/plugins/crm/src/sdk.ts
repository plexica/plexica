// sdk.ts
// PluginSDK singleton for the CRM plugin backend.
// The SDK is the single entry point for platform-managed resources:
// - DB access via sdk.query() / sdk.queryOne() (typed pg.Pool under the hood)
// - Event handling via sdk.onEvent() / sdk.dispatchEvent()
//
// The platform injects DATABASE_URL pointing at the restricted plugin role.
// The SDK reads it from process.env, so no explicit dbConnectionString is needed.
//
// Dogfooding: this is the first real consumer of @plexica/sdk (ADR-019 adoption,
// 2026-08-18). See .forge/knowledge/decision-log.md → Fase 5 Decision 3.

import { PluginSDK } from '@plexica/sdk';

import logger from './logger.js';

export const sdk = new PluginSDK({
  pluginId: process.env['PLEXICA_PLUGIN_ID'] ?? 'crm',
  slug: 'crm',
  tenantId: process.env['PLEXICA_TENANT_ID'] ?? '',
  apiUrl: process.env['CORE_API_URL'] ?? 'http://localhost:3001',
});

export async function initSdk(): Promise<void> {
  await sdk.initialize();
  logger.info('PluginSDK initialized');
}

export async function destroySdk(): Promise<void> {
  await sdk.destroy();
  logger.info('PluginSDK destroyed');
}
