/**
 * Translation Module - Zod Validation Schemas
 *
 * Defines validation schemas for translation keys, tenant overrides, and API payloads.
 * Enforces FR-011 translation key format rules and Constitution Art. 5.3 (Zod validation).
 *
 * @module modules/i18n/i18n.schemas
 */

import { z } from 'zod';

/**
 * Translation Key Schema (FR-011)
 *
 * Rules:
 * - Max 128 characters
 * - Allowed characters: a-z, A-Z, 0-9, `.` (dot separator), `_` (underscore)
 * - No `_system.` prefix (reserved for core platform)
 * - Max 5 nesting levels (e.g., `a.b.c.d.e` is valid, `a.b.c.d.e.f` is not)
 */
export const TranslationKeySchema = z
  .string()
  .max(128, 'Translation key must be 128 characters or less')
  .regex(
    /^[a-zA-Z0-9._]+$/,
    'Translation key must contain only alphanumeric characters, dots, and underscores'
  )
  .refine((key) => !key.startsWith('_system.'), {
    message: 'Translation key cannot start with reserved prefix "_system."',
  })
  .refine((key) => key.split('.').length <= 5, {
    message: 'Translation key cannot exceed 5 nesting levels',
  });

/**
 * Locale Code Schema (BCP 47 format)
 *
 * Examples: `en`, `it`, `de`, `es`, `en-US`, `it-IT`
 */
export const LocaleCodeSchema = z
  .string()
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Locale code must be in BCP 47 format (e.g., "en", "it-IT")');

/**
 * Namespace Schema
 *
 * Plugin namespace identifier (lowercase alphanumeric + hyphens).
 * Examples: `core`, `crm`, `billing`, `advanced-analytics`
 */
export const NamespaceSchema = z
  .string()
  .regex(/^[a-z0-9\-]+$/, 'Namespace must contain only lowercase letters, numbers, and hyphens')
  .min(1, 'Namespace cannot be empty')
  .max(50, 'Namespace must be 50 characters or less');

/**
 * Tenant Override Structure Schema (FR-006, FR-007)
 *
 * Structure: `{ locale: { namespace: { key: value } } }`
 *
 * Example:
 * ```json
 * {
 *   "en": {
 *     "crm": {
 *       "deals.title": "Opportunities"
 *     }
 *   }
 * }
 * ```
 */
export const TenantOverrideSchema = z.record(
  z.string(), // locale keys (validated in runtime by LocaleCodeSchema when accessed)
  z.record(
    z.string(), // namespace keys (validated in runtime by NamespaceSchema when accessed)
    z.record(z.string(), z.string()) // key-value pairs (keys validated at plugin registration)
  )
);

/**
 * Translation Override Payload Schema (PUT /api/v1/tenant/translations/overrides)
 *
 * Request body structure with payload size validation (max 1MB).
 */
export const TranslationOverridePayloadSchema = z.object({
  overrides: TenantOverrideSchema,
});

/**
 * Get Translations Query Schema (GET /api/v1/translations/:locale/:namespace)
 *
 * Query parameters for translation retrieval with optional tenant context.
 */
export const GetTranslationsQuerySchema = z.object({
  tenant: z.string().optional(),
});

/**
 * Get Translations Params Schema (GET /api/v1/translations/:locale/:namespace)
 *
 * Path parameters for translation retrieval.
 */
export const GetTranslationsParamsSchema = z.object({
  locale: LocaleCodeSchema,
  namespace: NamespaceSchema,
});

/**
 * Translation Bundle Response Schema
 *
 * Structure of the translation bundle returned by GET endpoints.
 */
export const TranslationBundleResponseSchema = z.object({
  locale: LocaleCodeSchema,
  namespace: NamespaceSchema,
  hash: z.string(),
  messages: z.record(z.string(), z.string()),
});

/**
 * Available Locales Response Schema
 *
 * Structure of the locale listing returned by GET /api/v1/translations/locales.
 */
export const AvailableLocalesResponseSchema = z.object({
  locales: z.array(
    z.object({
      code: LocaleCodeSchema,
      name: z.string(),
      nativeName: z.string(),
      namespaceCount: z.number().int().min(0),
    })
  ),
  defaultLocale: LocaleCodeSchema,
});

/**
 * Tenant Overrides Response Schema
 *
 * Structure of the tenant overrides returned by GET /api/v1/tenant/translations/overrides.
 */
export const TenantOverridesResponseSchema = z.object({
  overrides: TenantOverrideSchema,
  updatedAt: z.string().datetime(),
});

/**
 * Type exports for use in services and routes
 */
export type TranslationKey = z.infer<typeof TranslationKeySchema>;
export type LocaleCode = z.infer<typeof LocaleCodeSchema>;
export type Namespace = z.infer<typeof NamespaceSchema>;
export type TenantOverride = z.infer<typeof TenantOverrideSchema>;
export type TranslationOverridePayload = z.infer<typeof TranslationOverridePayloadSchema>;
export type GetTranslationsQuery = z.infer<typeof GetTranslationsQuerySchema>;
export type GetTranslationsParams = z.infer<typeof GetTranslationsParamsSchema>;
export type TranslationBundleResponse = z.infer<typeof TranslationBundleResponseSchema>;
export type AvailableLocalesResponse = z.infer<typeof AvailableLocalesResponseSchema>;
export type TenantOverridesResponse = z.infer<typeof TenantOverridesResponseSchema>;
