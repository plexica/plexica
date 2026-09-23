// i18n/plugin-bundle-schema.ts
// Validation for plugin i18n bundles (006-09 — plugin poisoning risk, plan §14).
// Bundles are fetched from the MF remote asset origin as `i18n/{locale}.json`
// and must satisfy two guards before entering the active message set:
//   1. structural — a flat `{ key: string }` record with constrained keys;
//   2. size — at most PLUGIN_BUNDLE_MAX_BYTES per locale per plugin.

import { z } from 'zod';

/** Max accepted bundle size per locale per plugin (100 KB, plan risk §14). */
export const PLUGIN_BUNDLE_MAX_BYTES = 100 * 1024;

const BUNDLE_KEY_REGEX = /^[a-z][a-z0-9._-]{0,254}$/i;

const bundleValueSchema = z.string().min(1).max(1024);

/**
 * Flat bundle record. Keys are UNPREFIXED (`list.title`, …): the shell injects
 * the `plugin.{slug}.` prefix at merge time (D-8), so a key that already
 * carries `plugin.` is rejected — a double prefix would punch a hole in the
 * namespace isolation.
 */
export const pluginBundleSchema = z
  .record(
    z
      .string()
      .min(1)
      .max(255)
      .regex(BUNDLE_KEY_REGEX, 'Bundle keys must be lowercase dotted identifiers')
      .refine(
        (key) => !key.toLowerCase().startsWith('plugin.'),
        'Bundle keys must NOT be prefix-namespaced (the shell adds plugin.{slug}.)'
      ),
    bundleValueSchema
  )
  .superRefine((record, ctx) => {
    if (Object.keys(record).length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Bundle must not be empty' });
    }
  });

export type PluginBundleRecord = z.infer<typeof pluginBundleSchema>;

/** Parses + validates the raw bundle text. Throws on invalid JSON/shape. */
export function parsePluginBundle(raw: string): PluginBundleRecord {
  // Byte-accurate cap: `string.length` counts UTF-16 code units, so a bundle
  // of CJK/emoji text could exceed 100 KB of UTF-8 while staying under the
  // unit count. Encoding the raw payload measures what the browser actually
  // transmits over the wire.
  if (new TextEncoder().encode(raw).byteLength > PLUGIN_BUNDLE_MAX_BYTES) {
    throw new Error('Plugin i18n bundle exceeds the 100 KB size cap');
  }
  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Plugin i18n bundle is not valid JSON');
  }
  const parsed = pluginBundleSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Plugin i18n bundle failed validation: ${parsed.error.message}`);
  }
  return parsed.data;
}
