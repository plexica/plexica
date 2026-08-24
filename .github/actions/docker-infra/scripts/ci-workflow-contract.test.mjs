import { access, readFile } from 'node:fs/promises';
import { URL } from 'node:url';

const workflow = await readFile(new URL('../../../workflows/ci.yml', import.meta.url), 'utf8');
for (const reference of workflow.matchAll(/\bbash\s+(\.github\/actions\/docker-infra\/scripts\/[\w-]+\.sh)\b/g)) {
  await access(new URL(`../../../../${reference[1]}`, import.meta.url));
}
const jobs = workflow
  .slice(workflow.indexOf('jobs:\n'))
  .split(/^\s{2}(?=\w[\w-]*:\n)/m)
  .slice(1);
for (const job of jobs) {
  const name = job.match(/^(\w[\w-]*):/m)?.[1];
  if (!name) throw new Error('Unable to identify CI job');
  if (!/^\s+runs-on: self-hosted\s*$/m.test(job))
    throw new Error(`${name} is not pinned to the default self-hosted runner`);
  const checkout = job.indexOf('uses: actions/checkout@v7');
  const admission = job.indexOf('uses: ./.github/actions/ci-runner-admission');
  if (
    checkout < 0 ||
    admission < checkout ||
    /uses: actions\/(setup-node|upload-artifact)@|pnpm |docker /.test(
      job.slice(checkout, admission)
    )
  )
    throw new Error(`${name} does not admit capacity before runner work`);
  const setupNode = job.indexOf('uses: actions/setup-node@v7');
  const corepack = job.indexOf('corepack enable && corepack prepare pnpm@10.33.0 --activate');
  if (setupNode < 0 || corepack < 0 || corepack < setupNode)
    throw new Error(`${name} does not activate the pinned project pnpm via Corepack after setup-node`);
}
if (/pnpm\/action-setup/.test(workflow))
  throw new Error('CI still uses the broken self-installer pnpm/action-setup');
const ci = jobs.find((job) => job.startsWith('ci:'));
if (!ci?.includes('run: bash .github/actions/docker-infra/scripts/verify-ci-sidecar-lifecycle.sh'))
  throw new Error('CI does not invoke the admitted real sidecar lifecycle proof');
// Both sidecar images must flow through the ephemeral registry: the lifecycle
// proof builds the real CRM plugin image (deterministic per-project tag) and
// publishes BOTH digest-pinned refs into sidecar-images.env before any
// runtime service that consumes them starts (run 32758511913 regression).
const lifecycle = await readFile(new URL('../scripts/verify-ci-sidecar-lifecycle.sh', import.meta.url), 'utf8');
const publisher = await readFile(new URL('../scripts/publish-sidecar-images.sh', import.meta.url), 'utf8');
for (const [label, needle] of [
  ['CRM build', 'examples/plugins/crm/Dockerfile'],
  ['CRM publish wiring', 'PLUGIN_IMAGE_TAG="$crm_image"'],
  ['dual digest validation', '^PLUGIN_SIDECAR_IMAGE='],
]) {
  if (!lifecycle.includes(needle)) throw new Error(`Sidecar lifecycle proof is missing ${label}`);
}
if (!publisher.includes("printf '%s\\n%s\\n'")) {
  throw new Error('Publisher does not atomically write both sidecar image lines');
}
const composeRuntime = await readFile(
  new URL('../../../../infra/compose/docker-compose.ci-runtime-services.yml', import.meta.url),
  'utf8'
);
if (composeRuntime.match(/^\s+PLUGIN_SIDECAR_IMAGE:\s/m)) {
  throw new Error('CI runtime compose still statically overrides PLUGIN_SIDECAR_IMAGE over env_file');
}
const contract = jobs.find((job) => job.startsWith('ci-runtime-contract:'));
if (!contract?.includes('verify-concurrent-ci-runtime.sh --full-e2e'))
  throw new Error('Contract job does not run the full two-project browser E2E stack');
if (/playwright test/.test(ci))
  throw new Error('CI duplicates the browser E2E already proven by the contract job');
for (const job of [jobs.find((entry) => entry.startsWith('ci:')), jobs.find((entry) => entry.startsWith('ci-runtime-contract:'))]) {
  if (!job?.includes("CI_RUNTIME_CONTRACT: '1'") || !job.includes('E2E_CORE_API_PROXY_TARGET: http://core-api-e2e:3001') || !job.includes("--filter='!@plexica/plugin-crm'")) {
    throw new Error('CI runtime artifacts are not built with the runtime contract enabled');
  }
}
// The composite action's default `full` phase must run runner admission before
// start+wait: a caller omitting `phase` would otherwise bypass the capacity gate.
const action = await readFile(new URL('../action.yml', import.meta.url), 'utf8');
const admissionStep = action.slice(action.indexOf('Admit concurrent E2E runner'), action.indexOf('Start project runtime'));
if (!admissionStep.includes("inputs.phase == 'admission' || inputs.phase == 'full'")) {
  throw new Error('docker-infra action does not admit runner capacity during the default full phase');
}
if (action.indexOf('Start project runtime') < action.indexOf('Admit concurrent E2E runner')) {
  throw new Error('docker-infra action starts the runtime before admission');
}
// No committed PostgreSQL credential may survive: the input is mandatory and
// every workflow invocation passes a per-run generated password.
if (!/postgres-password:\n\s+description:[^\n]*\n\s+required: true/.test(action)) {
  throw new Error('docker-infra action does not require a per-run postgres-password');
}
if (/postgres-password:\n\s+default:/.test(action)) {
  throw new Error('docker-infra action keeps an insecure postgres-password default');
}
if (!/POSTGRES_PASSWORD=%s/.test(ci) || !ci.includes('openssl rand -hex 24')) {
  throw new Error('CI does not generate a per-run PostgreSQL password');
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
if (!/MINIO_ACCESS_KEY=%s\\nMINIO_SECRET_KEY=%s/.test(ci)) {
  throw new Error('CI does not generate per-run MinIO credentials');
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
