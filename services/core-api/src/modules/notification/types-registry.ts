// types-registry.ts
// Notification type registry for the prefs UI (features 006-04/006-05):
// core ADR-035 consumer types plus installed-plugin-declared types. The prefs
// UI (GET /api/v1/notifications/types) renders one channel-toggle row per type.

import { withCoreDb, withTenantDb } from '../../lib/tenant-database.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';

export interface NotificationTypeDefinition {
  key: string;
  labelKey: string;
  channels: Array<'inApp' | 'email'>;
}

/**
 * Core notification types. Only types the notification consumer pipeline
 * actually emits today are registered — listing a type that can never fire
 * would let users enable channels for notifications that never arrive.
 */
export const CORE_NOTIFICATION_TYPES: readonly NotificationTypeDefinition[] = [
  { key: 'workspace.invite', labelKey: 'notifications.workspace.invite.title', channels: ['inApp', 'email'] },
];

/**
 * Installed-plugin-declared notification types, derived from the catalog
 * manifest `notifications` declaration (forward-compatible: no plugin declares
 * one today, so this returns core types only). Type keys must already be
 * pre-prefixed `plugin.{slug}.{type}` by the manifest author.
 */
export async function getNotificationTypes(
  tenantCtx: TenantContext
): Promise<NotificationTypeDefinition[]> {
  const installed = await withTenantDb(
    (db) =>
      db.pluginInstallation.findMany({
        where: { status: { in: ['active', 'degraded'] } },
        select: { pluginId: true },
      }),
    tenantCtx
  );
  if (installed.length === 0) return [...CORE_NOTIFICATION_TYPES];

  const pluginIds = installed.map((installation) => installation.pluginId);
  const plugins = await withCoreDb((db) =>
    db.plugin.findMany({
      where: { id: { in: pluginIds } },
      select: { slug: true, manifest: true },
    })
  );

  const pluginTypes: NotificationTypeDefinition[] = [];
  for (const plugin of plugins) {
    const manifest = plugin.manifest as {
      notifications?: Array<{
        type: string;
        labelKey?: string;
        channels?: Array<'inApp' | 'email'>;
      }>;
    };
    for (const declared of manifest.notifications ?? []) {
      if (declared.type.length === 0) continue;
      pluginTypes.push({
        key: declared.type,
        labelKey: declared.labelKey ?? `notifications.plugin.${plugin.slug}.title`,
        channels: declared.channels ?? ['inApp', 'email'],
      });
    }
  }
  return [...CORE_NOTIFICATION_TYPES, ...pluginTypes];
}