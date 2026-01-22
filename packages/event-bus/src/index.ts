// Export all types
export * from './types';

// Export services
export { RedpandaClient } from './services/redpanda-client';
export { TopicManager } from './services/topic-manager';
export { EventBusService } from './services/event-bus.service';
export { PluginEventClient } from './services/plugin-event-client';
export { DeadLetterQueueService } from './services/dead-letter-queue.service';
export type { FailedEvent, DLQConfig, DLQStats } from './services/dead-letter-queue.service';

// Export decorators
export * from './decorators/event-handler.decorator';

// Export utilities
export * from './utils/event-handler-initializer';

// Export metrics
export { EventMetrics, eventMetrics } from './metrics/event-metrics';
