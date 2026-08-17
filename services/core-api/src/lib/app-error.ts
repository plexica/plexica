// app-error.ts
// Typed application error hierarchy for core-api.
// All middleware and route handlers throw these — never raw Error objects.
//
// Simple subclasses are declared with the defineError factory (one statement
// each). Errors with extra constructor fields (TenantConflictError) or a
// parameterized code (ServiceUnavailableError) are hand-written at the bottom.
// AppError and defineError live in app-error-base.ts (leaf module, no imports)
// to prevent circular ESM imports — modules/plugin/errors.ts imports AppError
// from there directly.

export { AppError } from './app-error-base.js';
import { AppError, defineError } from './app-error-base.js';

export const UnauthorizedError = defineError('UNAUTHORIZED', 401, 'Authentication required');
export const InvalidTenantContextError = defineError(
  'INVALID_TENANT_CONTEXT',
  400,
  'Invalid or missing tenant context'
);
export const ValidationError = defineError('VALIDATION_ERROR', 422, 'Validation failed');
// S5-702: type-to-confirm deletion — confirmSlug must match tenant slug exactly.
export const ConfirmationRequiredError = defineError(
  'CONFIRMATION_REQUIRED',
  422,
  'Confirmation slug does not match tenant slug'
);
export const AlreadyExistsError = defineError('ALREADY_EXISTS', 409, 'Resource already exists');
export const ProvisioningFailedError = defineError(
  'PROVISIONING_FAILED',
  500,
  'Tenant provisioning failed'
);
export const TenantRequiredError = defineError('TENANT_REQUIRED', 400, 'Tenant slug is required');
// H-2: Used for realm-to-tenant mismatch — returns 404 per AC-2 to avoid
// information leakage about which tenants / realms are valid.
export const NotFoundError = defineError('NOT_FOUND', 404, 'Not found');
export const KeycloakError = defineError('KEYCLOAK_ERROR', 502, 'Keycloak service error');
// ADR-022 Decision 1: non-admin requests to inactive (non-deleted) tenants are
// rejected with a specific 403 code. Distinct from INVALID_TENANT_CONTEXT (400)
// which is reserved for unknown / deleted tenants to prevent enumeration.
export const TenantSuspendedError = defineError('TENANT_SUSPENDED', 403, 'Tenant is suspended');
export const TenantPendingDeletionError = defineError(
  'TENANT_PENDING_DELETION',
  403,
  'Tenant is pending deletion'
);
export const ConflictError = defineError('CONFLICT', 409, 'Version mismatch');

// ── Domain errors (workspace, member, invitation, user, file) ───────────────

export const WorkspaceNotFoundError = defineError(
  'WORKSPACE_NOT_FOUND',
  404,
  'Workspace not found'
);
export const WorkspaceArchivedError = defineError(
  'WORKSPACE_ARCHIVED',
  409,
  'Workspace is archived'
);
export const CircularReparentError = defineError(
  'CIRCULAR_REPARENT',
  422,
  'Cannot move workspace: circular hierarchy'
);
export const MaxHierarchyDepthError = defineError(
  'MAX_HIERARCHY_DEPTH',
  422,
  'Maximum workspace hierarchy depth exceeded'
);
export const WorkspaceSlugConflictError = defineError(
  'WORKSPACE_SLUG_CONFLICT',
  409,
  'Workspace slug already exists'
);
export const MemberAlreadyExistsError = defineError(
  'MEMBER_ALREADY_EXISTS',
  409,
  'User is already a member of this workspace'
);
export const MemberNotFoundError = defineError(
  'MEMBER_NOT_FOUND',
  404,
  'Workspace member not found'
);
export const InvitationNotFoundError = defineError(
  'INVITATION_NOT_FOUND',
  404,
  'Invitation not found'
);
export const InvitationExpiredError = defineError(
  'INVITATION_EXPIRED',
  410,
  'Invitation has expired'
);
export const InvitationAlreadyAcceptedError = defineError(
  'INVITATION_ALREADY_ACCEPTED',
  409,
  'Invitation has already been accepted'
);
export const UserNotFoundError = defineError('USER_NOT_FOUND', 404, 'User not found');
export const FileTooLargeError = defineError(
  'FILE_TOO_LARGE',
  413,
  'File exceeds maximum allowed size'
);
export const InvalidFileTypeError = defineError(
  'INVALID_FILE_TYPE',
  415,
  'File type is not allowed'
);
export const ForbiddenError = defineError('FORBIDDEN', 403, 'Access denied');
export const VersionConflictError = defineError(
  'VERSION_CONFLICT',
  409,
  'Version conflict — resource was modified by another request'
);
export const WorkspaceNotArchivedError = defineError(
  'WORKSPACE_NOT_ARCHIVED',
  400,
  'Workspace is not archived'
);

// ── Hand-written errors (extra fields / parameterized code) ─────────────────

// Loki / external log aggregation backend not configured or unreachable.
// Used by logs-query.service (Spec 005, S5-A00). `code` is parameterized so
// the service can distinguish SERVICE_UNAVAILABLE from LOG_QUERY_TIMEOUT
// while sharing the same 503 status and error shape.
export class ServiceUnavailableError extends AppError {
  readonly statusCode = 503;
  readonly code: string;

  constructor(message = 'Service unavailable', code = 'SERVICE_UNAVAILABLE') {
    super(message);
    this.code = code;
  }
}

export type TenantConflictType =
  'tenant_slug_exists' | 'schema_exists' | 'realm_exists' | 'bucket_exists';

export class TenantConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';
  readonly conflictType: TenantConflictType;

  constructor(conflictType: TenantConflictType, message: string) {
    super(message);
    this.conflictType = conflictType;
  }
}
