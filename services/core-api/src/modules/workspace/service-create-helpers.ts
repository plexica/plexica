// service-create-helpers.ts
// Slug resolution, hierarchy depth guard and template seeding helpers used by
// the workspace creation flow. Extracted from service.ts to satisfy the
// 200-line-per-file rule (Constitution Rule 4).

import { generateSlug } from '../../lib/slug.js';

import { createWorkspace, slugExists } from './repository.js';
import { findTemplateById } from './repository-templates.js';

/** Maximum workspace hierarchy depth (materialized path segments). */
export const MAX_DEPTH = 10;

/** Number of segments in a materialized path (`/a/b/c` -> 3). */
export function pathDepth(p: string): number {
  return p.split('/').filter(Boolean).length;
}

/**
 * Generates a slug for `baseName`, appending an incrementing numeric suffix
 * until it is unique inside the tenant schema.
 */
export async function resolveSlug(tenantDb: unknown, baseName: string): Promise<string> {
  let slug = generateSlug(baseName);
  let suffix = 2;
  while (await slugExists(tenantDb, slug)) {
    slug = `${generateSlug(baseName)}-${suffix}`;
    suffix++;
  }
  return slug;
}

/**
 * Creates the child workspaces declared by a template under `parentId`.
 * A missing template is a no-op — the parent workspace is still valid.
 */
export async function seedTemplateChildren(
  tenantDb: unknown,
  templateId: string,
  parentId: string,
  parentPath: string,
  userId: string
): Promise<void> {
  const template = await findTemplateById(tenantDb, templateId);
  if (template === null) return;
  const structure = Array.isArray(template.structure) ? template.structure : [];
  for (const child of structure as Array<{ name: string; description?: string }>) {
    const childSlug = await resolveSlug(tenantDb, child.name);
    await createWorkspace(tenantDb, {
      name: child.name,
      slug: childSlug,
      description: child.description ?? null,
      parentId,
      materializedPath: `${parentPath}/${childSlug}`,
      createdBy: userId,
    });
  }
}
