// events/consumer-group-control.ts
// Pause/resume control for registered plugin consumer groups.

import { logger } from '../../../lib/logger.js';

import { buildGroupId } from './consumer-group-registry.js';
import { consumers } from './consumer-group-state.js';

export async function pauseConsumerGroup(installId: string, tenantSlug: string): Promise<void> {
  const entry = consumers.get(buildGroupId(installId, tenantSlug));
  if (!entry?.isRunning) return;
  if (entry.consumer.assignment().length === 0) return;
  try {
    entry.consumer.pause(entry.topics.map((topic) => ({ topic })));
    entry.isRunning = false;
  } catch {
    logger.warn(
      { code: 'KAFKA_PAUSE_FAILED', groupId: buildGroupId(installId, tenantSlug) },
      'Pause failed'
    );
  }
}

export async function resumeConsumerGroup(installId: string, tenantSlug: string): Promise<void> {
  const entry = consumers.get(buildGroupId(installId, tenantSlug));
  if (!entry) return;
  if (entry.consumer.assignment().length === 0) return;
  try {
    entry.consumer.resume(entry.topics.map((topic) => ({ topic })));
    entry.isRunning = true;
  } catch {
    logger.warn({ code: 'KAFKA_RESUME_FAILED' }, 'Resume failed');
  }
}
