/**
 * Translation message flattening and unflattening utilities.
 *
 * Converts between nested object structure and flat dotted-key structure.
 */

import type { NamespacedMessages } from './types.js';

/**
 * Flatten nested translation messages to dotted key paths.
 *
 * Converts a nested object structure to a flat object with dotted keys.
 * Used when loading plugin translations from JSON files.
 *
 * @param nested - Nested translation object
 * @param prefix - Internal: key prefix for recursion
 * @returns Flat object with dotted keys
 *
 * @example
 * ```typescript
 * const nested = {
 *   dashboard: {
 *     title: 'Dashboard',
 *     actions: {
 *       save: 'Save',
 *       cancel: 'Cancel'
 *     }
 *   }
 * };
 *
 * const flat = flattenMessages(nested);
 * // Result: {
 * //   'dashboard.title': 'Dashboard',
 * //   'dashboard.actions.save': 'Save',
 * //   'dashboard.actions.cancel': 'Cancel'
 * // }
 * ```
 */
export function flattenMessages(
  nested: NamespacedMessages,
  prefix: string = ''
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const key in nested) {
    if (!Object.prototype.hasOwnProperty.call(nested, key)) {
      continue;
    }

    const value = nested[key];
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      result[newKey] = value;
    } else if (typeof value === 'object' && value !== null) {
      // Recursively flatten nested objects
      Object.assign(result, flattenMessages(value as NamespacedMessages, newKey));
    } else {
      // Skip non-string, non-object values (arrays, null, undefined, etc.)
      console.warn(`[flattenMessages] Skipping non-string value at key "${newKey}":`, value);
    }
  }

  return result;
}

/**
 * Unflatten dotted key paths to nested object structure.
 *
 * Converts a flat object with dotted keys back to nested structure.
 * Used when reconstructing plugin manifest structure from database.
 *
 * @param flat - Flat object with dotted keys
 * @returns Nested translation object
 *
 * @example
 * ```typescript
 * const flat = {
 *   'dashboard.title': 'Dashboard',
 *   'dashboard.actions.save': 'Save',
 *   'dashboard.actions.cancel': 'Cancel'
 * };
 *
 * const nested = unflattenMessages(flat);
 * // Result: {
 * //   dashboard: {
 *  //     title: 'Dashboard',
 * //     actions: {
 * //       save: 'Save',
 * //       cancel: 'Cancel'
 * //     }
 * //   }
 * // }
 * ```
 */
export function unflattenMessages(flat: Record<string, string>): NamespacedMessages {
  const result: NamespacedMessages = {};

  for (const key in flat) {
    if (!Object.prototype.hasOwnProperty.call(flat, key)) {
      continue;
    }

    const value = flat[key];
    const keys = key.split('.');
    let current: any = result;

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];

      if (i === keys.length - 1) {
        // Last key: assign the string value
        current[k] = value;
      } else {
        // Intermediate key: ensure object exists
        if (typeof current[k] !== 'object' || current[k] === null) {
          current[k] = {};
        }
        current = current[k];
      }
    }
  }

  return result;
}
