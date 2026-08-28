// events/consumer-group-state.ts
// Per-group consumer registry and shutdown/cancel flags shared by the
// consumer-manager creation and removal paths.

import type { KafkaConsumer } from '../../../lib/kafka-client.js';

export interface ConsumerEntry {
  consumer: KafkaConsumer;
  topics: string[];
  isRunning: boolean;
  installId: string;
  tenantSlug: string;
  pluginId: string;
}

export const consumers = new Map<string, ConsumerEntry>();
export const pendingConsumers = new Map<string, Promise<void>>();
export const cancellingGroups = new Set<string>();
let shuttingDown = false;

export function isShuttingDown(): boolean {
  return shuttingDown;
}

export function setShuttingDown(): void {
  shuttingDown = true;
}
