// apps/core-api/src/modules/workspace/utils/error-formatter.ts
//
// Workspace-specific error codes and error formatting utility.
// Constitution Art. 6.2 compliance: { error: { code, message, details? } }
//
// Design approach:
//   Route handlers call `throw WorkspaceError(...)` and the global
//   Fastify error handler (setupErrorHandler) catches it, producing
//   the Constitution-compliant response. This utility provides:
//   1. Typed error codes (from Spec 009 Section 6.5)
//   2. A WorkspaceError class extending Error with statusCode + code
//   3. A mapServiceError() helper that classifies service exceptions

/**
 * Workspace error codes defined in Spec 009 Section 6.5.
 * Each code maps to a specific HTTP status and error condition.
 */
export enum WorkspaceErrorCode {
  /** 404 — Workspace does not exist in tenant */
  WORKSPACE_NOT_FOUND = 'WORKSPACE_NOT_FOUND',
  /** 409 — Slug already exists in tenant / under parent */
  WORKSPACE_SLUG_CONFLICT = 'WORKSPACE_SLUG_CONFLICT',
  /** 400 — Cannot delete workspace with existing teams */
  WORKSPACE_HAS_TEAMS = 'WORKSPACE_HAS_TEAMS',
  /** 400 — Cannot delete workspace with existing child workspaces */
  WORKSPACE_HAS_CHILDREN = 'WORKSPACE_HAS_CHILDREN',
  /** 404 — Membership does not exist */
  MEMBER_NOT_FOUND = 'MEMBER_NOT_FOUND',
  /** 409 — User is already a member */
  MEMBER_ALREADY_EXISTS = 'MEMBER_ALREADY_EXISTS',
  /** 400 — Cannot remove/demote the last ADMIN */
  LAST_ADMIN_VIOLATION = 'LAST_ADMIN_VIOLATION',
  /** 403 — User lacks required workspace role */
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  /** 400 — Request body validation failed */
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  /** 409 — Resource already linked to workspace */
  RESOURCE_ALREADY_SHARED = 'RESOURCE_ALREADY_SHARED',
  /** 403 — Cross-workspace sharing disabled */
  SHARING_DISABLED = 'SHARING_DISABLED',
  // ── Hierarchy error codes (Spec 011) ──────────────────────────────────────
  /** 400 — Proposed nesting would exceed the maximum allowed depth */
  HIERARCHY_DEPTH_EXCEEDED = 'HIERARCHY_DEPTH_EXCEEDED',
  /** 404 — Specified parent workspace does not exist in the tenant */
  PARENT_WORKSPACE_NOT_FOUND = 'PARENT_WORKSPACE_NOT_FOUND',
  /** 403 — Caller is not ADMIN of the specified parent workspace */
  PARENT_PERMISSION_DENIED = 'PARENT_PERMISSION_DENIED',
  /** 409 — Re-parenting would create a cycle in the hierarchy */
  REPARENT_CYCLE_DETECTED = 'REPARENT_CYCLE_DETECTED',
}

/**
 * HTTP status code mapping for each workspace error code.
 */
const ERROR_STATUS_MAP: Record<WorkspaceErrorCode, number> = {
  [WorkspaceErrorCode.WORKSPACE_NOT_FOUND]: 404,
  [WorkspaceErrorCode.WORKSPACE_SLUG_CONFLICT]: 409,
  [WorkspaceErrorCode.WORKSPACE_HAS_TEAMS]: 400,
  [WorkspaceErrorCode.WORKSPACE_HAS_CHILDREN]: 400,
  [WorkspaceErrorCode.MEMBER_NOT_FOUND]: 404,
  [WorkspaceErrorCode.MEMBER_ALREADY_EXISTS]: 409,
  [WorkspaceErrorCode.LAST_ADMIN_VIOLATION]: 400,
  [WorkspaceErrorCode.INSUFFICIENT_PERMISSIONS]: 403,
  [WorkspaceErrorCode.VALIDATION_ERROR]: 400,
  [WorkspaceErrorCode.RESOURCE_ALREADY_SHARED]: 409,
  [WorkspaceErrorCode.SHARING_DISABLED]: 403,
  [WorkspaceErrorCode.HIERARCHY_DEPTH_EXCEEDED]: 400,
  [WorkspaceErrorCode.PARENT_WORKSPACE_NOT_FOUND]: 404,
  [WorkspaceErrorCode.PARENT_PERMISSION_DENIED]: 403,
  [WorkspaceErrorCode.REPARENT_CYCLE_DETECTED]: 409,
};

/**
 * Custom error class for workspace-specific errors.
 *
 * Extends Error with `statusCode` and `code` properties so that
 * Fastify's global error handler can extract the HTTP status and
 * error code without additional mapping.
 *
 * Usage:
 *   throw new WorkspaceError(
 *     WorkspaceErrorCode.WORKSPACE_NOT_FOUND,
 *     'Workspace not found in tenant',
 *     { workspaceId }
 *   );
 */
export class WorkspaceError extends Error {
  public readonly statusCode: number;
  public readonly code: WorkspaceErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: WorkspaceErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'WorkspaceError';
    this.code = code;
    this.statusCode = ERROR_STATUS_MAP[code];
    this.details = details;
  }
}

/**
 * Build a Constitution Art. 6.2 compliant error response object.
 *
 * Useful when you need to send an error response directly (e.g.,
 * from a preHandler hook) rather than throwing an error.
 */
export function workspaceError(
  code: WorkspaceErrorCode,
  message: string,
  details?: Record<string, unknown>
) {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}

/**
 * Pattern matchers for classifying service-layer exceptions into
 * workspace error codes.
 *
 * The workspace service throws plain `Error` instances with message
 * strings. This mapper inspects the message to determine the
 * appropriate WorkspaceErrorCode and HTTP status.
 */
interface ErrorMapping {
  /** Substring or regex to match against error.message */
  pattern: string | RegExp;
  /** Workspace error code to assign */
  code: WorkspaceErrorCode;
}

const SERVICE_ERROR_MAPPINGS: ErrorMapping[] = [
  { pattern: 'already exists', code: WorkspaceErrorCode.WORKSPACE_SLUG_CONFLICT },
  { pattern: 'already a member', code: WorkspaceErrorCode.MEMBER_ALREADY_EXISTS },
  { pattern: 'existing teams', code: WorkspaceErrorCode.WORKSPACE_HAS_TEAMS },
  { pattern: 'existing children', code: WorkspaceErrorCode.WORKSPACE_HAS_CHILDREN },
  { pattern: 'last admin', code: WorkspaceErrorCode.LAST_ADMIN_VIOLATION },
  { pattern: /not found/i, code: WorkspaceErrorCode.WORKSPACE_NOT_FOUND },
  { pattern: /member.*not found/i, code: WorkspaceErrorCode.MEMBER_NOT_FOUND },
  { pattern: 'permission', code: WorkspaceErrorCode.INSUFFICIENT_PERMISSIONS },
  { pattern: /sharing.*disabled/i, code: WorkspaceErrorCode.SHARING_DISABLED },
  { pattern: 'already shared', code: WorkspaceErrorCode.RESOURCE_ALREADY_SHARED },
  // Hierarchy-specific patterns (Spec 011)
  { pattern: /maximum hierarchy depth/i, code: WorkspaceErrorCode.HIERARCHY_DEPTH_EXCEEDED },
  { pattern: /parent workspace.*not found/i, code: WorkspaceErrorCode.PARENT_WORKSPACE_NOT_FOUND },
  { pattern: /not admin of parent/i, code: WorkspaceErrorCode.PARENT_PERMISSION_DENIED },
  { pattern: /cycle/i, code: WorkspaceErrorCode.REPARENT_CYCLE_DETECTED },
];

/**
 * Map a service-layer error to a WorkspaceError.
 *
 * Inspects the error message against known patterns and returns a
 * WorkspaceError with the appropriate code and HTTP status. If no
 * pattern matches, returns null (caller should re-throw as 500).
 *
 * @param error - The caught error from the workspace service
 * @returns WorkspaceError if a pattern matches, null otherwise
 */
export function mapServiceError(error: unknown): WorkspaceError | null {
  if (!(error instanceof Error)) return null;

  const message = error.message;

  // Check member-specific patterns first (more specific before general)
  if (/member.*not found/i.test(message)) {
    return new WorkspaceError(WorkspaceErrorCode.MEMBER_NOT_FOUND, message);
  }

  for (const mapping of SERVICE_ERROR_MAPPINGS) {
    const matches =
      typeof mapping.pattern === 'string'
        ? message.toLowerCase().includes(mapping.pattern.toLowerCase())
        : mapping.pattern.test(message);

    if (matches) {
      return new WorkspaceError(mapping.code, message);
    }
  }

  return null;
}

/**
 * Get the HTTP status code for a workspace error code.
 */
export function getStatusForCode(code: WorkspaceErrorCode): number {
  return ERROR_STATUS_MAP[code];
}
