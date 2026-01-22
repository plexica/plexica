# Sample Analytics Plugin - Event System Migration Guide

## Overview

This plugin has been updated to use the new M2.1 Event System with decorators and `PluginEventClient`.

## What Changed

### Before (Legacy Hook System)

```typescript
export const hooks = {
  'user.login': async (data: any, context: PluginContext) => {
    // Handle event
  },
};
```

### After (New Event System)

```typescript
class SampleAnalyticsService {
  @EventHandler({
    eventName: 'core.user.login',
    groupId: 'sample-analytics-login-tracker',
  })
  async onUserLogin(event: DomainEvent<UserLoginData>) {
    // Handle event with full type safety
  }
}
```

## Key Features

### 1. Type-Safe Event Handlers with Decorators

```typescript
@EventHandler({
  eventName: 'core.user.login',
  groupId: 'sample-analytics-login-tracker',
})
async onUserLogin(event: DomainEvent<UserLoginData>): Promise<void> {
  // Automatically subscribed when plugin initializes
  // Full tenant/workspace context available in event
}
```

### 2. Event Publishing with Decorators

```typescript
@EventPublisher({
  eventName: 'analytics.summary.generated',
  compress: true,
})
async publishAnalyticsSummary(
  eventType: string,
  count: number
): Promise<AnalyticsSummaryData> {
  // Method executes, then return value is automatically published as event
  return { eventType, count, ... };
}
```

### 3. Automatic Initialization/Cleanup

```typescript
export async function initialize(context: PluginContext): Promise<void> {
  serviceInstance = new SampleAnalyticsService(context);

  // Auto-subscribes all @EventHandler decorated methods
  await initializeEventHandlers(serviceInstance, context.events);
}

export async function cleanup(context: PluginContext): Promise<void> {
  // Auto-unsubscribes all event handlers
  await cleanupEventHandlers(serviceInstance, context.events);
}
```

## Event Flow

### Subscribing to Core Events

```
Core System → Redpanda → EventBus → Plugin Event Handler
  (e.g., user logs in)
```

### Publishing Plugin Events

```
Plugin Method → @EventPublisher → Redpanda → Other Subscribers
  (e.g., analytics summary)
```

## Benefits

1. **Type Safety**: Full TypeScript support with typed event payloads
2. **Tenant Isolation**: Automatic tenant/workspace filtering
3. **Declarative**: Decorators make event handling intent clear
4. **Fault Tolerant**: Circuit breaker, retries, DLQ support
5. **High Performance**: Batch publishing, compression, consumer groups
6. **Easy Testing**: Decorators can be tested in isolation

## Migration Checklist

- [x] Convert hook handlers to class methods
- [x] Add @EventHandler decorators
- [x] Add @EventPublisher for plugin events
- [x] Update initialize() to call initializeEventHandlers()
- [x] Update cleanup() to call cleanupEventHandlers()
- [x] Add PluginEventClient to PluginContext
- [ ] Update plugin.json to declare event subscriptions
- [ ] Add integration tests

## Files

- `src/index.new.ts` - **New implementation** with event system
- `src/index.ts` - Legacy implementation (for comparison)

## Next Steps

1. Test the new implementation
2. Update `plugin.json` manifest to declare events
3. Replace `src/index.ts` with `src/index.new.ts`
4. Remove legacy hooks export
5. Update documentation

## Event Topics Used

### Subscribed (Core Events)

- `core.user.login` - User login events
- `core.user.logout` - User logout events
- `core.api.request` - API request events

### Published (Plugin Events)

- `plugin.sample-analytics.analytics.summary.generated` - Analytics summaries (auto-prefixed)

## Configuration

No changes to existing configuration schema. The plugin still uses:

- `apiKey` - External analytics service API key
- `trackingEnabled` - Enable/disable tracking
- `reportingInterval` - Report generation interval
- `dataRetentionDays` - Data retention policy
