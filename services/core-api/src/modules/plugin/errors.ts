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

export class PluginReviewRequiredError extends AppError {
  readonly statusCode = 403;
  readonly code = 'REVIEW_REQUIRED';

  constructor() {
    super('Plugin must be approved before publishing');
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

export class WorkspaceVerifyError extends AppError {
  readonly statusCode = 503;
  readonly code = 'WORKSPACE_VERIFY_FAILED';

  constructor() {
    super('Could not verify workspace access');
  }
}
