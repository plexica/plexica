// hierarchy.ts
// Workspace hierarchy invariants shared by the creation flow (service.ts,
// service-create-helpers.ts) and the archive/restore/reparent flow
// (service-archive.ts). Extracted to remove the duplication left behind by
// the Rule 4 split of the original service.ts.

/** Maximum workspace hierarchy depth (materialized path segments). */
export const MAX_DEPTH = 10;

/** Number of segments in a materialized path (`/a/b/c` -> 3). */
export function pathDepth(p: string): number {
  return p.split('/').filter(Boolean).length;
}
