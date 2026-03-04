/**
 * migrate-team-members.ts — T008-03 (Spec 008 Admin Interfaces)
 *
 * Backfill script: adds `team_members` table to all existing tenant schemas.
 * For tenants provisioned BEFORE T008-03 was merged into schema-step.ts.
 *
 * Usage:
 *   npx ts-node scripts/migrate-team-members.ts             # execute
 *   npx ts-node scripts/migrate-team-members.ts --dry-run   # print SQL only
 */

import { PrismaClient } from '@plexica/database';

const TEAM_MEMBERS_DDL = (schema: string) => `
  CREATE TABLE IF NOT EXISTS "${schema}"."team_members" (
    team_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('MEMBER', 'ADMIN')),
    joined_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (team_id, user_id),
    FOREIGN KEY (team_id) REFERENCES "${schema}"."teams"(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES "${schema}"."users"(id) ON DELETE CASCADE
  )
`;

const TEAM_MEMBERS_IDX_USER = (schema: string) =>
  `CREATE INDEX IF NOT EXISTS "idx_team_members_user_id" ON "${schema}"."team_members"(user_id)`;

const TEAM_MEMBERS_IDX_TEAM = (schema: string) =>
  `CREATE INDEX IF NOT EXISTS "idx_team_members_team_id" ON "${schema}"."team_members"(team_id)`;

function validateSchemaName(slug: string): string {
  // Mirror the logic in SchemaStep.getSchemaName()
  return `tenant_${slug.replace(/-/g, '_')}`;
}

async function main(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run');
  const db = new PrismaClient();

  try {
    // Fetch all non-deleted tenants
    const tenants = await db.$queryRaw<Array<{ id: string; slug: string }>>`
      SELECT id, slug FROM "core"."tenants"
      WHERE status NOT IN ('DELETED', 'PENDING_DELETION')
      ORDER BY slug
    `;

    if (tenants.length === 0) {
      console.log('No tenants found — nothing to migrate.');
      return;
    }

    console.log(`Found ${tenants.length} tenant(s) to migrate${isDryRun ? ' (DRY RUN)' : ''}.`);
    console.log('');

    let successCount = 0;
    let failureCount = 0;

    for (const tenant of tenants) {
      const schemaName = validateSchemaName(tenant.slug);
      const sqls = [
        TEAM_MEMBERS_DDL(schemaName),
        TEAM_MEMBERS_IDX_USER(schemaName),
        TEAM_MEMBERS_IDX_TEAM(schemaName),
      ];

      if (isDryRun) {
        console.log(`-- Tenant: ${tenant.slug} (id=${tenant.id}, schema=${schemaName})`);
        for (const sql of sqls) {
          console.log(sql.trim());
          console.log('');
        }
        successCount++;
        continue;
      }

      try {
        // Each tenant is wrapped in its own transaction for atomicity
        await db.$transaction(async (tx) => {
          for (const sql of sqls) {
            await tx.$executeRawUnsafe(sql);
          }
        });
        console.log(`✅  ${tenant.slug} (${schemaName}) — migrated`);
        successCount++;
      } catch (err) {
        console.error(`❌  ${tenant.slug} (${schemaName}) — FAILED: ${(err as Error).message}`);
        failureCount++;
      }
    }

    console.log('');
    console.log(
      `Migration complete: ${successCount} succeeded, ${failureCount} failed${isDryRun ? ' (dry run)' : ''}.`
    );

    if (failureCount > 0) {
      process.exitCode = 1;
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
