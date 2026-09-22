// schema.ts
// Zod validation schemas for tenant-settings API endpoints.
// Implements: Spec 003, Phase 9

import { z } from 'zod';

export const updateSettingsSchema = z.object({
  displayName: z.string().min(1).max(255),
});

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

export const updateBrandingSchema = z.object({
  primaryColor: z.string().regex(HEX_COLOR_REGEX).optional(),
  darkMode: z.boolean().optional(),
});

export const updateAuthConfigSchema = z.object({
  loginTheme: z.string().min(1).optional(),
  ssoSessionMaxLifespan: z.number().int().min(300).max(86400).optional(),
  bruteForceProtected: z.boolean().optional(),
  failureFactor: z.number().int().min(1).max(100).optional(),
});

// ---------------------------------------------------------------------------
// Translation overrides (006-10)
// ---------------------------------------------------------------------------

// Full i18n keys are dotted lowercase identifiers (`common.save`,
// `notifications.bell.title`, plugin bundle keys). No braces, no slashes.
const TRANSLATION_KEY_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,254}$/;

export const translationKeyParamSchema = z.object({
  key: z.string().regex(TRANSLATION_KEY_REGEX, 'Invalid translation key'),
});

export const putTranslationSchema = z.object({
  locale: z.enum(['en', 'it']),
  // Empty value = delete row (revert to default). Non-empty capped at the
  // column width (VARCHAR(1024)).
  value: z.string().max(1024),
});
