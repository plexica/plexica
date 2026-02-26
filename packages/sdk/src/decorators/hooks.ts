// File: packages/sdk/src/decorators/hooks.ts

/**
 * @plexica/sdk — Hook Decorators
 *
 * TypeScript decorator for declaratively wiring workspace lifecycle hook
 * handlers into Plexica plugin classes. Metadata is stored via
 * `reflect-metadata` and read by the plugin loader.
 *
 * Hook types correspond to workspace lifecycle events emitted by the core
 * API's WorkspaceHookService.
 */

import 'reflect-metadata';

/** Metadata key for workspace hook type (method decorator) */
export const METADATA_KEY_HOOK = 'plexica:hook';

/**
 * Workspace lifecycle hook types.
 *
 * - `before_create`: Called before a workspace is created. Can prevent creation.
 * - `created`: Called after a workspace is successfully created.
 * - `before_delete`: Called before a workspace is deleted. Can prevent deletion.
 * - `deleted`: Called after a workspace is successfully deleted.
 */
export type WorkspaceHookType = 'before_create' | 'created' | 'before_delete' | 'deleted';

/**
 * Method decorator that registers a class method as a workspace lifecycle
 * hook handler for the given hook type.
 *
 * @param type  The workspace lifecycle event to hook into.
 *
 * @example
 * ```typescript
 * class MyWorkspacePlugin extends WorkspaceAwarePlugin {
 *   @Hook('before_create')
 *   async validateNewWorkspace(context: PluginContext) {
 *     // Validate before workspace creation; throw to prevent it
 *   }
 *
 *   @Hook('created')
 *   async onWorkspaceCreated(context: PluginContext) {
 *     // React after a workspace is created
 *     await this.sharedData.set('workspace-init', { ready: true });
 *   }
 *
 *   @Hook('deleted')
 *   async cleanupWorkspace(context: PluginContext) {
 *     // Clean up plugin data when a workspace is deleted
 *   }
 * }
 * ```
 */
export function Hook(type: WorkspaceHookType): MethodDecorator {
  return function (
    target: object,
    propertyKey: string | symbol,
    _descriptor: PropertyDescriptor
  ): void {
    Reflect.defineMetadata(METADATA_KEY_HOOK, type, target, propertyKey);
  };
}
