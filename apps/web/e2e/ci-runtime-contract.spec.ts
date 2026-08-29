import { test } from '@playwright/test';

import { ciRuntimeManifest } from '../../../e2e/ci-runtime-manifest.js';

import { runCiRuntimeContractFlow } from './helpers/ci-runtime-contract-flow.js';

// The CRM install leg (sidecar Docker start + health poll) alone takes ~16s
// under CI load (live run 33222833637: install POST 15.8s responseTime), so
// the default 30s test window is too tight for the whole flow on the shared
// self-hosted runner. This contract is one heavy spec, not a fleet of them —
// a dedicated window is the right trade-off.
test('CI web preserves same-origin API and plugin proxy requests', async ({ page, request }) => {
  test.setTimeout(120_000);
  await runCiRuntimeContractFlow(page, request, {
    appLabel: 'web',
    baseUrl: ciRuntimeManifest().WEB_E2E_PUBLIC_BASE,
  });
});
