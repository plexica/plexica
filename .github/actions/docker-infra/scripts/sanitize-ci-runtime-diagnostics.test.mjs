import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = mkdtempSync(path.join(tmpdir(), 'plexica-diagnostics-'));
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const container = path.join(dir, 'container.env');
const host = path.join(dir, 'host.env');
const diagnostics = path.join(dir, 'diagnostics');
const secrets = [
  'EVENT_KEY_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'PLUGIN_DB_ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'PLUGIN_CREDENTIAL_PEPPER=0123456789abcdef0123456789abcdef',
  'KEYCLOAK_ADMIN_USER=ci-admin-user-0001',
  'MINIO_ACCESS_KEY=Min0AccessKeyValue-0001',
];
try {
  writeFileSync(container, `${secrets.join('\n')}\n`);
  writeFileSync(host, 'POSTGRES_HOST_URL=postgresql://user:runner-secret@127.0.0.1:32000/plexica\nMAILPIT_UI_BASE=http://127.0.0.1:32001\n');
  const input = `${secrets.join('\n')}\n`;
  const sanitized = spawnSync(
    process.execPath,
    [path.join(scriptDir, 'sanitize-ci-runtime-diagnostics.mjs'), container, host],
    { input, encoding: 'utf8' }
  );
  if (
    sanitized.status !== 0 ||
    sanitized.stdout.includes('AAAAAAAA') ||
    sanitized.stdout.includes('aaaaaaaa') ||
    sanitized.stdout.includes('runner-secret') ||
    sanitized.stdout.includes('ci-admin-user') ||
    sanitized.stdout.includes('Min0AccessKeyValue')
  ) {
    throw new Error('Container-only secrets were not redacted');
  }
  const inline = 'KEYCLOAK_ADMIN_USER=ci-admin-0123456789abcdef';
  const inlineAccessKey = 'MINIO_ACCESS_KEY=AKIA-inline-access-key';
  for (const [label, inlineLine, redacted] of [
    ['Inline KEYCLOAK_ADMIN_USER assignment was not redacted', inline, 'KEYCLOAK_ADMIN_USER=[REDACTED]'],
    ['Inline MINIO_ACCESS_KEY assignment was not redacted', inlineAccessKey, 'MINIO_ACCESS_KEY=[REDACTED]'],
  ]) {
    const inlineCheck = spawnSync(
      process.execPath,
      [path.join(scriptDir, 'sanitize-ci-runtime-diagnostics.mjs'), container, host],
      { input: `${inlineLine}\n`, encoding: 'utf8' }
    );
    if (
      inlineCheck.status !== 0 ||
      inlineCheck.stdout.includes(inlineLine.split('=')[1]) ||
      !inlineCheck.stdout.includes(redacted)
    ) {
      throw new Error(label);
    }
  }
  mkdirSync(diagnostics);
  writeFileSync(path.join(diagnostics, 'logs.txt'), sanitized.stdout);
  const scan = spawnSync(process.execPath, [
    path.join(scriptDir, 'scan-ci-runtime-diagnostics.mjs'),
    diagnostics,
    container,
    host,
  ]);
  if (
    scan.status !== 0 ||
    readFileSync(path.join(diagnostics, 'logs.txt'), 'utf8').includes('0123456789')
  ) {
    throw new Error('Diagnostic scan accepted a secret artifact');
  }
  // Scanner registry must cover every sanitizer key: a leaked access-key or
  // user value originating from the env manifests must fail the scan.
  for (const leak of ['Min0AccessKeyValue-0001', 'ci-admin-user-0001']) {
    writeFileSync(path.join(diagnostics, 'leak.txt'), `value=${leak}\n`);
    const leakScan = spawnSync(process.execPath, [
      path.join(scriptDir, 'scan-ci-runtime-diagnostics.mjs'),
      diagnostics,
      container,
      host,
    ]);
    if (leakScan.status === 0) throw new Error(`Diagnostic scan missed ${leak}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
