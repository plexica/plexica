// apps/web/src/components/workspace/workspace-settings.schema.ts
//
// Client-side Zod schema for workspace settings.
// Field names MUST match the backend WorkspaceSettingsSchema exactly
// (apps/core-api/src/modules/workspace/schemas/workspace-settings.schema.ts).
// Kept in a separate file so WorkspaceSettingsForm.tsx can satisfy the
// react-refresh/only-export-components ESLint rule (components-only file).

import { z } from 'zod';

export const WorkspaceSettingsSchema = z.object({
  // Canonical name from backend — role assigned to newly added members
  defaultMemberRole: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
  allowCrossWorkspaceSharing: z.boolean().default(false),
  maxMembers: z.number().int().min(0).max(10000).default(0),
  // Canonical name from backend — discoverable within the tenant
  isPublic: z.boolean().default(false),
  notificationsEnabled: z.boolean().default(true),
});

export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>;
