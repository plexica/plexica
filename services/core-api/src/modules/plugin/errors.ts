// errors.ts
// Plugin-specific AppError subclasses.

import { AppError } from '../../lib/app-error-base.js';

export class PluginNotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = 'PLUGIN_NOT_FOUND';

  constructor(slug: string) {
    super(`Plugin "${slug}" not found`);
  }
}

export class PluginConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = 'PLUGIN_CONFLICT';

  constructor(message: string) {
    super(message);
  }
}

export class PluginValidationError extends AppError {
  readonly statusCode = 400;
  readonly code = 'PLUGIN_VALIDATION_ERROR';

  constructor(message: string) {
    super(message);
  }
}

export class PluginInstallError extends AppError {
  readonly statusCode = 500;
  readonly code = 'PLUGIN_INSTALL_ERROR';

  constructor(message: string) {
    super(message);
  }
}

export class PluginBackendUnreachableError extends AppError {
  readonly statusCode = 503;
  readonly code = 'PLUGIN_BACKEND_UNREACHABLE';

  constructor(installId: string) {
    super(`Plugin ${installId} backend is unreachable`);
  }
}
