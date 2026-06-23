// 003-built-in-templates.ts
// Seeds 3 built-in workspace templates for a newly provisioned tenant.
// Called by provisionTenant() after the tenant schema migrations run.
// Idempotent: skips seeding if built-in templates already exist.

// TODO: Run 'pnpm db:generate' to generate tenant client types before this compiles.
 
// @ts-ignore — generated/tenant-client does not exist until after 'pnpm db:generate'
import type { PrismaClient } from '../../../generated/tenant-client/index.js';

export interface ChildWorkspaceDef {
  name: string;
  description: string;
  defaultRoles: { creator: string };
}

export interface BuiltInTemplate {
  name: string;
  description: string;
  structure: ChildWorkspaceDef[];
}

const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    name: 'Team',
    description: 'A workspace for a functional team (e.g. Engineering, Marketing).',
    structure: [
      { name: 'Projects', description: 'Active team projects', defaultRoles: { creator: 'admin' } },
      {
        name: 'Resources',
        description: 'Shared resources and documentation',
        defaultRoles: { creator: 'member' },
      },
    ],
  },
  {
    name: 'Department',
    description: 'A workspace for an organizational department.',
    structure: [
      { name: 'Teams', description: 'Department sub-teams', defaultRoles: { creator: 'admin' } },
      {
        name: 'Initiatives',
        description: 'Department-wide initiatives',
        defaultRoles: { creator: 'admin' },
      },
    ],
  },
  {
    name: 'Project',
    description: 'A workspace for a specific project.',
    structure: [
      {
        name: 'Planning',
        description: 'Project planning and requirements',
        defaultRoles: { creator: 'admin' },
      },
      {
        name: 'Execution',
        description: 'Active work and delivery',
        defaultRoles: { creator: 'member' },
      },
      {
        name: 'Retrospectives',
        description: 'Post-mortems and learnings',
        defaultRoles: { creator: 'member' },
      },
    ],
  },
];

/**
 * Seeds the 3 built-in workspace templates into the tenant schema.
 * Idempotent — exits early if any built-in templates already exist.
 *
 * @param tenantDb - PrismaClient connected to the tenant schema (not core).
 */
export async function seedBuiltInTemplates(tenantDb: PrismaClient): Promise<void> {
  const existing = await tenantDb.workspaceTemplate.count({
    where: { isBuiltin: true },
  });
  if (existing > 0) return;

  await tenantDb.workspaceTemplate.createMany({
    data: BUILT_IN_TEMPLATES.map((t) => ({
      name: t.name,
      description: t.description,
      structure: t.structure,
      isBuiltin: true,
      createdBy: null,
    })),
  });
}
