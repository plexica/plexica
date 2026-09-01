// index.ts
// @plexica/sdk — public entry point.
// The PluginSDK class lives in plugin-sdk.ts (extracted to stay under the
// 200-line gate); this barrel re-exports the full public API unchanged.
//
// Events: dispatched via HTTP POST /_plexica/event (core → plugin backend).
// No direct Kafka connection — core manages all Kafka consumption/production.
// DB: delegated to PluginDb (db.ts) — returns a typed pg.Pool.
// HTTP: delegated to PluginHttp (http.ts) — callApi/emitEvent to core.
// Dogfooded by examples/plugins/crm since 2026-08-18 (ADR-019 adoption).

export { PluginSDK } from './plugin-sdk.js';

// Re-export public types so consumers can import them from '@plexica/sdk'.
export type { PluginConfig, PluginContext, PluginEvent, EventHandler } from './types.js';
// Re-export error classes and DB helper for advanced use.
export { DbAccessError, ApiCallError, SdkNotInitializedError } from './errors.js';
export { PluginDb } from './db.js';