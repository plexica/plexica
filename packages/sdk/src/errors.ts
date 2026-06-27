// errors.ts
// SDK-specific error classes.

export class SdkNotInitializedError extends Error {
  readonly code = 'SDK_NOT_INITIALIZED';
  constructor() {
    super('PluginSDK not initialized. Call initialize() first.');
  }
}

export class EventSubscriptionError extends Error {
  readonly code = 'EVENT_SUBSCRIPTION_ERROR';
  constructor(pattern: string, cause: string) {
    super(`Failed to subscribe to event "${pattern}": ${cause}`);
  }
}

export class ApiCallError extends Error {
  readonly code = 'API_CALL_ERROR';
  constructor(method: string, path: string, status: number, body: string) {
    super(`API call ${method} ${path} failed with ${status}: ${body}`);
  }
}

export class DbAccessError extends Error {
  readonly code = 'DB_ACCESS_ERROR';
  constructor(message: string) {
    super(`Database access error: ${message}`);
  }
}
