export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  version: number;
  createdAt: string;
}

export interface TenantListResponse {
  data: TenantRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TenantDetailResponse {
  tenant: TenantRow & {
    updatedAt: string;
    minioBucket: string | null;
  };
  userCount: number;
  workspaceCount: number;
  pluginInstallations: unknown[];
  recentAudit: unknown[];
}

export interface ProvisionResult {
  tenantId: string;
  slug: string;
  schemaName: string;
  realmName: string;
  minioBucket: string;
  tempPassword: string;
}

export interface DeletionStatusResponse {
  steps: Array<{
    id: string;
    step: string;
    status: string;
    attempts: number;
    lastError: string | null;
    updatedAt: string;
  }>;
}

export interface PluginListResponse {
  data: Array<{
    id: string;
    slug: string;
    name: string;
    version: string;
    status: string;
    reviewStatus: string;
    installedCount: number;
  }>;
  total: number;
  page: number;
  pageSize: number;
}
