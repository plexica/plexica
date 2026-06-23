// app-error.ts
// Typed application error hierarchy for core-api.
// All middleware and route handlers throw these — never raw Error objects.
//
// AppError base class lives in app-error-base.ts to prevent a circular ESM
// import cycle with app-error-domain.ts.
// Domain-specific errors (workspace, member, invitation, file, ABAC) live in
// app-error-domain.ts and are re-exported here for backwards compatibility.

export { AppError } from './app-error-base.js';
import { AppError } from './app-error-base.js';

export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly code = 'UNAUTHORIZED';

  constructor(message = 'Authentication required') {
    super(message);
  }
}

export class InvalidTenantContextError extends AppError {
  readonly statusCode = 400;
  readonly code = 'INVALID_TENANT_CONTEXT';

  constructor(message = 'Invalid or missing tenant context') {
    super(message);
  }
}

export class InvalidSlugError extends AppError {
  readonly statusCode = 400;
  readonly code = 'INVALID_SLUG';

  constructor(message = 'Invalid tenant slug format') {
    super(message);
  }
}

export class ValidationError extends AppError {
  readonly statusCode = 422;
  readonly code = 'VALIDATION_ERROR';

  constructor(message = 'Validation failed') {
    super(message);
  }
}

export class AlreadyExistsError extends AppError {
  readonly statusCode = 409;
  readonly code = 'ALREADY_EXISTS';

  constructor(message = 'Resource already exists') {
    super(message);
  }
}

export class ProvisioningFailedError extends AppError {
  readonly statusCode = 500;
  readonly code = 'PROVISIONING_FAILED';

  constructor(message = 'Tenant provisioning failed') {
    super(message);
  }
}

export class TenantRequiredError extends AppError {
  readonly statusCode = 400;
  readonly code = 'TENANT_REQUIRED';

  constructor(message = 'Tenant slug is required') {
    super(message);
  }
}

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';

  // H-2: Used for realm-to-tenant mismatch — returns 404 per AC-2 to avoid
  // information leakage about which tenants / realms are valid.
  constructor(message = 'Not found') {
    super(message);
  }
}

export class KeycloakError extends AppError {
  readonly statusCode = 502;
  readonly code = 'KEYCLOAK_ERROR';
  constructor(message = 'Keycloak service error') {
    super(message);
  }
}

// Re-export all domain errors for backwards compatibility.
// Consumers import from this single entrypoint.
export {
  WorkspaceNotFoundError,
  WorkspaceArchivedError,
  CircularReparentError,
  MaxHierarchyDepthError,
  WorkspaceSlugConflictError,
  MemberAlreadyExistsError,
  MemberNotFoundError,
  InvitationNotFoundError,
  InvitationExpiredError,
  InvitationAlreadyAcceptedError,
  UserNotFoundError,
  FileTooLargeError,
  InvalidFileTypeError,
  ForbiddenError,
  VersionConflictError,
  WorkspaceNotArchivedError,
} from './app-error-domain.js';
