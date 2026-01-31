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
  longDescription?: string;
  author: string;
  authorEmail?: string;
  category: string;
  status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'REJECTED' | 'DEPRECATED';
  icon?: string;
  homepage?: string;
  repository?: string;
  entryPoint?: string;
  tags?: string[];
  screenshots?: string[];
  demoUrl?: string;
  averageRating?: number;
  ratingCount?: number;
  downloadCount?: number;
  installCount?: number;
  publishedAt?: string;
  submittedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
  manifest?: Record<string, unknown>;
  versions?: PluginVersion[];
}

export interface PluginVersion {
  id: string;
  pluginId: string;
  version: string;
  changelog: string;
  manifest: Record<string, unknown>;
  publishedAt: string;
  downloadCount: number;
  isLatest: boolean;
  assetUrl?: string;
}

export interface PluginRating {
  id: string;
  pluginId: string;
  tenantId: string;
  userId: string;
  rating: number;
  review?: string;
  helpful: number;
  notHelpful: number;
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
