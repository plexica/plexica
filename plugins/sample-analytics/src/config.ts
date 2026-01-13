/**
 * Configuration schema and validation for the Sample Analytics Plugin
 */

export interface AnalyticsConfig {
  apiKey: string;
  trackingEnabled: boolean;
  reportingInterval: number;
  dataRetentionDays: number;
}

/**
 * Validate plugin configuration
 */
export function validateConfig(config: Partial<AnalyticsConfig>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate apiKey
  if (!config.apiKey) {
    errors.push('apiKey is required');
  } else if (config.apiKey.length < 10 || config.apiKey.length > 100) {
    errors.push('apiKey must be between 10 and 100 characters');
  } else if (!/^[a-zA-Z0-9_-]+$/.test(config.apiKey)) {
    errors.push('apiKey can only contain alphanumeric characters, hyphens, and underscores');
  }

  // Validate reportingInterval
  if (
    config.reportingInterval !== undefined &&
    (config.reportingInterval < 1 || config.reportingInterval > 168)
  ) {
    errors.push('reportingInterval must be between 1 and 168 hours');
  }

  // Validate dataRetentionDays
  if (
    config.dataRetentionDays !== undefined &&
    (config.dataRetentionDays < 7 || config.dataRetentionDays > 365)
  ) {
    errors.push('dataRetentionDays must be between 7 and 365 days');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get default configuration
 */
export function getDefaultConfig(): AnalyticsConfig {
  return {
    apiKey: '',
    trackingEnabled: true,
    reportingInterval: 24,
    dataRetentionDays: 90,
  };
}
