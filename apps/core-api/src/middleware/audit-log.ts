/**
 * AuditLogMiddleware — T008-06 (Spec 008 Admin Interfaces)
 *
 * Fastify onResponse hook that writes an audit log entry when a route is
 * configured with `config.audit`. Only fires on 2xx/3xx responses.
 *
 * Constitution Article 5.2: No PII or request bodies stored in audit entries.
 * Constitution Article 6.3: Errors are warn-logged, never re-thrown.
 *
 * Usage (on a route definition):
 *   {
 *     config: { audit: { action: 'tenant.created', resourceType: 'tenant' } }
 *   }
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { auditLogService } from '../services/audit-log.service.js';
import { logger } from '../lib/logger.js';

// ============================================================================
// Route-level config type augmentation
// ============================================================================

declare module 'fastify' {
  interface FastifyContextConfig {
    audit?: {
      action: string;
      resourceType?: string;
    };
  }
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Fastify onResponse hook.
 * Reads `request.routeOptions.config.audit` and — on success responses —
 * appends an audit log entry via the (non-blocking) AuditLogService.
 */
export async function auditLogMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const auditConfig = request.routeOptions?.config?.audit;

    // Skip routes that don't declare an audit action
    if (!auditConfig) return;

    // Only log successful responses (2xx / 3xx)
    if (reply.statusCode >= 400) return;

    // Extract resourceId from route params (e.g., :id, :tenantId, :key)
    const params = request.params as Record<string, string | undefined>;
    const resourceId =
      params.id ??
      params.tenantId ??
      params.pluginId ??
      params.userId ??
      params.teamId ??
      params.key ??
      null;

    // Never log raw request bodies — Art. 5.2 (no PII)
    await auditLogService.log({
      userId: request.user?.id ?? null,
      tenantId:
        (request as FastifyRequest & { tenant?: { tenantId: string } }).tenant?.tenantId ?? null,
      action: auditConfig.action,
      resourceType: auditConfig.resourceType ?? null,
      resourceId,
      ipAddress: request.ip ?? null,
      userAgent: (request.headers['user-agent'] as string | undefined) ?? null,
    });
  } catch (err) {
    // Non-blocking: warn-log and do NOT affect the HTTP response
    logger.warn({ err }, 'auditLogMiddleware: unexpected error, audit entry not written');
  }
}
