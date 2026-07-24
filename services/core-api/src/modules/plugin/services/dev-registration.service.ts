import { withCoreDb } from '../../../lib/tenant-database.js';
import { createConsumerGroup, deleteConsumerGroup } from '../events/consumer-manager.service.js';
import { dispatchEvent } from '../events/event-dispatcher.service.js';

import { registerDevBackend, unregisterDevBackend } from './dev-backends.js';

interface DevRuntimeInput {
  slug: string;
  installId?: string;
  tenantSlug: string;
  backendUrl: string;
  uiUrl?: string;
  extensionPoints: string[];
  events: string[];
}

export async function registerDevRuntime(input: DevRuntimeInput): Promise<string | undefined> {
  registerDevBackend(input.slug, {
    baseUrl: input.backendUrl,
    ...(input.installId ? { installId: input.installId } : {}),
    ...(input.uiUrl ? { uiUrl: input.uiUrl } : {}),
    extensionPoints: input.extensionPoints,
  });
  if (!input.installId || input.events.length === 0) return undefined;

  // Replace a container-backed callback with the local dev backend callback.
  await deleteConsumerGroup(input.installId, input.tenantSlug);
  const [plugin, tenant] = await withCoreDb((db) => Promise.all([
    db.plugin.findUnique({ where: { slug: input.slug }, select: { id: true } }),
    db.tenant.findUnique({ where: { slug: input.tenantSlug }, select: { id: true } }),
  ]));
  if (!plugin || !tenant) throw new Error('Plugin development runtime ownership is invalid');
  await createConsumerGroup(
    input.installId,
    tenant.id,
    input.tenantSlug,
    input.events,
    (event) => dispatchEvent(input.backendUrl, event),
    plugin.id,
  );
  return `plugin-${input.installId}-${input.tenantSlug}`;
}

export async function unregisterDevRuntime(
  slug: string,
  installId: string | undefined,
  tenantSlug: string,
): Promise<void> {
  unregisterDevBackend(slug, installId);
  if (installId) await deleteConsumerGroup(installId, tenantSlug);
}
