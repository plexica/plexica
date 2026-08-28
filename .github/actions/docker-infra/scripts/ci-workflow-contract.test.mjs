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
// detect-ci-infra-changes is deliberately admission-free (CI-PORT-13): it
// runs on every trigger and must stay cheap, so it never consumes the
// Docker/build capacity the admission gate protects.
const admissionExempt = new Set(['detect-ci-infra-changes']);
for (const job of jobs) {
  const name = job.match(/^(\w[\w-]*):/m)?.[1];
  if (!name) throw new Error('Unable to identify CI job');
  if (!/^\s+runs-on: self-hosted\s*$/m.test(job))
    throw new Error(`${name} is not pinned to the default self-hosted runner`);
  if (admissionExempt.has(name)) continue;
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
  const corepack = job.indexOf('corepack enable && corepack prepare pnpm@10.34.2 --activate');
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
const detect = jobs.find((job) => job.startsWith('detect-ci-infra-changes:'));
if (!detect?.includes('fetch-depth: 0'))
  throw new Error('detect-ci-infra-changes does not fetch full history for diffing');
if (!detect?.includes('heavy: ${{ steps.detect.outputs.heavy }}'))
  throw new Error('detect-ci-infra-changes does not expose a heavy output');
if (!detect?.includes('run: bash .github/actions/docker-infra/scripts/detect-ci-infra-changes.sh'))
  throw new Error('detect-ci-infra-changes does not invoke its detection script');

const contract = jobs.find((job) => job.startsWith('ci-runtime-contract:'));
if (!contract?.includes('verify-concurrent-ci-runtime.sh --full-e2e'))
  throw new Error('Contract job does not run the full two-project browser E2E stack');
if (!contract?.includes('needs: [detect-ci-infra-changes]'))
  throw new Error('Contract job does not depend on the change-detection pre-flight');
// CI-PORT-13: fail-open on workflow_dispatch, a detected change, OR the
// pre-flight itself not succeeding — never silently downgraded to skip.
if (
  !contract?.includes(
    "if: always() && !cancelled() && (github.event_name == 'workflow_dispatch' || needs.detect-ci-infra-changes.result != 'success' || needs.detect-ci-infra-changes.outputs.heavy == 'true')"
  )
)
  throw new Error('Contract job is not fail-open gated on dispatch/detected-change/pre-flight-failure');
if (
  !ci?.includes(
    "if: always() && !cancelled() && needs.quality.result == 'success' && (needs.ci-runtime-contract.result == 'success' || needs.ci-runtime-contract.result == 'skipped')"
  )
)
  throw new Error('ci does not tolerate a skipped (but not failed) contract job');
if (!ci.includes('run: bash .github/actions/docker-infra/scripts/run-single-project-e2e-suite.sh'))
  throw new Error('ci does not invoke the single-project browser E2E suite fallback');
if (!ci.includes("if: needs.ci-runtime-contract.result == 'skipped'"))
  throw new Error('ci does not gate the single-project E2E suite on a skipped contract');
// A direct, unconditional Playwright invocation added to ci.yml itself would
// bypass the skipped-only gate above and could triple-run the suite whenever
// the two-project contract also runs; ci.yml must only ever reach Playwright
// through the wrapper script.
if (/playwright test/.test(ci))
  throw new Error('ci invokes Playwright directly instead of the gated single-project E2E wrapper script');
const singleSuite = await readFile(new URL('../scripts/run-single-project-e2e-suite.sh', import.meta.url), 'utf8');
for (const needle of [
  'publish-plugin-assets.sh',
  'run_global_setup "$project" web',
  'run_global_setup "$project" admin',
  "run_playwright \"$project\" web ''",
  "run_playwright \"$project\" @plexica/admin ''",
]) {
  if (!singleSuite.includes(needle)) throw new Error(`Single-project E2E suite is missing ${needle}`);
}
// The 20 test invocations formerly inline in ci.yml (plus the 2 new ones)
// moved into run-ci-contract-tests.sh for the Rule 4 line gate; the generic
// bash-script-exists scan above only reads ci.yml itself, so repeat it here.
if (!ci.includes('run: bash .github/actions/docker-infra/scripts/run-ci-contract-tests.sh'))
  throw new Error('ci does not invoke the extracted contract-tests runner');
const contractTests = await readFile(new URL('../scripts/run-ci-contract-tests.sh', import.meta.url), 'utf8');
for (const reference of contractTests.matchAll(/\bbash\s+(\.github\/actions\/docker-infra\/scripts\/[\w-]+\.sh)\b/g)) {
  await access(new URL(`../../../../${reference[1]}`, import.meta.url));
}
for (const needle of [
  'ci-runtime-endpoint-contract.test.mjs',
  'sanitize-ci-runtime-diagnostics.test.mjs',
  'ci-runtime-env.test.sh',
  'provision-e2e-postgres-ca.test.sh',
  'ci-runtime-keycloak-credentials.test.sh',
  'ci-runtime-compose.test.sh',
  'ci-runtime-cleanup.test.sh',
  'ensure-topics.test.sh',
  'keycloak-contract.test.sh',
  'redpanda-contract.test.sh',
  'verify-ci-runtime-artifacts.test.sh',
  'verify-ci-runner-capacity.test.sh',
  'ci-workflow-contract.test.mjs',
  'ci-workflow-credentials.test.mjs',
  'ci-runtime-lifecycle.test.sh',
  'verify-ci-sidecar-lifecycle.test.sh',
  'verify-ci-compose-render.test.sh',
  'wait-services.test.sh',
  'wait-for-http.test.sh',
  'down-ci-runtime-project.test.sh',
  'verify-concurrent-ci-runtime.test.sh',
  'detect-ci-infra-changes.test.sh',
  'run-single-project-e2e-suite.test.sh',
  'generate-ci-runtime-secrets.test.sh',
  'ci-plugin-docker-proxy.test.mjs',
]) {
  if (!contractTests.includes(needle)) throw new Error(`run-ci-contract-tests.sh is missing an invocation of ${needle}`);
}
for (const job of [jobs.find((entry) => entry.startsWith('ci:')), jobs.find((entry) => entry.startsWith('ci-runtime-contract:'))]) {
  if (!job?.includes("CI_RUNTIME_CONTRACT: '1'") || !job.includes('E2E_CORE_API_PROXY_TARGET: http://core-api-e2e:3001') || !job.includes("--filter='!@plexica/plugin-crm'")) {
    throw new Error('CI runtime artifacts are not built with the runtime contract enabled');
  }
}
// Credential generation/passing and the docker-infra admission-order
// contract are verified in the sibling ci-workflow-credentials.test.mjs
// (Rule 4 line-budget split, 2026-08-26).
