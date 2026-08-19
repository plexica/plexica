// plugin.ts — Re-export from @plexica/api-types (ADR-029).
// Plugin marketplace and installation types (tenant-side only).
// Super-admin types (DLQ, registry) are in @plexica/api-types/admin.
// App-specific payload/response types stay here.

export type {
  PluginManifest,
  PluginAction,
  PluginTable,
  PluginCatalogEntry,
  PluginInstallation,
  WorkspacePluginEntry,
  PluginInstallStatus,
  PluginVisibilityEntry,
} from '@plexica/api-types';

import type { PaginatedResult } from '@plexica/api-types';

export type MarketplaceListResponse = PaginatedResult<import('@plexica/api-types').PluginCatalogEntry>;

export interface PluginVisibilityUpdate {
  workspaceId: string;
  isEnabled: boolean;
}

export interface InstallProgress {
  installId: string;
  status: 'installing' | 'active' | 'failed';
  steps: InstallStep[];
}

export interface InstallStep {
  name: string;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
}
