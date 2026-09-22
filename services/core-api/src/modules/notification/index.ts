// index.ts
// Notification module — Fastify plugin entry points. Mirrors the plugin module
// pattern: src/index.ts wires notificationModuleRoutes into the tenantScope and
// notificationModuleEmitRoutes into the eventScope (006-05 emit route).

import { notificationRoutes } from './routes.js';
import { notificationEmitRoutes } from './emit.routes.js';

import type { FastifyInstance } from 'fastify';

/**
 * Tenant-scoped notification routes (stream + center + prefs + types).
 * Registered inside the authenticated tenantScope in src/index.ts.
 */
export async function notificationModuleRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(notificationRoutes);
}

/**
 * Plugin emission route — registered in the eventScope (pluginEventAuth)
 * because plugin backends authenticate with an X-Plugin-Service-Token.
 */
export async function notificationModuleEmitRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(notificationEmitRoutes);
}