/**
 * Shared tenant sanitization utilities.
 *
 * Internal provisioning keys written to `settings` by the orchestrator /
 * invitation step are operational metadata and must never be exposed in API
 * responses.  Both the old `/api/tenants` routes and the new
 * `/api/admin/tenants` routes import from here to guarantee consistent
 * behaviour.
 */

export const INTERNAL_SETTINGS_KEYS = [
  'provisioningState',
  'invitationStatus',
  'invitationError',
  'provisioningError',
  'provisioningFailedStep',
] as const;

/**
 * Strip internal provisioning keys from the tenant settings object before
 * returning to callers.  The keys remain in the DB for operational debugging.
 */
export function sanitizeTenantSettings(
  settings: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!settings || typeof settings !== 'object') return {};
  const sanitized = { ...settings };
  for (const key of INTERNAL_SETTINGS_KEYS) {
    delete sanitized[key];
  }
  return sanitized;
}

/**
 * Return a tenant object safe for API responses: settings stripped of internal
 * keys.
 */
export function sanitizeTenant<T extends { settings?: unknown }>(tenant: T): T {
  return {
    ...tenant,
    settings: sanitizeTenantSettings(tenant.settings as Record<string, unknown> | null | undefined),
  };
}
