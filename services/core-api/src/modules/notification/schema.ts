// schema.ts
// Zod validation for notification module request inputs (Security §4).
// Shared RESPONSE schemas come from @plexica/api-types (ADR-029); this file
// validates external request bodies/params/query.

import { z } from 'zod';

import { RESOURCE_SLUG_REGEX } from '../../lib/slug.js';

const pageSchema = z.coerce.number().int().min(1).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(20);

// GET /api/v1/notifications — pagination + unread filter (feature 006-02).
export const notificationListQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  filter: z.enum(['unread', 'all']).default('all'),
});

// PATCH /api/v1/notifications/:id/read — UUID param (feature 006-02).
export const notificationReadParamsSchema = z.object({
  id: z.string().uuid(),
});

const channelSchema = z.object({ inApp: z.boolean(), email: z.boolean() }).strict();

// PATCH /api/v1/notifications/preferences — partial nested update (006-04).
// Type keys are bounded by notifications.type VARCHAR(63) (ADR-035).
export const prefsPatchSchema = z.object({
  defaults: channelSchema.optional(),
  types: z.record(z.string().min(1).max(63), channelSchema).optional(),
});

const pluginTypeSchema = z
  .string()
  .min(1)
  // DB bound: notifications.type VARCHAR(63) — a longer value would error at
  // insert (consumer DLQ) instead of a clean 400 here.
  .max(63)
  .refine((value) => value.startsWith('plugin.'), 'Type must start with "plugin."')
  .refine((value) => {
    const parts = value.split('.');
    const slug = parts[1];
    return parts.length >= 3 && typeof slug === 'string' && RESOURCE_SLUG_REGEX.test(slug);
  }, 'Type must be "plugin.{slug}.{type}" with a valid slug');

// POST /api/v1/notifications/emit (feature 006-05). The SDK pre-prefixes `type`
// and adds `timestamp` + `correlationId` (plan §5.1) — the route does not.
export const emitBodySchema = z.object({
  userId: z.string().uuid(),
  type: pluginTypeSchema,
  titleKey: z.string().min(1).max(255),
  titleParams: z.record(z.string(), z.string()).optional(),
  bodyKey: z.string().min(1).max(255).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string().datetime({ offset: true }),
  correlationId: z.string().uuid(),
});

// i18n keys stored in notifications.title/body (Security §6 — keys, not PII).
export const translationKeySchema = z.string().min(1).max(255);

// GET /api/v1/notifications/types — type registry for the prefs UI (006-04/05).
// Keys are bounded by notifications.type VARCHAR(63) (ADR-035).
export const notificationTypesResponseSchema = z.object({
  types: z.array(
    z
      .object({
        key: z.string().min(1).max(63),
        labelKey: z.string().min(1).max(255),
        channels: z.array(z.enum(['inApp', 'email'])),
      })
      .strict()
  ),
});
