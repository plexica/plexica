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
