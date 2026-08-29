import { logger } from '../../../lib/logger.js';
import { config } from '../../../lib/config.js';

import { createContainerManager } from './container-manager.service.js';
import { startInstallationConsumer } from './runtime-recovery.service.js';
import {
  completeCredentialRotation,
  issueServiceCredential,
  revokeInstallationCredentials,
} from './service-credential.service.js';

import type { TenantContext } from '../../../lib/tenant-context-store.js';
import type { Manifest } from '../schema/manifest.js';
import type { PluginRole } from './db-role.service.js';

interface InstallRuntimeInput {
  context: TenantContext;
  installId: string;
  pluginId: string;
  pluginSlug: string;
  pluginVersion: string;
  hostingType: string;
  imageRef: string;
  manifest: Manifest;
  role: PluginRole;
}

export async function installPluginRuntime(input: InstallRuntimeInput): Promise<boolean> {
  const { context, installId, pluginId, pluginSlug, pluginVersion, hostingType, imageRef } = input;
  await revokeInstallationCredentials(installId);
  const credential = await issueServiceCredential({
    tenantId: context.tenantId,
    tenantSlug: context.slug,
    installId,
    pluginId,
    pluginSlug,
  });
  let degraded = false;
  try {
    const hostingPort = (input.manifest.hosting as { port?: number }).port ?? 3000;
    await createContainerManager(hostingType).startContainer(installId, {
      ...input.manifest,
      slug: pluginSlug,
      version: pluginVersion,
      hosting: { ...input.manifest.hosting, image: imageRef, port: hostingPort },
      env: {
        ...input.manifest.env,
        DATABASE_URL: input.role.connectionString,
        CORE_API_URL: config.PLUGIN_CORE_API_URL,
        PLEXICA_SERVICE_TOKEN: credential.token,
        PLEXICA_INSTALL_ID: installId,
      },
    });
    await completeCredentialRotation(installId, credential.credentialId, true);
  } catch {
    await completeCredentialRotation(installId, credential.credentialId, false);
    logger.warn({ installId, reasonCode: 'PLUGIN_RUNTIME_START' }, 'Plugin runtime degraded');
    degraded = true;
  }
  if (input.manifest.events?.subscribes?.length) {
    // The consumer waits up to 15s for a Kafka assignment
    // (waitForConsumerAssignment in consumer-group-lifecycle.ts). Under CI
    // load Redpanda can still be provisioning the plugin topic when the
    // install lands, so a single attempt fails with a retryable timeout.
    // Retry with a short linear backoff before declaring the install degraded
    // (the periodic runtime reconciler heals anything that still fails).
    const runtime = {
      id: installId,
      pluginId,
      tenantId: context.tenantId,
      tenantSlug: context.slug,
      hostingType,
    };
    const plugin = { id: pluginId, slug: pluginSlug, manifest: input.manifest };
    const CONSUMER_ATTEMPTS = 3;
    const CONSUMER_BACKOFF_MS = 5_000;
    for (let attempt = 1; attempt <= CONSUMER_ATTEMPTS; attempt++) {
      try {
        await startInstallationConsumer(runtime, plugin);
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(
          { installId, attempt, of: CONSUMER_ATTEMPTS, err: msg, reasonCode: 'PLUGIN_CONSUMER_START' },
          'Plugin consumer start failed — retrying'
        );
        if (attempt === CONSUMER_ATTEMPTS) {
          logger.warn({ installId, reasonCode: 'PLUGIN_CONSUMER_START' }, 'Plugin runtime degraded');
          degraded = true;
        } else {
          await sleep(CONSUMER_BACKOFF_MS * attempt);
        }
      }
    }
  }
  return degraded;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
