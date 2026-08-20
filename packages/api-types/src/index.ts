// index.ts
// @plexica/api-types — Shared API contract package (ADR-029).
//
// Single source of truth for API response types, generated from Zod schemas.
// Both frontend apps (web, admin) and the backend (core-api) import from here.
//
// Exports:
//   - common: PaginatedResult, paginationSchema
//   - admin:  Kafka, tenant, audit, health, dashboard, plugin, logs
//   - tenant: workspace, audit-log, user, plugin marketplace

export * from './common.js';
export * from './admin/index.js';
export * from './tenant/index.js';
