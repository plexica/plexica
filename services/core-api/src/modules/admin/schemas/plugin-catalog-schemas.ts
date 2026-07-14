// schemas/plugin-catalog-schemas.ts
// Zod schemas for the super-admin plugin review endpoint (S5-800 / Feature 005-08).
//
// The review queue is independent of the publish status (ADR-022 Decision 5).
// Workflow: draft -> pending -> approved/rejected -> published.
// This schema only validates the review decision payload — publish/unpublish
// stay in modules/plugin/routes/admin-publish.routes.ts.

import { z } from 'zod';

// SLUG_REGEX mirrors the plugin slug constraint (admin-publish.routes.ts).
const SLUG_REGEX = /^[a-z][a-z0-9-]{1,62}$/;

// Path params for POST /plugins/:slug/review.
export const ReviewParamsSchema = z.object({
  slug: z.string().regex(SLUG_REGEX),
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

export type ReviewParams = z.infer<typeof ReviewParamsSchema>;
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;
export type ReviewBody = z.infer<typeof ReviewBodySchema>;
export type ReviewResponse = z.infer<typeof ReviewResponseSchema>;
