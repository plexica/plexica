import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as url from 'node:url';

const currentDirectory = path.dirname(url.fileURLToPath(import.meta.url));
const CORE_API_DIR = path.resolve(currentDirectory, '../../../services/core-api');
const TSX_BIN = path.resolve(CORE_API_DIR, 'node_modules/.bin/tsx');

function runCoreApiCli(command: string, args: string[], extraEnv = {}): void {
  const result = spawnSync(TSX_BIN, [`src/cli/${command}.ts`, ...args], {
    cwd: CORE_API_DIR,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (result.error !== undefined) {
    throw new Error(`Failed to start ${command}: ${String(result.error)}`);
  }
  if (result.status === 0) return;
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  if (
    command === 'create-tenant' &&
    ['already exists', 'P2002', 'unique constraint'].some(
      (message) => stdout.includes(message) || stderr.includes(message)
    )
  ) {
    return;
  }
  throw new Error(
    `${command} failed with exit ${String(result.status)}\nstdout: ${stdout}\nstderr: ${stderr}`
  );
}

export function provisionAdminTestData(): void {
  const slug = process.env['PLAYWRIGHT_ADMIN_E2E_TENANT_SLUG'] ?? 'e2e-admin';
  runCoreApiCli('create-tenant', [
    '--slug',
    slug,
    '--name',
    process.env['PLAYWRIGHT_ADMIN_E2E_TENANT_NAME'] ?? 'E2E Admin',
    '--admin-email',
    process.env['PLAYWRIGHT_ADMIN_E2E_TENANT_EMAIL'] ?? 'admin@e2e-admin.local',
  ]);
  runCoreApiCli('seed-plugins', []);
}
