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
  // Optional email (006-11): synced to Keycloak FIRST, local write only after
  // upstream success. Zod checks format here; Keycloak enforces uniqueness.
  email: z.string().email().max(255).optional(),
  // notificationPrefs intentionally NOT writable here: the notification module
  // owns the notification_prefs column (D-6 nested shape). The canonical write
  // path is PATCH /api/v1/notifications/preferences (feature 006-04); the
  // profile module reads only. Unknown keys are stripped by Zod, so legacy
  // clients sending the category shape are ignored instead of rejected.
});

export const sessionIdParamsSchema = z.object({
  sessionId: z.string().min(1).max(255),
});
