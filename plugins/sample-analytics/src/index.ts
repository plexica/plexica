/**
 * Sample Analytics Plugin
 * 
 * This is a demonstration plugin that shows how to:
 * - Subscribe to system hooks
 * - Track user activity
 * - Generate analytics data
 * - Expose custom endpoints
 */

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
}

/**
 * Plugin initialization
 * Called when the plugin is installed and activated
 */
export async function initialize(context: PluginContext): Promise<void> {
  const { tenantId, config, logger } = context;
  
  logger.info(
    `[sample-analytics] Initializing for tenant: ${tenantId} with config:`,
    {
      trackingEnabled: config.trackingEnabled,
      reportingInterval: config.reportingInterval,
      dataRetentionDays: config.dataRetentionDays,
    }
  );

  // In a real plugin, you would:
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
  const { tenantId, logger } = context;
  
  logger.info(`[sample-analytics] Cleaning up for tenant: ${tenantId}`);

  // In a real plugin, you would:
  // 1. Cancel scheduled jobs
  // 2. Close external connections
  // 3. Optionally clean up data (based on uninstall vs deactivate)
}

/**
 * Export hook handlers for registration with the plugin system
 */
export const hooks = {
  /**
   * Handle user login events
   */
  'user.login': async (data: any, context: PluginContext) => {
    const { logger, config } = context;
    
    if (!config.trackingEnabled) {
      return;
    }

    logger.info('[sample-analytics] User login tracked:', {
      userId: data.userId,
      timestamp: new Date().toISOString(),
      ipAddress: data.ipAddress,
    });

    // In a real plugin, you would:
    // 1. Store login event in database
    // 2. Update user session data
    // 3. Send to external analytics service (using apiKey)
    // 4. Trigger anomaly detection if needed
  },

  /**
   * Handle user logout events
   */
  'user.logout': async (data: any, context: PluginContext) => {
    const { logger, config } = context;
    
    if (!config.trackingEnabled) {
      return;
    }

    logger.info('[sample-analytics] User logout tracked:', {
      userId: data.userId,
      timestamp: new Date().toISOString(),
      sessionDuration: data.sessionDuration,
    });

    // In a real plugin, you would:
    // 1. Calculate session duration
    // 2. Store logout event
    // 3. Update session statistics
    // 4. Generate session summary
  },

  /**
   * Handle API request events
   */
  'api.request': async (data: any, context: PluginContext) => {
    const { logger, config } = context;
    
    if (!config.trackingEnabled) {
      return;
    }

    // Only log periodically to avoid spam
    if (Math.random() < 0.1) {
      logger.debug('[sample-analytics] API request tracked:', {
        method: data.method,
        path: data.path,
        userId: data.userId,
        responseTime: data.responseTime,
      });
    }

    // In a real plugin, you would:
    // 1. Store request metrics
    // 2. Track API usage patterns
    // 3. Monitor performance
    // 4. Detect abuse or anomalies
  },
};
