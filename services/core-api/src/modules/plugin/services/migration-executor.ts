// services/migration-executor.ts
// Executes plugin declared-table migrations inside a tenant transaction.
// Extracted from install.routes.ts to keep that file under the 200-line
// constitutional limit. Handles path-traversal sanitization, SQL validation,
// multi-statement splitting (Prisma $executeRawUnsafe runs only the first
// statement), SET ROLE scoping, and action-registry seeding.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { validateMigrationSql, splitSqlStatements } from '../schema/migrations.js';
import { PluginInstallError, PluginValidationError } from '../errors.js';

import type { PluginRole } from './db-role.service.js';
import type { Manifest } from '../schema/manifest.js';

interface RunMigrationsParams {
  // Tenant-schema Prisma transaction client — type-erased pending prisma generate
  // for the tenant schema. Methods used: $executeRawUnsafe, actionRegistry.create,
  // pluginMigrationStatus.create.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any;
  manifest: Manifest;
  role: PluginRole;
  installId: string;
  pluginId: string;
}

/**
 * Runs all declared-table migrations + seeds the action registry inside the
 * caller's transaction. Throws PluginInstallError / PluginValidationError on
 * failure — the caller is responsible for marking the install record `failed`.
 */
export async function runPluginMigrations(params: RunMigrationsParams): Promise<void> {
  const { tx, manifest, role, installId, pluginId } = params;

  for (const table of manifest.declaredTables) {
    let sql: string;
    if (table.content) {
      sql = table.content;
    } else {
      // Sanitize migrationFile — reject absolute paths, "..", null bytes.
      const rawFile = table.migrationFile;
      if (rawFile.includes('\0') || path.isAbsolute(rawFile) || rawFile.split('/').includes('..')) {
        throw new PluginInstallError(
          `Migration file "${rawFile}" contains invalid path components — no absolute paths or ".." allowed`,
        );
      }
      const pluginBase = path.resolve(process.cwd(), 'plugins', manifest.slug);
      const migrationPath = path.resolve(pluginBase, rawFile);
      if (!migrationPath.startsWith(pluginBase + path.sep)) {
        throw new PluginInstallError(`Migration file path escapes plugin directory: "${rawFile}"`);
      }
      try {
        sql = await readFile(migrationPath, 'utf-8');
      } catch {
        throw new PluginInstallError(
          `Migration file "${rawFile}" not found for plugin "${manifest.slug}" — provide inline content in manifest.declaredTables[].content`,
        );
      }
    }

    const validation = validateMigrationSql(sql, manifest.slug);
    if (!validation.valid) {
      throw new PluginValidationError(
        `Migration "${table.migrationFile}" failed validation: ${validation.errors.join('; ')}`,
      );
    }

    // Execute each statement individually — $executeRawUnsafe runs only the
    // first statement of a multi-statement string (HIGH finding: indexes were
    // silently dropped, including the workspace-isolation index).
    const statements = splitSqlStatements(sql);
    try {
      await tx.$executeRawUnsafe(`SET ROLE ${role.roleName}`);
      try {
        for (const stmt of statements) {
          await tx.$executeRawUnsafe(`${stmt};`);
        }
      } finally {
        await tx.$executeRawUnsafe('RESET ROLE');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new PluginInstallError(`Failed to execute migration "${table.migrationFile}": ${msg}`);
    }

    await tx.pluginMigrationStatus.create({
      data: { installId, migrationName: table.name, status: 'applied', appliedAt: new Date() },
    });
  }

  for (const a of manifest.actions ?? []) {
    await tx.actionRegistry.create({
      data: { pluginId, actionKey: a.action, labelI18nKey: a.action.replace(/:/g, '.'), defaultRole: a.defaultRole },
    });
  }
}
