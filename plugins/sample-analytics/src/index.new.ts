/**
 * Sample Analytics Plugin (Updated for M2.1 Event System)
 *
 * This is a demonstration plugin that shows how to:
 * - Use @EventHandler decorators for subscribing to events
 * - Use @EventPublisher decorators for publishing plugin events
 * - Integrate with the new PluginEventClient
 * - Track user activity and generate analytics data
 * - Expose custom endpoints
 */

import {
  EventHandler,
  EventPublisher,
  initializeEventHandlers,
  cleanupEventHandlers,
  type DomainEvent,
  type PluginEventClient,
} from '@plexica/event-bus';

interface AnalyticsConfig {
  apiKey: string;
  trackingEnabled: boolean;
  reportingInterval: number;
  dataRetentionDays: number;
}

interface PluginContext {
  tenantId: string;
  config: AnalyticsConfig;
  logger: any;
  events: PluginEventClient; // New: Event client for plugin
}

/**
 * User login event data
 */
interface UserLoginData {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

/**
 * Analytics summary event data (published by plugin)
 */
interface AnalyticsSummaryData {
  eventType: 'login' | 'logout' | 'api_request';
  count: number;
  period: string;
  timestamp: string;
}

/**
 * Sample Analytics Service
 *
 * Uses the new decorator-based event system
 */
class SampleAnalyticsService {
  private logger: any;
  private config: AnalyticsConfig;
  private eventCounts = {
    login: 0,
    logout: 0,
    api_request: 0,
  };

  constructor(private context: PluginContext) {
    this.logger = context.logger;
    this.config = context.config;
  }

  /**
   * Handle user login events using @EventHandler decorator
   * Automatically subscribes to core.user.login events
   */
  @EventHandler({
    eventName: 'core.user.login',
    groupId: 'sample-analytics-login-tracker',
  })
  async onUserLogin(event: DomainEvent<UserLoginData>): Promise<void> {
    if (!this.config.trackingEnabled) {
      return;
    }

    this.logger.info('[sample-analytics] User login tracked:', {
      userId: event.data.userId,
      timestamp: event.timestamp,
      ipAddress: event.data.ipAddress,
      tenantId: event.tenantId,
      workspaceId: event.workspaceId,
    });

    // Track count
    this.eventCounts.login++;

    // In a real plugin, you would:
    // 1. Store login event in database
    // 2. Update user session data
    // 3. Send to external analytics service (using apiKey)
    // 4. Trigger anomaly detection if needed

    // Publish summary every 100 logins
    if (this.eventCounts.login % 100 === 0) {
      await this.publishAnalyticsSummary('login', this.eventCounts.login);
    }
  }

  /**
   * Handle user logout events
   */
  @EventHandler({
    eventName: 'core.user.logout',
    groupId: 'sample-analytics-logout-tracker',
  })
  async onUserLogout(
    event: DomainEvent<{ userId: string; sessionDuration?: number }>
  ): Promise<void> {
    if (!this.config.trackingEnabled) {
      return;
    }

    this.logger.info('[sample-analytics] User logout tracked:', {
      userId: event.data.userId,
      timestamp: event.timestamp,
      sessionDuration: event.data.sessionDuration,
      tenantId: event.tenantId,
    });

    // Track count
    this.eventCounts.logout++;

    // In a real plugin, you would:
    // 1. Calculate session duration
    // 2. Store logout event
    // 3. Update session statistics
    // 4. Generate session summary
  }

  /**
   * Handle API request events
   */
  @EventHandler({
    eventName: 'core.api.request',
    groupId: 'sample-analytics-api-tracker',
  })
  async onApiRequest(
    event: DomainEvent<{
      method: string;
      path: string;
      userId?: string;
      responseTime?: number;
    }>
  ): Promise<void> {
    if (!this.config.trackingEnabled) {
      return;
    }

    // Track count
    this.eventCounts.api_request++;

    // Only log periodically to avoid spam
    if (this.eventCounts.api_request % 100 === 0) {
      this.logger.debug('[sample-analytics] API requests tracked:', {
        count: this.eventCounts.api_request,
        latestMethod: event.data.method,
        latestPath: event.data.path,
      });
    }

    // In a real plugin, you would:
    // 1. Store request metrics in time-series database
    // 2. Track API usage patterns
    // 3. Monitor performance trends
    // 4. Detect abuse or anomalies
  }

  /**
   * Publish analytics summary event
   * Uses @EventPublisher decorator to automatically publish events
   */
  @EventPublisher({
    eventName: 'analytics.summary.generated',
    compress: true, // Enable compression for large payloads
  })
  async publishAnalyticsSummary(
    eventType: 'login' | 'logout' | 'api_request',
    count: number
  ): Promise<AnalyticsSummaryData> {
    const summary: AnalyticsSummaryData = {
      eventType,
      count,
      period: 'hourly',
      timestamp: new Date().toISOString(),
    };

    this.logger.info('[sample-analytics] Publishing summary:', summary);

    // Method body executes first, then decorator publishes the return value
    return summary;
  }

  /**
   * Get current analytics statistics
   */
  getStats() {
    return {
      ...this.eventCounts,
      trackingEnabled: this.config.trackingEnabled,
    };
  }
}

// Plugin instance (singleton per tenant)
let serviceInstance: SampleAnalyticsService | null = null;

/**
 * Plugin initialization
 * Called when the plugin is installed and activated
 */
export async function initialize(context: PluginContext): Promise<void> {
  const { tenantId, config, logger, events } = context;

  logger.info(`[sample-analytics] Initializing for tenant: ${tenantId} with config:`, {
    trackingEnabled: config.trackingEnabled,
    reportingInterval: config.reportingInterval,
    dataRetentionDays: config.dataRetentionDays,
  });

  // Create service instance
  serviceInstance = new SampleAnalyticsService(context);

  // Initialize event handlers using the new decorator system
  await initializeEventHandlers(serviceInstance, events);

  logger.info('[sample-analytics] Event handlers initialized successfully');

  // In a real plugin, you would also:
  // 1. Set up database tables for analytics
  // 2. Initialize any external services
  // 3. Schedule periodic report generation
  // 4. Set up data retention policies
}

/**
 * Plugin cleanup
 * Called when the plugin is deactivated or uninstalled
 */
export async function cleanup(context: PluginContext): Promise<void> {
  const { tenantId, logger, events } = context;

  logger.info(`[sample-analytics] Cleaning up for tenant: ${tenantId}`);

  // Cleanup event handlers
  if (serviceInstance) {
    await cleanupEventHandlers(serviceInstance, events);
    serviceInstance = null;
  }

  logger.info('[sample-analytics] Event handlers cleaned up successfully');

  // In a real plugin, you would also:
  // 1. Cancel scheduled jobs
  // 2. Close external connections
  // 3. Optionally clean up data (based on uninstall vs deactivate)
}

/**
 * Export API endpoints (for REST API integration)
 */
export const endpoints = {
  /**
   * GET /stats - Get current analytics statistics
   */
  'GET /stats': async (context: PluginContext) => {
    if (!serviceInstance) {
      throw new Error('Analytics service not initialized');
    }

    return {
      success: true,
      data: serviceInstance.getStats(),
    };
  },
};

/**
 * Legacy hooks export for backward compatibility
 * (can be removed once all plugins are migrated to new event system)
 */
export const hooks = {
  'user.login': async (data: any, context: PluginContext) => {
    // Redirect to new event system
    context.logger.warn(
      '[sample-analytics] Legacy hook called, consider migrating to event system'
    );
  },
};
