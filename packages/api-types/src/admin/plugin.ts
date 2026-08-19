// admin/plugin.ts
// Super-admin plugin catalog response types (S5-800).
// These mirror the PluginRecord + review augmentation from the backend.

export type PluginStatus = 'draft' | 'published' | 'unpublished' | 'deprecated';
export type ReviewStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface Plugin {
  id: string;
  slug: string;
  name: string;
  version: string;
  description: string;
  status: PluginStatus;
  reviewStatus: ReviewStatus;
  author: string;
  installedCount: number;
  createdAt: string;
  updatedAt: string;
}

// Review decision response (S5-802).
export interface ReviewResponse {
  id: string;
  slug: string;
  reviewStatus: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
}
