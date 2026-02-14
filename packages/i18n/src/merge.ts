/**
 * Tenant override merging utilities.
 *
 * Merges tenant-specific translation overrides onto base plugin translations.
 */

import type { OverrideMergeResult } from './types.js';

/**
 * Merge tenant translation overrides onto base messages.
 *
 * Overrides replace base values for matching keys. Keys in overrides without
 * matching base keys are flagged as "orphaned" (no source translation to override).
 *
 * @param baseMessages - Base plugin translations (flat dotted keys)
 * @param overrides - Tenant-specific overrides (flat dotted keys)
 * @returns Merged messages with orphaned key tracking
 *
 * @example
 * ```typescript
 * const base = {
 *   'common.greeting': 'Hello',
 *   'common.farewell': 'Goodbye'
 * };
 *
 * const overrides = {
 *   'common.greeting': 'Ciao',  // Override
 *   'common.custom': 'Custom'   // Orphaned (no base key)
 * };
 *
 * const result = mergeOverrides(base, overrides);
 * // Result: {
 * //   messages: {
 * //     'common.greeting': 'Ciao',
 * //     'common.farewell': 'Goodbye',
 * //     'common.custom': 'Custom'
 * //   },
 * //   orphanedKeys: ['common.custom']
 * // }
 * ```
 */
export function mergeOverrides(
  baseMessages: Record<string, string>,
  overrides: Record<string, string>
): OverrideMergeResult {
  const messages: Record<string, string> = { ...baseMessages };
  const orphanedKeys: string[] = [];

  // Apply overrides
  for (const key in overrides) {
    if (!Object.prototype.hasOwnProperty.call(overrides, key)) {
      continue;
    }

    // Track orphaned override keys (no base translation exists)
    if (!baseMessages[key]) {
      orphanedKeys.push(key);
    }

    // Merge override (even if orphaned, to allow custom keys)
    messages[key] = overrides[key];
  }

  return {
    messages,
    orphanedKeys,
  };
}
