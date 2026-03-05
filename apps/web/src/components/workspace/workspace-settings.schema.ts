// apps/web/src/components/workspace/workspace-settings.schema.ts
//
// Client-side Zod schema for workspace settings (4 fields per design-spec §3.3).
// Kept in a separate file so WorkspaceSettingsForm.tsx can satisfy the
// react-refresh/only-export-components ESLint rule (components-only file).

import { z } from 'zod';

export const WorkspaceSettingsSchema = z.object({
  defaultTeamRole: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
  allowCrossWorkspaceSharing: z.boolean().default(false),
  maxMembers: z.number().int().min(0).max(10000).default(0),
  isDiscoverable: z.boolean().default(true),
});

export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>;
