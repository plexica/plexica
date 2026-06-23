// schema.ts
// Zod validation schemas for user-profile API inputs.

import { z } from 'zod';

// IANA timezone — pragmatic: non-empty string up to 63 chars.
// Full IANA list validation is impractical; DB/Intl.DateTimeFormat will reject invalid values.
const timezoneSchema = z.string().min(1).max(63);

// ISO 639-1 language code — exactly 2 lowercase alpha characters.
const languageSchema = z
  .string()
  .regex(/^[a-z]{2}$/, 'Language must be a 2-character ISO 639-1 code');

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).nullable().optional(),
  timezone: timezoneSchema.optional(),
  language: languageSchema.optional(),
  notificationPrefs: z
    .object({
      invite_received: z.object({ email: z.boolean() }).optional(),
      workspace_changes: z.object({ email: z.boolean() }).optional(),
      role_changes: z.object({ email: z.boolean() }).optional(),
    })
    .optional(),
});

export type UpdateProfileData = z.infer<typeof updateProfileSchema>;
