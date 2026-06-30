import pg from 'pg';

// Tables are created by the platform during install via declaredTables migrations
// (see services/core-api/src/modules/plugin/routes/lifecycle/install.routes.ts).
// The plugin backend must NEVER run DDL itself — it only holds runtime DML
// privileges (SELECT/INSERT/UPDATE/DELETE) on its declared tables, granted to
// the restricted `plugin_{installId}` role.

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) {
  // Fail fast with a clear message rather than silently falling back to a
  // hardcoded admin credential. The platform injects DATABASE_URL pointing at
  // the restricted role created during install.
  throw new Error(
    'DATABASE_URL is required by the CRM plugin backend. ' +
      'It must be injected by the platform (restricted plugin role connection string).',
  );
}

const pool = new pg.Pool({ connectionString });

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
