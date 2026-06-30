import pg from 'pg';

const pool = new pg.Pool({
  connectionString:
    process.env['DATABASE_URL'] ??
    'postgresql://postgres:postgres@localhost:5432/postgres',
});

export async function query(
  sql: string,
  params?: unknown[],
): Promise<Record<string, unknown>[]> {
  const result = await pool.query(sql, params);
  return result.rows as Record<string, unknown>[];
}

export async function queryOne(
  sql: string,
  params?: unknown[],
): Promise<Record<string, unknown> | null> {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

async function initialize(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS crm_contacts (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL,
      name        VARCHAR(255) NOT NULL,
      email       VARCHAR(255),
      phone       VARCHAR(64),
      notes       TEXT,
      created_by  UUID,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_crm_contacts_workspace_id ON crm_contacts (workspace_id)`,
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_crm_contacts_name ON crm_contacts (name)`,
  );

  await query(`
    CREATE TABLE IF NOT EXISTS crm_deals (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL,
      contact_id   UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
      title        VARCHAR(255) NOT NULL,
      value        DECIMAL(12, 2) DEFAULT 0,
      stage        VARCHAR(64) NOT NULL DEFAULT 'new',
      created_by   UUID,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_crm_deals_workspace_id ON crm_deals (workspace_id)`,
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON crm_deals (stage)`,
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_crm_deals_contact_id ON crm_deals (contact_id)`,
  );
}

void initialize();
