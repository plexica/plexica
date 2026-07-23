import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CRM_E2E_INSTALL_ID } from './crm-database-config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CONTEXT = resolve(ROOT, 'e2e/fixtures/plugin-proxy');
const IMAGE = 'plexica-e2e-plugin-proxy:node24';
const CONTAINER = `plexica-plugin-${CRM_E2E_INSTALL_ID}`;
export const PLUGIN_TARGET_FIXTURE_URL = 'http://127.0.0.1:4100';

function docker(args: string[], allowFailure = false): void {
  const result = spawnSync('docker', args, { cwd: ROOT, encoding: 'utf8' });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`Plugin runtime fixture failed: ${result.stderr.trim()}`);
  }
}

async function waitUntilReady(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`${PLUGIN_TARGET_FIXTURE_URL}/_fixture/count`);
      if (response.ok) return;
    } catch {
      // Container startup is asynchronous.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error('Plugin runtime fixture did not become ready');
}

export async function startPluginRuntimeFixture(): Promise<void> {
  docker(['rm', '-f', CONTAINER], true);
  docker(['build', '--tag', IMAGE, CONTEXT]);
  docker([
    'run', '--detach', '--name', CONTAINER,
    '--add-host', 'host.docker.internal:host-gateway',
    '--publish', '127.0.0.1:4100:3000', IMAGE,
  ]);
  await waitUntilReady();
}

export function stopPluginRuntimeFixture(): void {
  docker(['rm', '-f', CONTAINER], true);
}
