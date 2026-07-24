import { prisma } from '../../../lib/database.js';
import { logger } from '../../../lib/logger.js';

import { reconcileLifecycleOperation } from './tenant-lifecycle-reconciler.js';

let interval: NodeJS.Timeout | undefined;
let running: Promise<void> | undefined;

async function sweep(): Promise<void> {
  while (await reconcileLifecycleOperation(prisma)) {
    // Claims are serialized per tenant in PostgreSQL and bounded by available work.
  }
}

function scheduleSweep(): void {
  if (running) return;
  running = sweep()
    .catch(() =>
      logger.error({ code: 'LIFECYCLE_SWEEP_FAILED' }, 'Tenant lifecycle sweep failed')
    )
    .finally(() => {
      running = undefined;
    });
}

export function startTenantLifecycleWorker(periodMs = 1_000): void {
  if (interval) return;
  scheduleSweep();
  interval = setInterval(scheduleSweep, periodMs);
  interval.unref();
}

export async function stopTenantLifecycleWorker(): Promise<void> {
  if (interval) clearInterval(interval);
  interval = undefined;
  await running;
}
