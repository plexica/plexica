// services/health-polling.service.ts
// Periodic health poller for plugin installations. Extracted from
// health-check.service.ts (Rule 4: 200 lines per file); the circuit-breaker
// state machine stays there, the timer lifecycle lives here.
//
// Owned by bootstrap.startBackgroundServices() / stopBackgroundServices() via
// modules/plugin/index.ts — it must NOT be started as a side effect of
// registering routes, because route registration has no teardown counterpart
// and the timer would keep hitting Redis after disconnectRedis().

import { logger } from '../../../lib/logger.js';

import { recordFailure, recordSuccess, shouldProbe } from './health-check.service.js';

import type { ContainerManager } from './container-manager.service.js';

type GetInstallIds = () => string[] | Promise<string[]>;

let pollingInterval: ReturnType<typeof setInterval> | null = null;
let pollingCycle: Promise<void> | null = null;

async function probeInstall(cm: ContainerManager, installId: string): Promise<void> {
  if (!(await shouldProbe(installId))) return;
  try {
    const status = await cm.getContainerStatus(installId);
    if (status.state === 'running') await recordSuccess(installId);
    else await recordFailure(installId);
  } catch {
    await recordFailure(installId);
  }
}

async function runPollingCycle(
  containerManager: ContainerManager,
  getInstallIds: GetInstallIds
): Promise<void> {
  try {
    const ids = await getInstallIds();
    await Promise.all(ids.map((installId) => probeInstall(containerManager, installId)));
  } catch (err) {
    logger.error({ err }, 'Health polling cycle failed');
  }
}

/**
 * Starts the poller. The interval is unref'd so it can never by itself keep
 * the event loop alive during a shutdown (mirrors outbox-publisher.ts).
 */
export function startPeriodicHealthPolling(
  containerManager: ContainerManager,
  getInstallIds: GetInstallIds,
  intervalMs = 30_000
): void {
  if (pollingInterval !== null) return;

  pollingInterval = setInterval(() => {
    // Skip the tick if the previous cycle is still running (slow Docker API).
    if (pollingCycle) return;
    pollingCycle = runPollingCycle(containerManager, getInstallIds).finally(() => {
      pollingCycle = null;
    });
  }, intervalMs);
  pollingInterval.unref();

  logger.info({ intervalMs }, 'Periodic health polling started');
}

/**
 * Stops the poller and awaits the in-flight cycle, so no Redis or Docker call
 * is still pending when the shutdown moves on to closing those connections.
 */
export async function stopPeriodicHealthPolling(): Promise<void> {
  if (pollingInterval === null && pollingCycle === null) return;

  if (pollingInterval !== null) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }

  await pollingCycle?.catch(() => undefined);
  pollingCycle = null;
  logger.info('Periodic health polling stopped');
}
