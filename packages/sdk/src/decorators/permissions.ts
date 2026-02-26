// File: packages/sdk/src/decorators/permissions.ts

/**
 * @plexica/sdk — Permission Decorators
 *
 * TypeScript decorator for declaratively declaring the permissions a plugin
 * requires. Metadata is stored via `reflect-metadata` and read by the plugin
 * loader to validate and register permissions with the core API.
 *
 * Multiple `@Permission` decorators on the same class accumulate into an array.
 */

import 'reflect-metadata';

/** Metadata key for plugin permissions (class decorator) */
export const METADATA_KEY_PERMISSIONS = 'plexica:permissions';

/**
 * A declared plugin permission entry.
 */
export interface PermissionMetadata {
  /** Machine-readable permission key (e.g. `contacts:read`) */
  key: string;
  /** Human-readable permission name (e.g. `Read Contacts`) */
  name: string;
  /** Description of what this permission allows */
  description: string;
}

/**
 * Class decorator that declares a permission required by the plugin.
 *
 * Multiple `@Permission` decorators can be stacked on the same class — they
 * accumulate into an array, in declaration order (top to bottom).
 *
 * @param key         Machine-readable permission key (e.g. `contacts:read`)
 * @param name        Human-readable permission name (e.g. `Read Contacts`)
 * @param description Description of what this permission allows
 *
 * @example
 * ```typescript
 * @Permission('contacts:read', 'Read Contacts', 'Allows reading the contacts list')
 * @Permission('contacts:write', 'Write Contacts', 'Allows creating and updating contacts')
 * class MyCrmPlugin extends PlexicaPlugin {
 *   // ...
 * }
 * ```
 */
export function Permission(key: string, name: string, description: string): ClassDecorator {
  return function (target: Function): void {
    const existing: PermissionMetadata[] =
      Reflect.getMetadata(METADATA_KEY_PERMISSIONS, target) ?? [];
    existing.push({ key, name, description });
    Reflect.defineMetadata(METADATA_KEY_PERMISSIONS, existing, target);
  };
}
