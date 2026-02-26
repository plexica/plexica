// File: packages/sdk/src/decorators/index.ts

/**
 * @plexica/sdk — Decorators Barrel
 *
 * Re-exports all SDK decorators and their associated types/metadata keys.
 */

export {
  EventHandler,
  EventPublisher,
  METADATA_KEY_EVENT_HANDLER,
  METADATA_KEY_EVENT_PUBLISHER,
} from './events.js';

export { Permission, METADATA_KEY_PERMISSIONS } from './permissions.js';
export type { PermissionMetadata } from './permissions.js';

export { Hook, METADATA_KEY_HOOK } from './hooks.js';
export type { WorkspaceHookType } from './hooks.js';
