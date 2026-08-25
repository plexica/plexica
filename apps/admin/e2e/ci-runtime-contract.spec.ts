import { test } from '@playwright/test';

import { runCiRuntimeContractFlow } from '../../web/e2e/helpers/ci-runtime-contract-flow.js';
import { ciRuntimeManifest } from '../../../e2e/ci-runtime-manifest.js';

test('CI admin preserves same-origin API and plugin proxy requests', async ({ page, request }) => {
  await runCiRuntimeContractFlow(page, request, {
    appLabel: 'admin',
    baseUrl: ciRuntimeManifest().ADMIN_E2E_PUBLIC_BASE,
    hostKeys: { baseKey: 'PLAYWRIGHT_ADMIN_BASE_URL', apiKey: 'PLAYWRIGHT_CORE_API_URL' },
  });
});
