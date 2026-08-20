// schemas/plugin-catalog-schemas.ts
// Zod schemas for the super-admin plugin review endpoint (S5-800 / Feature 005-08).
//
// The review queue is independent of the publish status (ADR-022 Decision 5).
// Workflow: draft -> pending -> approved/rejected -> published.
// This schema only validates the review decision payload — publish/unpublish
// stay in modules/plugin/routes/admin-publish.routes.ts.

import { z } from 'zod';

import { RESOURCE_SLUG_REGEX } from '../../../lib/slug.js';

// Path params for POST /plugins/:slug/review.
export const ReviewParamsSchema = z.object({
  slug: z.string().regex(RESOURCE_SLUG_REGEX),
});

// Reviewer decision. 'approve' flips review_status -> 'approved',
// 'reject' flips it -> 'rejected'. Both record reviewedAt + reviewedBy.
export const ReviewDecisionSchema = z.enum(['approve', 'reject']);

// Body of POST /plugins/:slug/review.
// notes is optional free-text justification (no PII — Security §6).
export const ReviewBodySchema = z.object({
  decision: ReviewDecisionSchema,
  notes: z.string().trim().max(2000).optional(),
});

// Response shape for a successful review. Mirrors the Plugin columns that
// change on review (reviewStatus, reviewedAt, reviewedBy) plus identity.
export const ReviewResponseSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  reviewStatus: z.string(),
  reviewedAt: z.coerce.date().nullable(),
  reviewedBy: z.string().nullable(),
});
