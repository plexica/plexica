import { prisma } from '../../services/core-api/src/lib/database.js';

import {
  CRM_E2E_INSTALL_ID,
  CRM_E2E_ROLE,
  CRM_E2E_SCHEMA,
  crmE2ePassword,
} from './crm-database-config.js';

const DATABASE_URL = process.env['DATABASE_URL'] ??
  'postgresql://plexica:changeme@localhost:5432/plexica';
const ACTOR_ID = '00000000-0000-0000-0000-000000000000';

function ident(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export async function provisionCrmDatabaseFixture(): Promise<void> {
  const plugin = await prisma.plugin.findUnique({ where: { slug: 'crm' }, select: { id: true } });
  if (!plugin) throw new Error('CRM catalog fixture must exist before database provisioning');

  const schema = ident(CRM_E2E_SCHEMA);
  const role = ident(CRM_E2E_ROLE);
  const password = crmE2ePassword(DATABASE_URL).replace(/'/g, "''");
  const statements = [
    `CREATE TABLE IF NOT EXISTS ${schema}.crm_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
      name TEXT NOT NULL, email TEXT, phone TEXT, company TEXT, notes TEXT,
      created_by UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS ${schema}.crm_deals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
      contact_id UUID REFERENCES ${schema}.crm_contacts(id) ON DELETE SET NULL,
      title VARCHAR(255) NOT NULL, value DECIMAL(12,2) DEFAULT 0,
      stage VARCHAR(64) NOT NULL DEFAULT 'new', created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS ${schema}.other_plugin_secrets (id UUID PRIMARY KEY, secret TEXT)`,
    `TRUNCATE TABLE ${schema}.crm_deals, ${schema}.crm_contacts`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_deals_default_pipeline
       ON ${schema}.crm_deals (workspace_id)
       WHERE title = 'Default Pipeline' AND contact_id IS NULL`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${CRM_E2E_ROLE}')
      THEN CREATE ROLE ${role} LOGIN; END IF; END $$`,
    `ALTER ROLE ${role} WITH LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`,
    `ALTER ROLE ${role} SET search_path TO ${schema}`,
    `REVOKE ALL ON ALL TABLES IN SCHEMA ${schema} FROM ${role}`,
    `REVOKE ALL ON SCHEMA core FROM ${role}`,
    `GRANT USAGE ON SCHEMA ${schema} TO ${role}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ${schema}.crm_contacts, ${schema}.crm_deals TO ${role}`,
    `DELETE FROM ${schema}.plugin_installations WHERE plugin_id = '${plugin.id}'`,
    `INSERT INTO ${schema}.plugin_installations
      (id, plugin_id, tenant_slug, version, status, hosting_type, tenant_default_visibility,
       installed_by, installed_at, updated_at)
      VALUES ('${CRM_E2E_INSTALL_ID}', '${plugin.id}', 'e2e', '1.0.0', 'active', 'sidecar',
       'enabled', '${ACTOR_ID}', NOW(), NOW())`,
  ];
  for (const statement of statements) await prisma.$executeRawUnsafe(statement);
}

export async function cleanupCrmDatabaseFixture(): Promise<void> {
  const schema = ident(CRM_E2E_SCHEMA);
  const role = ident(CRM_E2E_ROLE);
  await prisma.$queryRawUnsafe(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = '${CRM_E2E_ROLE}'`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM ${schema}.plugin_installations WHERE id = '${CRM_E2E_INSTALL_ID}'`,
  );
  const roles = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS "exists"`,
    CRM_E2E_ROLE,
  );
  if (roles[0]?.exists) {
    await prisma.$executeRawUnsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA ${schema} FROM ${role}`);
    await prisma.$executeRawUnsafe(`REVOKE ALL ON SCHEMA ${schema} FROM ${role}`);
    await prisma.$executeRawUnsafe(`DROP ROLE ${role}`);
  }
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${schema}.other_plugin_secrets`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${schema}.crm_deals, ${schema}.crm_contacts`);
}

export async function setWorkspaceMembershipFixture(
  workspaceId: string,
  userId: string,
  role: 'admin' | 'member' | 'viewer',
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO ${ident(CRM_E2E_SCHEMA)}.workspace_member (id, workspace_id, user_id, role, created_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, NOW())
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    workspaceId,
    userId,
    role,
  );
}

export async function setTenantStatusFixture(status: 'active' | 'suspended'): Promise<void> {
  await prisma.tenant.update({ where: { slug: 'e2e' }, data: { status } });
}
