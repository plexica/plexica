# Plexica Event System Documentation

## Overview

The Plexica Event System provides a robust, type-safe event-driven architecture built on Redpanda (Kafka-compatible) for communication between core services and plugins. It supports publish/subscribe patterns with automatic tenant isolation, retry mechanisms, and comprehensive error handling.

**Version**: 1.0 (M2.1)  
**Package**: `@plexica/event-bus`  
**Status**: Production-ready

---

## Table of Contents

1. [Architecture](#architecture)
2. [Event Naming Conventions](#event-naming-conventions)
3. [Quick Start](#quick-start)
4. [Core Concepts](#core-concepts)
5. [Publishing Events](#publishing-events)
6. [Subscribing to Events](#subscribing-to-events)
7. [Event Decorators](#event-decorators)
8. [Plugin Integration](#plugin-integration)
9. [Dead Letter Queue (DLQ)](#dead-letter-queue-dlq)
10. [Error Handling](#error-handling)
11. [Best Practices](#best-practices)
12. [API Reference](#api-reference)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Application Layer                          │
│  ┌──────────────┐              ┌──────────────┐            │
│  │  Core API    │              │   Plugins    │            │
│  │  Services    │              │              │            │
│  └──────┬───────┘              └──────┬───────┘            │
│         │                             │                     │
│         └─────────────┬───────────────┘                     │
│                       ▼                                      │
│            ┌──────────────────────┐                         │
│            │  @plexica/event-bus  │                         │
│            │  - EventBusService   │                         │
│            │  - PluginEventClient │                         │
│            └──────────┬───────────┘                         │
│                       │                                      │
├───────────────────────┼──────────────────────────────────────┤
│                       ▼                                      │
│         ┌─────────────────────────────┐                     │
│         │   Redpanda Cluster (3-node) │                     │
│         │   - High Availability       │                     │
│         │   - Replication Factor: 3   │                     │
│         │   - Default: 3 Partitions   │                     │
│         └─────────────┬───────────────┘                     │
│                       │                                      │
│                       ▼                                      │
│            ┌─────────────────────┐                          │
│            │  Consumer Groups    │                          │
│            │  - Auto Load Balance│                          │
│            │  - Offset Tracking  │                          │
│            └─────────────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

- **RedpandaClient**: Connection manager for Kafka/Redpanda brokers
- **TopicManager**: Topic creation, naming enforcement, configuration
- **EventBusService**: Core publish/subscribe service with filtering
- **PluginEventClient**: Simplified event API for plugins
- **DeadLetterQueueService**: Failed event handling and retry logic

---

## Event Naming Conventions

### Topic Naming Format

All events in Plexica follow a strict naming convention enforced by the `TopicManager`:

```
<scope>.<domain>.<entity>.<action>
```

#### Scope Types

1. **Core Events** (`core.*`)
   - System-level events emitted by the Plexica platform
   - Format: `core.<domain>.<event>`
2. **Plugin Events** (`plugin.*`)
   - Events emitted by plugins
   - Format: `plugin.<pluginId>.<event>`

3. **DLQ Events** (`dlq.*`)
   - Dead letter queue topics for failed events
   - Format: `dlq.<originalTopic>`

---

### Core Event Naming

**Pattern**: `core.<domain>.<action>`

#### Domains

| Domain      | Description                    | Examples                                                      |
| ----------- | ------------------------------ | ------------------------------------------------------------- |
| `tenant`    | Tenant lifecycle events        | `core.tenant.created`, `core.tenant.deleted`                  |
| `user`      | User authentication/management | `core.user.login`, `core.user.logout`, `core.user.created`    |
| `workspace` | Workspace operations           | `core.workspace.created`, `core.workspace.member_added`       |
| `api`       | API-level events               | `core.api.request`, `core.api.error`                          |
| `plugin`    | Plugin lifecycle               | `core.plugin.installed`, `core.plugin.activated`              |
| `data`      | Data operations                | `core.data.created`, `core.data.updated`, `core.data.deleted` |
| `auth`      | Authentication events          | `core.auth.token_issued`, `core.auth.password_reset`          |

#### Actions (Verbs)

Use **past tense** for all event actions:

| Action        | Usage            | Example                   |
| ------------- | ---------------- | ------------------------- |
| `created`     | Entity created   | `core.tenant.created`     |
| `updated`     | Entity modified  | `core.user.updated`       |
| `deleted`     | Entity removed   | `core.workspace.deleted`  |
| `login`       | User logged in   | `core.user.login`         |
| `logout`      | User logged out  | `core.user.logout`        |
| `activated`   | Entity enabled   | `core.plugin.activated`   |
| `deactivated` | Entity disabled  | `core.plugin.deactivated` |
| `failed`      | Operation failed | `core.api.failed`         |
| `completed`   | Process finished | `core.job.completed`      |

#### Core Event Examples

```typescript
// ✅ Good - follows convention
'core.tenant.created';
'core.user.login';
'core.workspace.member_added';
'core.api.request';
'core.plugin.activated';

// ❌ Bad - doesn't follow convention
'tenant-created'; // Missing scope prefix
'core.user.create'; // Present tense (should be 'created')
'core.createUser'; // camelCase instead of dot notation
'user.login'; // Missing scope
```

---

### Plugin Event Naming

**Pattern**: `plugin.<pluginId>.<entity>.<action>`

Plugins **automatically prefix** events with `plugin.<pluginId>` via `PluginEventClient`.

#### Plugin ID Format

Plugin IDs must be:

- Lowercase
- Hyphen-separated (kebab-case)
- Alphanumeric + hyphens only

```typescript
// ✅ Valid plugin IDs
'crm';
'sample-analytics';
'salesforce-sync';
'custom-reports';

// ❌ Invalid plugin IDs
'CRM'; // Uppercase
'sample_analytics'; // Underscores
'salesforce.sync'; // Dots
```

#### Plugin Event Examples

```typescript
// Plugin: sample-analytics
'plugin.sample-analytics.report.generated';
'plugin.sample-analytics.data.aggregated';
'plugin.sample-analytics.export.completed';

// Plugin: crm
'plugin.crm.contact.created';
'plugin.crm.deal.updated';
'plugin.crm.email.sent';

// Plugin: custom-reports
'plugin.custom-reports.dashboard.rendered';
'plugin.custom-reports.query.executed';
```

**Note**: When using `PluginEventClient`, you only specify the event name (e.g., `contact.created`). The client automatically prepends `plugin.<pluginId>`.

---

### Reserved Prefixes

The following prefixes are **reserved** for system use:

| Prefix     | Purpose                  | Managed By  |
| ---------- | ------------------------ | ----------- |
| `core.*`   | Platform events          | Core API    |
| `plugin.*` | Plugin events            | Plugins     |
| `dlq.*`    | Dead letter queue        | DLQ Service |
| `__*`      | Internal Redpanda topics | Redpanda    |

---

## Quick Start

### Installation

```bash
npm install @plexica/event-bus
```

### Basic Publishing

```typescript
import { EventBusService, RedpandaClient } from '@plexica/event-bus';

// Initialize client
const client = new RedpandaClient({
  brokers: ['localhost:9092', 'localhost:9093', 'localhost:9094'],
  clientId: 'my-service',
});

await client.connect();

// Create event bus
const eventBus = new EventBusService(client);

// Publish event
await eventBus.publish(
  'core.user.created',
  { userId: '123', email: 'user@example.com' },
  {
    tenantId: 'tenant-1',
    source: 'core',
    userId: 'admin-1',
  }
);
```

### Basic Subscription

```typescript
// Subscribe to events
await eventBus.subscribe(
  'core.user.created',
  async (event) => {
    console.log('User created:', event.data);
  },
  {
    groupId: 'user-service-consumers',
    tenantId: 'tenant-1', // Optional: filter by tenant
  }
);
```

---

## Core Concepts

### Domain Events

All events follow the `DomainEvent<T>` structure:

```typescript
interface DomainEvent<T = unknown> {
  id: string; // UUID
  type: string; // Event type (topic name)
  tenantId: string; // Tenant isolation
  workspaceId?: string; // Optional workspace scope
  timestamp: Date; // Event creation time
  data: T; // Event payload (generic)
  metadata: {
    source: string; // 'core' or plugin ID
    userId?: string; // User who triggered event
    correlationId?: string; // Trace related events
    causationId?: string; // Parent event ID
    version?: string; // Schema version
  };
}
```

### Tenant Isolation

Every event **must** include a `tenantId`. This ensures:

- Data isolation between tenants
- Filtered subscriptions per tenant
- Multi-tenant security

```typescript
// Subscribers can filter by tenant
await eventBus.subscribe('core.user.login', handler, {
  tenantId: 'tenant-123', // Only receive events for this tenant
});
```

### Workspace Scoping

Events can optionally include `workspaceId` for workspace-level isolation:

```typescript
await eventBus.publish('core.task.created', taskData, {
  tenantId: 'tenant-1',
  workspaceId: 'workspace-5', // Workspace scope
});
```

---

## Publishing Events

### Single Event

```typescript
await eventBus.publish<UserCreatedData>(
  'core.user.created',
  {
    userId: '123',
    email: 'user@example.com',
    role: 'member',
  },
  {
    tenantId: 'tenant-1',
    source: 'core',
    userId: 'admin-1',
    correlationId: 'request-abc123',
  },
  {
    compress: true, // Enable Snappy compression
    partitionKey: 'user-123', // Consistent partitioning
  }
);
```

### Batch Publishing

For high-throughput scenarios:

```typescript
await eventBus.publishBatch([
  {
    eventType: 'core.user.created',
    data: { userId: '1', email: 'user1@example.com' },
    metadata: { tenantId: 'tenant-1' },
  },
  {
    eventType: 'core.user.created',
    data: { userId: '2', email: 'user2@example.com' },
    metadata: { tenantId: 'tenant-1' },
  },
  // ... up to 100 events per batch
]);
```

**Benefits**:

- Reduced network overhead
- Better throughput (>1000 events/sec)
- Automatic Snappy compression

---

## Subscribing to Events

### Basic Subscription

```typescript
await eventBus.subscribe(
  'core.user.created',
  async (event: DomainEvent<UserCreatedData>) => {
    console.log('User created:', event.data.email);
    // Process event...
  },
  {
    groupId: 'email-notification-service',
    fromBeginning: false, // Start from latest
    autoCommit: true, // Auto-commit offsets
  }
);
```

### Filtered Subscription

```typescript
// Filter by tenant
await eventBus.subscribe('core.user.login', handler, {
  tenantId: 'tenant-123',
});

// Filter by workspace
await eventBus.subscribe('core.task.created', handler, {
  tenantId: 'tenant-123',
  workspaceId: 'workspace-5',
});
```

### Consumer Groups

Consumer groups enable **load balancing** and **parallel processing**:

```typescript
// Multiple instances with same groupId share the load
await eventBus.subscribe('core.api.request', handler, {
  groupId: 'analytics-workers', // Same group across instances
});
```

**Benefits**:

- Automatic load distribution
- Fault tolerance (if one consumer fails, others take over)
- Offset tracking per group

---

## Event Decorators

Decorators provide a **declarative** way to handle events.

### @EventHandler

Automatically subscribes a method to events:

```typescript
import { EventHandler, initializeEventHandlers } from '@plexica/event-bus';

class UserService {
  @EventHandler({
    eventName: 'core.user.created',
    groupId: 'user-service',
  })
  async onUserCreated(event: DomainEvent<UserData>) {
    // Handle event
    console.log('New user:', event.data.email);
  }

  @EventHandler({
    eventName: 'core.user.deleted',
    groupId: 'user-service',
  })
  async onUserDeleted(event: DomainEvent<{ userId: string }>) {
    // Cleanup logic
  }
}

// Initialize handlers
const service = new UserService();
await initializeEventHandlers(service, eventBus);
```

### @EventPublisher

Automatically publishes method return values as events:

```typescript
import { EventPublisher } from '@plexica/event-bus';

class UserService {
  @EventPublisher({
    eventName: 'core.user.created',
    compress: true,
  })
  async createUser(userData: UserData): Promise<UserCreatedData> {
    // Business logic
    const user = await db.users.create(userData);

    // Return value is automatically published as event
    return {
      userId: user.id,
      email: user.email,
      createdAt: user.createdAt,
    };
  }
}
```

### Cleanup

```typescript
import { cleanupEventHandlers } from '@plexica/event-bus';

// Unsubscribe all handlers when shutting down
await cleanupEventHandlers(service, eventBus);
```

---

## Plugin Integration

Plugins use `PluginEventClient` for simplified event access.

### Plugin Context

The plugin context includes an `events` property:

```typescript
interface PluginContext {
  tenantId: string;
  workspaceId?: string;
  pluginId: string;
  config: PluginConfig;
  events: PluginEventClient; // ← Event client
}
```

### Publishing from Plugins

```typescript
// In plugin code
export async function initialize(context: PluginContext) {
  // Publish event (auto-prefixed with plugin.{pluginId})
  await context.events.publish('contact.created', {
    contactId: '123',
    name: 'John Doe',
  });

  // Actual topic: plugin.crm.contact.created
}
```

### Subscribing in Plugins

```typescript
class CRMPlugin {
  @EventHandler({
    eventName: 'core.user.created', // Subscribe to core events
    groupId: 'crm-plugin-user-sync',
  })
  async syncUserToCRM(event: DomainEvent<UserData>) {
    // Sync user to CRM system
  }

  @EventHandler({
    eventName: 'deal.updated', // Subscribe to own events
    // Resolves to: plugin.crm.deal.updated
  })
  async onDealUpdated(event: DomainEvent<DealData>) {
    // Handle internal plugin event
  }
}

// Initialize
await initializeEventHandlers(plugin, context.events);
```

### Cross-Plugin Events

Plugins can subscribe to other plugins' events:

```typescript
await context.events.subscribe('contact.created', handler, {
  pluginId: 'crm', // Subscribe to plugin.crm.contact.created
});
```

---

## Dead Letter Queue (DLQ)

The DLQ handles failed events automatically.

### Automatic Routing

When an event handler throws an error, the event is automatically routed to DLQ:

```typescript
@EventHandler({ eventName: 'core.user.created' })
async onUserCreated(event: DomainEvent) {
  throw new Error('Database connection failed');
  // ↑ Event automatically goes to DLQ
}
```

### Retry Configuration

```typescript
const dlqService = new DeadLetterQueueService(client, {
  maxRetries: 3, // Max retry attempts
  retryDelayMs: 1000, // Base delay (exponential backoff)
  retentionDays: 30, // Keep failed events for 30 days
  topicPrefix: 'dlq', // DLQ topic prefix
});
```

### Manual Retry

```typescript
const dlq = eventBus.getDLQService();

// Retry specific event
await dlq.retryFailedEvent('dlq-event-123', true);

// Retry all for a topic
await dlq.retryAllForTopic('core.user.created');
```

### DLQ REST API

```bash
# Get statistics
GET /api/dlq/stats

# List failed events
GET /api/dlq/events?topic=core.user.created&status=pending

# Get event details
GET /api/dlq/events/{id}

# Retry event
POST /api/dlq/events/{id}/retry

# Retry all for topic
POST /api/dlq/retry/topic/{topic}

# Delete failed event
DELETE /api/dlq/events/{id}
```

---

## Error Handling

### Circuit Breaker

EventBus includes a built-in circuit breaker:

```typescript
// Circuit breaker states: CLOSED → OPEN → HALF_OPEN

// If 5 consecutive failures occur:
// - Circuit opens (rejects requests)
// - After 60s, transitions to HALF_OPEN
// - If 2 successes, closes circuit
```

### Exponential Backoff

DLQ uses exponential backoff for retries:

```
Retry 1: 1s delay
Retry 2: 2s delay
Retry 3: 4s delay
Max delay: 1 hour
```

### Error Metadata

Failed events include comprehensive metadata:

```typescript
interface FailedEvent {
  id: string;
  originalEvent: DomainEvent;
  originalTopic: string;
  failureReason: string;
  failureTimestamp: Date;
  retryCount: number;
  maxRetries: number;
  stackTrace?: string;
  consumerGroup?: string;
  partition?: number;
  offset?: string;
}
```

---

## Best Practices

### Event Naming

✅ **Do**:

- Use past tense verbs (`created`, `updated`, `deleted`)
- Follow scope.domain.action pattern
- Keep names concise but descriptive
- Use lowercase with dots

❌ **Don't**:

- Use present tense (`create`, `update`)
- Use camelCase or snake_case
- Include implementation details in names
- Create overly long names

```typescript
// ✅ Good
'core.user.created';
'plugin.crm.contact.synced';
'core.workspace.member_removed';

// ❌ Bad
'UserCreated';
'core.user.create';
'plugin.crm.save_contact_to_database';
```

### Event Payload Design

✅ **Do**:

- Keep payloads small and focused
- Use TypeScript interfaces
- Include only essential data
- Version your schema

❌ **Don't**:

- Include entire entities
- Embed sensitive data (passwords, tokens)
- Create circular references

```typescript
// ✅ Good
interface UserCreatedData {
  userId: string;
  email: string;
  role: string;
}

// ❌ Bad
interface UserCreatedData {
  user: User; // Entire entity
  password: string; // Sensitive data
  relatedUsers: User[]; // Unnecessary nested data
}
```

### Idempotency

Always design handlers to be **idempotent**:

```typescript
@EventHandler({ eventName: 'core.order.created' })
async onOrderCreated(event: DomainEvent<OrderData>) {
  const exists = await db.orders.findById(event.data.orderId);

  if (exists) {
    return; // Already processed (duplicate event)
  }

  // Process order...
}
```

### Error Handling in Handlers

```typescript
@EventHandler({ eventName: 'core.user.created' })
async onUserCreated(event: DomainEvent) {
  try {
    await processUser(event.data);
  } catch (error) {
    logger.error('Failed to process user:', error);
    throw error; // Let DLQ handle retry
  }
}
```

### Performance Tips

1. **Use batch publishing** for bulk operations
2. **Enable compression** for large payloads
3. **Use appropriate consumer groups** for parallelization
4. **Monitor DLQ** for recurring failures
5. **Set partition keys** for ordering guarantees

---

## API Reference

### EventBusService

```typescript
class EventBusService {
  // Publish single event
  async publish<T>(
    eventType: string,
    data: T,
    metadata?: Partial<EventMetadata> & { tenantId?: string },
    options?: PublishOptions
  ): Promise<void>;

  // Publish batch
  async publishBatch<T>(
    events: Array<{
      eventType: string;
      data: T;
      metadata?: Partial<EventMetadata>;
      options?: PublishOptions;
    }>
  ): Promise<void>;

  // Subscribe to events
  async subscribe(
    eventType: string,
    handler: EventHandlerFn,
    options?: SubscriptionOptions
  ): Promise<string>;

  // Unsubscribe
  async unsubscribe(subscriptionId: string): Promise<void>;

  // Shutdown
  async shutdown(): Promise<void>;

  // Get DLQ service
  getDLQService(): DeadLetterQueueService;
}
```

### PluginEventClient

```typescript
class PluginEventClient {
  // Publish event (auto-prefixed with plugin.{pluginId})
  async publish<T>(
    eventName: string,
    data: T,
    options?: {
      workspaceId?: string;
      correlationId?: string;
      causationId?: string;
    }
  ): Promise<void>;

  // Subscribe to events
  async subscribe(
    eventName: string,
    handler: (event: any) => Promise<void>,
    options?: {
      workspaceId?: string;
      fromBeginning?: boolean;
      pluginId?: string; // Subscribe to another plugin
      coreEvent?: boolean; // Subscribe to core event
    }
  ): Promise<string>;

  // Unsubscribe
  async unsubscribe(subscriptionId: string): Promise<void>;
}
```

### DeadLetterQueueService

```typescript
class DeadLetterQueueService {
  // Route failed event to DLQ
  async routeToDLQ(
    event: DomainEvent,
    originalTopic: string,
    error: Error,
    metadata?: { consumerGroup?: string; partition?: number; offset?: string }
  ): Promise<void>;

  // Retry failed event
  async retryFailedEvent(failedEventId: string, manualRetry?: boolean): Promise<boolean>;

  // Retry all for topic
  async retryAllForTopic(topic: string): Promise<{
    succeeded: number;
    failed: number;
  }>;

  // Get failed events
  getFailedEvents(filter?: {
    topic?: string;
    tenantId?: string;
    status?: 'pending' | 'max-retries-exceeded';
  }): FailedEvent[];

  // Get statistics
  getStats(): DLQStats;

  // Delete failed event
  async deleteFailedEvent(id: string): Promise<void>;
}
```

---

## Event Catalog

### Core Events

| Event                         | Data Type                        | Description           |
| ----------------------------- | -------------------------------- | --------------------- |
| `core.tenant.created`         | `{ tenantId, slug, name }`       | New tenant registered |
| `core.tenant.deleted`         | `{ tenantId }`                   | Tenant removed        |
| `core.user.created`           | `{ userId, email, role }`        | User account created  |
| `core.user.updated`           | `{ userId, changes }`            | User profile updated  |
| `core.user.deleted`           | `{ userId }`                     | User account deleted  |
| `core.user.login`             | `{ userId, ipAddress }`          | User logged in        |
| `core.user.logout`            | `{ userId, sessionDuration }`    | User logged out       |
| `core.workspace.created`      | `{ workspaceId, name }`          | Workspace created     |
| `core.workspace.member_added` | `{ workspaceId, userId, role }`  | Member added          |
| `core.plugin.installed`       | `{ pluginId, tenantId }`         | Plugin installed      |
| `core.plugin.activated`       | `{ pluginId, tenantId }`         | Plugin activated      |
| `core.api.request`            | `{ method, path, responseTime }` | API request logged    |
| `core.api.error`              | `{ method, path, error }`        | API error occurred    |

---

## Performance & Limits

| Metric                 | Value                      |
| ---------------------- | -------------------------- |
| Max event size         | 1 MB (recommended <100 KB) |
| Max batch size         | 100 events                 |
| Publish latency (p95)  | <10ms                      |
| Delivery latency (p95) | <100ms                     |
| Throughput             | >1000 events/sec           |
| Default retention      | 7 days                     |
| DLQ retention          | 30 days                    |
| Max retries            | 3 (configurable)           |

---

## Troubleshooting

### Events not being received

1. Check consumer group ID - ensure it's unique per service
2. Verify topic exists: `await topicManager.topicExists(topic)`
3. Check tenant filtering - ensure `tenantId` matches
4. Review logs for subscription errors

### High DLQ count

1. Check `GET /api/dlq/stats` for failure reasons
2. Review failed event details: `GET /api/dlq/events`
3. Fix underlying issue (e.g., database connection)
4. Retry events: `POST /api/dlq/retry/topic/{topic}`

### Slow event delivery

1. Check Redpanda cluster health
2. Increase consumer instances (same group ID)
3. Enable compression for large payloads
4. Review handler performance (add indexes, cache, etc.)

---

## Examples

See the following files for complete examples:

- `plugins/sample-analytics/src/index.new.ts` - Full plugin with decorators
- `plugins/sample-analytics/MIGRATION.md` - Migration guide
- `packages/event-bus/src/services/*.ts` - Service implementations

---

_Plexica Event System v1.0_  
_Last updated: January 2025_  
_Package: @plexica/event-bus_
