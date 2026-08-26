import { test } from '@playwright/test';

import { ciRuntimeManifest } from '../../../e2e/ci-runtime-manifest.js';

import { runCiRuntimeContractFlow } from './helpers/ci-runtime-contract-flow.js';

test('CI web preserves same-origin API and plugin proxy requests', async ({ page, request }) => {
  await runCiRuntimeContractFlow(page, request, {
    appLabel: 'web',
    baseUrl: ciRuntimeManifest().WEB_E2E_PUBLIC_BASE,
  });
});
