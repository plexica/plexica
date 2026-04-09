// tenant-provisioning-helpers.ts
// CLI-based tenant provisioning and migration helpers for E2E global-setup.
// Extracted from global-setup.ts to keep it under 200 lines.

import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// Absolute path to the core-api source root (monorepo layout)
export const CORE_API_DIR = path.resolve(__dirname, '../../../services/core-api');
// tsx binary lives in core-api's own node_modules (it's a devDependency there)
export const TSX_BIN = path.resolve(CORE_API_DIR, 'node_modules/.bin/tsx');

/**
 * Provisions a tenant via the core-api CLI (`create-tenant.ts`).
 * Idempotent: 409 / unique constraint violations are treated as success.
 */
export function provisionTenant(slug: string, name: string, adminEmail: string): void {
  process.stdout.write(`[global-setup] Provisioning tenant "${name}" (slug: ${slug})…\n`);

  const result = spawnSync(
    TSX_BIN,
    ['src/cli/create-tenant.ts', '--slug', slug, '--name', name, '--admin-email', adminEmail],
    {
      cwd: CORE_API_DIR,
      env: process.env,
      encoding: 'utf8',
      timeout: 60_000,
    }
  );

  if (result.error !== undefined) {
    throw new Error(`Failed to spawn tsx for tenant ${slug}: ${String(result.error)}`);
  }

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';

  if (result.status === 0) {
    process.stdout.write(`[global-setup] Tenant ${slug} provisioned successfully.\n`);
    return;
  }

  if (
    stderr.includes('already exists') ||
    stderr.includes('P2002') ||
    stderr.includes('unique constraint') ||
    stdout.includes('already exists') ||
    stdout.includes('P2002')
  ) {
    process.stdout.write(`[global-setup] Tenant ${slug} already exists — skipping.\n`);
    return;
  }

  process.stderr.write(`[global-setup] stdout: ${stdout}\n`);
  process.stderr.write(`[global-setup] stderr: ${stderr}\n`);
  throw new Error(`Tenant provisioning failed for ${slug} (exit ${String(result.status)})`);
}

/**
 * Applies tenant schema migrations via the core-api CLI (`migrate-tenants.ts`).
 * Idempotent: migration files use IF NOT EXISTS.
 */
export function migrateTenantSchemas(): void {
  process.stdout.write('[global-setup] Applying tenant schema migrations…\n');
  const result = spawnSync(TSX_BIN, ['src/cli/migrate-tenants.ts'], {
    cwd: CORE_API_DIR,
    env: process.env,
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (result.error !== undefined) {
    throw new Error(`Tenant migration failed to spawn: ${String(result.error)}`);
  }
  if (result.status !== 0) {
    process.stderr.write(`[global-setup] Migration stdout: ${result.stdout}\n`);
    process.stderr.write(`[global-setup] Migration stderr: ${result.stderr}\n`);
    throw new Error(`Tenant migration failed (exit ${String(result.status)})`);
  }
  process.stdout.write('[global-setup] Tenant schema migrations applied.\n');
}
