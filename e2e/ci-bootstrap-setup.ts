// ci-bootstrap-setup.ts — CI runtime contract bootstrap entry.
//
// Invokes an app's CANONICAL Playwright globalSetup directly under the sourced
// host.env manifest values (the same logic the suite's own globalSetup would
// run), then prints the run-scoped credentials it published via process.env as
// KEY=value lines so the shell orchestrator can persist them into a
// per-project, per-app manifest for the subsequent headless Playwright runs.
//
// Usage: tsx e2e/ci-bootstrap-setup.ts <path-to-app-global-setup.ts>

import { pathToFileURL } from 'node:url';

import { ciRuntimeTenantBase } from '../apps/web/e2e/helpers/tenant-hosts.js';

import { ciRuntimeManifest, isCiRuntimeContract } from './ci-runtime-manifest.js';
import { setFromManifest } from './playwright-base.js';

const entry = process.argv[2];
if (entry === undefined || entry === '') {
  throw new Error('Usage: tsx e2e/ci-bootstrap-setup.ts <app-global-setup.ts>');
}

// Outside Playwright no app config evaluates, so the manifest -> env mapping
// each config performs before globalSetup must be replicated here: the
// canonical setups resolve tenant hosts through these exact variables
// (tenantWebUrl/endpoint() hard-require them under the contract).
if (isCiRuntimeContract()) {
  const manifest = ciRuntimeManifest();
  if (entry.includes('/apps/admin/')) {
    setFromManifest('PLAYWRIGHT_ADMIN_BASE_URL', manifest.ADMIN_E2E_PUBLIC_BASE);
    setFromManifest('PLAYWRIGHT_CORE_API_URL', manifest.CORE_API_PUBLIC_BASE);
  } else {
    setFromManifest('PLAYWRIGHT_TENANT_SLUG', 'e2e');
    setFromManifest(
      'PLAYWRIGHT_BASE_URL',
      ciRuntimeTenantBase(manifest.WEB_E2E_PUBLIC_BASE)
    );
    setFromManifest(
      'PLAYWRIGHT_API_URL',
      ciRuntimeTenantBase(manifest.CORE_API_PUBLIC_BASE)
    );
  }
}
if (process.env['PLAYWRIGHT_E2E'] !== 'true') {
  // The Keycloak provisioning helpers refuse to run without this guard;
  // set it here so the orchestrator does not have to know about it.
  process.env['PLAYWRIGHT_E2E'] = 'true';
}

const { default: setup } = (await import(pathToFileURL(entry).href)) as {
  default: () => Promise<void>;
};

// The setups log progress via process.stdout; stdout is this entry's
// credential contract with the shell orchestrator (one KEY=value line per
// run-scoped secret), so provisioning output is diverted to stderr while
// setup runs and restored for the credential block below.
const stdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = ((...args: Parameters<typeof process.stderr.write>) =>
  process.stderr.write(...args)) as typeof process.stdout.write;
await setup();
process.stdout.write = stdoutWrite;

const RUN_SCOPED_KEYS = [
  'PLAYWRIGHT_SUPER_ADMIN_USER',
  'PLAYWRIGHT_SUPER_ADMIN_PASS',
  'PLAYWRIGHT_SUPER_ADMIN_UUID',
  'PLAYWRIGHT_E2E_KEYCLOAK_CLIENT_ID',
  'PLAYWRIGHT_E2E_KEYCLOAK_CLIENT_SECRET',
  'PLAYWRIGHT_E2E_KEYCLOAK_CLIENT_UUID',
] as const;

for (const key of RUN_SCOPED_KEYS) {
  const value = process.env[key];
  if (value !== undefined && value !== '') process.stdout.write(`${key}=${value}\n`);
}
