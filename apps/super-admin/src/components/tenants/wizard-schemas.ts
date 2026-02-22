// apps/super-admin/src/components/tenants/wizard-schemas.ts
// T001-22: Per-step Zod validation schemas for CreateTenantWizard (ADR-016).

import { z } from 'zod';

// ─── Step 1: Basics ───────────────────────────────────────────────────────────

export const basicsSchema = z.object({
  name: z
    .string()
    .min(1, 'Tenant name is required')
    .min(3, 'Tenant name must be at least 3 characters')
    .max(255, 'Tenant name must not exceed 255 characters')
    .trim(),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .regex(
      /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/,
      'Slug must be 3–64 chars, start with a letter, and contain only lowercase letters, numbers, and hyphens'
    ),
  adminEmail: z.string().min(1, 'Admin email is required').email('Valid email address required'),
});

export type BasicsFormData = z.infer<typeof basicsSchema>;

// ─── Step 2: Plugins ──────────────────────────────────────────────────────────
// Always valid — plugin selection is optional.

export const pluginsSchema = z.object({
  pluginIds: z.array(z.string().uuid()).default([]),
});

export type PluginsFormData = z.infer<typeof pluginsSchema>;

// ─── Step 3: Theme ────────────────────────────────────────────────────────────
// All fields optional.

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color (e.g. #aabbcc)')
  .optional()
  .or(z.literal(''));

export const themeSchema = z.object({
  logoUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  faviconUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  primaryColor: hexColor,
  secondaryColor: hexColor,
  accentColor: hexColor,
  fontFamily: z
    .string()
    .max(100, 'Font family must not exceed 100 characters')
    .optional()
    .or(z.literal('')),
  customCss: z.string().max(10240, 'Custom CSS must not exceed 10 KB').optional().or(z.literal('')),
});

export type ThemeFormData = z.infer<typeof themeSchema>;
