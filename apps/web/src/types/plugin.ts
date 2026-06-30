// plugin.ts — TypeScript types for plugin system domain (Spec 004).

export interface PluginManifest {
  slug: string;
  name: string;
  version: string;
  description: string;
  author: string;
  icon: string;
  categories: string[];
  hosting: {
    type: 'sidecar' | 'kubernetes';
    image: string;
    port: number;
    resources: { cpu: string; memory: string };
    env: { key: string; valueFrom: string }[];
  };
  ui: {
    remoteEntry: string;
    extensionPoints: string[];
  };
  events: {
    subscribes: string[];
  };
  actions: PluginAction[];
  declaredTables: PluginTable[];
}

export interface PluginAction {
  key: string;
  label: string;
  defaultRole: string;
}

export interface PluginTable {
  name: string;
  description: string;
  migrationFile: string;
}

export interface PluginCatalogEntry {
  id: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  author: string;
  iconUrl: string | null;
  categories: string[];
  status: 'draft' | 'published' | 'unpublished';
  installCount: number;
  isInstalled: boolean;
  rating?: number;
  actions?: PluginAction[];
  declaredTables?: PluginTable[];
  declaredEvents?: string[];
}

export interface PluginInstallation {
  id: string;
  pluginId: string;
  slug: string;
  name: string;
  version: string;
  status: PluginInstallStatus;
  hostingType: 'sidecar' | 'kubernetes';
  tenantDefaultVisibility: 'enabled' | 'disabled';
  installedBy: string;
  installedAt: string;
  healthStatus: 'healthy' | 'degraded' | 'unreachable';
}

export type PluginInstallStatus =
  | 'installing'
  | 'active'
  | 'deactivated'
  | 'uninstalled'
  | 'failed';

export interface PluginVisibilityEntry {
  workspaceId: string;
  workspaceName: string;
  isEnabled: boolean;
  isOverride: boolean;
  updatedAt: string | null;
}

export interface PluginVisibilityUpdate {
  workspaceId: string;
  isEnabled: boolean;
}

export interface DeadLetterEntry {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  pluginId: string | null;
  pluginName: string;
  errorMessage: string | null;
  retryCount: number;
  failedAt: string;
  status: 'pending' | 'retried' | 'dismissed';
}

export interface MarketplaceListResponse {
  data: PluginCatalogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PluginRegisterPayload {
  slug: string;
  manifest: PluginManifest;
  registryUrl: string;
  imageName: string;
  imageTag: string;
  imageDigest?: string;
  pullPolicy?: string;
}

export interface PluginRegisterResponse {
  id: string;
  slug: string;
  status: string;
  createdAt: string;
}

export interface DlqListResponse {
  data: DeadLetterEntry[];
  total: number;
  page: number;
  totalPages: number;
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
