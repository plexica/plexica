// apps/super-admin/src/types/index.ts

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'provisioning' | 'suspended';
  createdAt: string;
  updatedAt: string;
  suspendedAt?: string;
}

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  category: string;
  status: 'published' | 'draft' | 'deprecated';
  icon?: string;
  homepage?: string;
  entryPoint?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantPlugin {
  id: string;
  pluginId: string;
  tenantId: string;
  status: 'active' | 'inactive';
  configuration: Record<string, any>;
  installedAt: string;
  plugin: Plugin;
}

export interface User {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsOverview {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  totalUsers: number;
  totalPlugins: number;
  apiCalls24h: number;
}
