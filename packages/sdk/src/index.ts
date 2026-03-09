// File: packages/sdk/src/index.ts

/**
 * @plexica/sdk — Main Entry Point
 *
 * Public API for the Plexica Plugin SDK.
 */

// ---------------------------------------------------------------------------
// Core classes
// ---------------------------------------------------------------------------

export { ApiClient } from './api-client.js';
export type { ApiClientConfig } from './api-client.js';

export { EventClient } from './event-client.js';
export type { EventClientConfig } from './event-client.js';

export { ServiceClient } from './service-client.js';

export { SharedDataClient } from './shared-data.js';

export { PlexicaPlugin, WorkspaceAwarePlugin } from './plugin-base.js';

// Extension Points — DataExtensionClient (Spec 013, T013-10, FR-029)
export { DataExtensionClient } from './data-extension-client.js';
export type {
  DataExtensionHandler,
  DataExtensionRequest,
  DataExtensionResponse,
  DataExtensionError,
} from './data-extension-client.js';

// ---------------------------------------------------------------------------
// SDK types
// ---------------------------------------------------------------------------

export type {
  PluginContext,
  PluginConfig,
  PluginLifecycle,
  ServiceEndpoint,
  ServiceDefinition,
  DiscoveredService,
  ApiRequestOptions,
  ApiResponse,
  SetSharedDataOptions,
  SharedDataEntry,
  PublishEventOptions,
  SubscribeEventOptions,
  EventHandler,
  PluginApiCallRequest,
} from './types.js';

// ---------------------------------------------------------------------------
// Re-exported domain types from @plexica/types
// ---------------------------------------------------------------------------

export type {
  DomainEvent,
  EventMetadata,
  PluginManifest,
  PluginRoute,
  PluginMenuItem,
  PluginProps,
  PluginStatus,
  TenantPluginStatus,
  PluginEntity,
  TenantPlugin,
  Tenant,
  TenantContext,
  User,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
  // Extension Points (Spec 013)
  ExtensionSlotType,
  ExtensionSlotDeclaration,
  ContributionDeclaration,
  ExtensibleEntityDeclaration,
  DataExtensionDeclaration,
  ResolvedContribution,
  AggregatedExtensionData,
  DependentsResult,
  ContributionValidationStatus,
  ExtensionSlotFilters,
  ExtensionContributionFilters,
} from './types.js';

// ---------------------------------------------------------------------------
// Re-export PluginEventClient from event-bus for advanced usage
// ---------------------------------------------------------------------------

export { PluginEventClient } from '@plexica/event-bus';
export type { EventBusService, EventBusConfig } from '@plexica/event-bus';

// ---------------------------------------------------------------------------
// Decorators
// ---------------------------------------------------------------------------

export * from './decorators/index.js';
