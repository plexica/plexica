import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

// Split from ci-workflow-contract.test.mjs (Rule 4 line-budget relief,
// 2026-08-26): credential-generation and credential-passing contract only.
// General job/workflow structure and gating live in the sibling file.
const workflow = await readFile(new URL('../../../workflows/ci.yml', import.meta.url), 'utf8');
const jobs = workflow
  .slice(workflow.indexOf('jobs:\n'))
  .split(/^\s{2}(?=\w[\w-]*:\n)/m)
  .slice(1);
const ci = jobs.find((job) => job.startsWith('ci:'));
const contract = jobs.find((job) => job.startsWith('ci-runtime-contract:'));
const action = await readFile(new URL('../action.yml', import.meta.url), 'utf8');

// The composite action's default `full` phase must run runner admission before
// start+wait: a caller omitting `phase` would otherwise bypass the capacity gate.
const admissionStep = action.slice(action.indexOf('Admit concurrent E2E runner'), action.indexOf('Start project runtime'));
if (!admissionStep.includes("inputs.phase == 'admission' || inputs.phase == 'full'")) {
  throw new Error('docker-infra action does not admit runner capacity during the default full phase');
}
if (action.indexOf('Start project runtime') < action.indexOf('Admit concurrent E2E runner')) {
  throw new Error('docker-infra action starts the runtime before admission');
}
// Encryption/credential material generation lives in a shared script: the
// contract job needs only the base set, `ci` additionally needs
// Postgres/MinIO via --full.
if (!contract?.includes('run: bash .github/actions/docker-infra/scripts/generate-ci-runtime-secrets.sh >> "$GITHUB_ENV"'))
  throw new Error('Contract job does not generate its run-scoped encryption material');
if (!ci?.includes('run: bash .github/actions/docker-infra/scripts/generate-ci-runtime-secrets.sh --full >> "$GITHUB_ENV"'))
  throw new Error('ci does not generate the full run-scoped credential set');
const secrets = await readFile(new URL('../scripts/generate-ci-runtime-secrets.sh', import.meta.url), 'utf8');
// No committed PostgreSQL credential may survive: the input is mandatory and
// every workflow invocation passes a per-run generated password.
if (!/postgres-password:\n\s+description:[^\n]*\n\s+required: true/.test(action)) {
  throw new Error('docker-infra action does not require a per-run postgres-password');
}
if (/postgres-password:\n\s+default:/.test(action)) {
  throw new Error('docker-infra action keeps an insecure postgres-password default');
}
if (!/POSTGRES_PASSWORD=%s/.test(secrets) || !secrets.includes('openssl rand -hex 24')) {
  throw new Error('generate-ci-runtime-secrets.sh does not generate a per-run PostgreSQL password');
}
// MinIO credentials follow the identical contract: generated per run, no
// insecure default in the composite action, passed to every invocation.
for (const input of ['minio-access-key', 'minio-secret-key']) {
  if (!new RegExp(`${input}:\\n\\s+description:[^\\n]*\\n\\s+required: true`).test(action)) {
    throw new Error(`docker-infra action does not require a per-run ${input}`);
  }
  if (new RegExp(`${input}:\\n\\s+default:`).test(action)) {
    throw new Error(`docker-infra action keeps an insecure ${input} default`);
  }
}
if (!/MINIO_ACCESS_KEY=%s\\nMINIO_SECRET_KEY=%s/.test(secrets)) {
  throw new Error('generate-ci-runtime-secrets.sh does not generate per-run MinIO credentials');
}
const runtimeInvocations = ci.split('uses: ./.github/actions/docker-infra').length - 1;
const passedPasswords = ci.match(/postgres-password: \$\{\{ env\.POSTGRES_PASSWORD \}\}/g)?.length ?? 0;
const passedAccessKeys = ci.match(/minio-access-key: \$\{\{ env\.MINIO_ACCESS_KEY \}\}/g)?.length ?? 0;
const passedSecretKeys = ci.match(/minio-secret-key: \$\{\{ env\.MINIO_SECRET_KEY \}\}/g)?.length ?? 0;
if (runtimeInvocations !== 3 || passedPasswords !== 3 || passedAccessKeys !== 3 || passedSecretKeys !== 3) {
  throw new Error(
    `CI must pass the generated credentials to all three runtime invocations ` +
      `(password ${passedPasswords}/${runtimeInvocations}, ` +
      `access key ${passedAccessKeys}/${runtimeInvocations}, ` +
      `secret key ${passedSecretKeys}/${runtimeInvocations})`
  );
}
