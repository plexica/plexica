// apps/web/src/types/index.ts

export interface User {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'provisioning' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

export interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
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
