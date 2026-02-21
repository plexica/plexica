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
//   4. A handleServiceError() helper shared across route files (M5)

import type { FastifyInstance, FastifyReply } from 'fastify';

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
  /** 409 — Cannot delete workspace with existing child workspaces */
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
  // ── Template & Plugin error codes (Spec 011 Phase 2) ──────────────────────
  /** 404 — Template does not exist */
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  /** 400 — Template references a plugin not installed by the tenant */
  TEMPLATE_PLUGIN_NOT_INSTALLED = 'TEMPLATE_PLUGIN_NOT_INSTALLED',
  /** 400 — Template item limit exceeded (max 50) */
  TEMPLATE_ITEM_LIMIT_EXCEEDED = 'TEMPLATE_ITEM_LIMIT_EXCEEDED',
  /** 400 — Workspace plugin is already enabled */
  WORKSPACE_PLUGIN_EXISTS = 'WORKSPACE_PLUGIN_EXISTS',
  /** 404 — Workspace plugin record not found */
  WORKSPACE_PLUGIN_NOT_FOUND = 'WORKSPACE_PLUGIN_NOT_FOUND',
  /** 400 — Plugin is not enabled at the tenant level */
  PLUGIN_NOT_TENANT_ENABLED = 'PLUGIN_NOT_TENANT_ENABLED',
  /** 400 — Workspace creation blocked by a plugin before_create hook */
  HOOK_REJECTED_CREATION = 'HOOK_REJECTED_CREATION',
}

/**
 * HTTP status code mapping for each workspace error code.
 */
const ERROR_STATUS_MAP: Record<WorkspaceErrorCode, number> = {
  [WorkspaceErrorCode.WORKSPACE_NOT_FOUND]: 404,
  [WorkspaceErrorCode.WORKSPACE_SLUG_CONFLICT]: 409,
  [WorkspaceErrorCode.WORKSPACE_HAS_TEAMS]: 400,
  [WorkspaceErrorCode.WORKSPACE_HAS_CHILDREN]: 409,
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
  [WorkspaceErrorCode.TEMPLATE_NOT_FOUND]: 404,
  [WorkspaceErrorCode.TEMPLATE_PLUGIN_NOT_INSTALLED]: 400,
  [WorkspaceErrorCode.TEMPLATE_ITEM_LIMIT_EXCEEDED]: 400,
  [WorkspaceErrorCode.WORKSPACE_PLUGIN_EXISTS]: 409,
  [WorkspaceErrorCode.WORKSPACE_PLUGIN_NOT_FOUND]: 404,
  [WorkspaceErrorCode.PLUGIN_NOT_TENANT_ENABLED]: 400,
  [WorkspaceErrorCode.HOOK_REJECTED_CREATION]: 400,
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
 * Inspects the error's `.code` property first (set by hierarchy and resource
 * service methods via `(err as NodeJS.ErrnoException).code = '...'`), then
 * falls back to message-pattern matching for services that throw plain Errors.
 *
 * If no pattern matches, returns null (caller should re-throw as 500).
 *
 * @param error - The caught error from the workspace service
 * @returns WorkspaceError if a pattern matches, null otherwise
 */

/**
 * Map from the `.code` string set on plain Error objects (by hierarchy /
 * resource services) to a WorkspaceErrorCode.  Only codes that are actually
 * used by the service layer need to be listed here.
 */
const ERROR_CODE_MAP: Record<string, WorkspaceErrorCode> = {
  HIERARCHY_DEPTH_EXCEEDED: WorkspaceErrorCode.HIERARCHY_DEPTH_EXCEEDED,
  PARENT_WORKSPACE_NOT_FOUND: WorkspaceErrorCode.PARENT_WORKSPACE_NOT_FOUND,
  PARENT_PERMISSION_DENIED: WorkspaceErrorCode.PARENT_PERMISSION_DENIED,
  REPARENT_CYCLE_DETECTED: WorkspaceErrorCode.REPARENT_CYCLE_DETECTED,
  WORKSPACE_SLUG_CONFLICT: WorkspaceErrorCode.WORKSPACE_SLUG_CONFLICT,
  SHARING_DISABLED: WorkspaceErrorCode.SHARING_DISABLED,
  RESOURCE_ALREADY_SHARED: WorkspaceErrorCode.RESOURCE_ALREADY_SHARED,
  RESOURCE_NOT_FOUND: WorkspaceErrorCode.WORKSPACE_NOT_FOUND,
};

export function mapServiceError(error: unknown): WorkspaceError | null {
  if (!(error instanceof Error)) return null;

  const message = error.message;

  // ── 1. Check .code property first (set by hierarchy / resource services) ──
  const errCode = (error as NodeJS.ErrnoException).code;
  if (errCode && errCode in ERROR_CODE_MAP) {
    return new WorkspaceError(ERROR_CODE_MAP[errCode], message);
  }

  // ── 2. Check member-specific patterns first (more specific before general) ──
  if (/member.*not found/i.test(message)) {
    return new WorkspaceError(WorkspaceErrorCode.MEMBER_NOT_FOUND, message);
  }

  // ── 3. Fall back to message-pattern matching ──────────────────────────────
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

/**
 * Map a caught service error and re-throw it as a WorkspaceError so that
 * Fastify's global error handler produces a Constitution Art. 6.2 response.
 *
 * If the error is already a WorkspaceError it is re-thrown as-is.
 * If the message matches a known pattern it is mapped to the appropriate
 * WorkspaceError and thrown.
 * Otherwise the original error is re-thrown so Fastify returns a 500.
 *
 * This function always throws — callers do not need to return its result.
 *
 * Usage in route handlers:
 *   } catch (error) {
 *     handleServiceError(error, reply);
 *   }
 *
 * NOTE: The `reply` parameter is retained for API compatibility but is no
 * longer used to send the response directly. Sending is handled by the global
 * Fastify error handler, which prevents the double-response crash that would
 * occur if reply.send() were called inside a catch block and Fastify also
 * tried to handle the re-thrown error (Constitution Art. 6.1).
 */
export function handleServiceError(error: unknown, _reply: FastifyReply): never {
  if (error instanceof WorkspaceError) {
    throw error;
  }
  const mapped = mapServiceError(error);
  if (mapped) {
    throw mapped;
  }
  throw error;
}

/**
 * Register a local Fastify error handler that produces Constitution Art. 6.2
 * compliant responses for WorkspaceError instances.
 *
 * IMPORTANT — Fastify v5 child scope issue:
 *   When route plugins are registered via `app.register(fn, { prefix })`, Fastify
 *   creates a child encapsulation scope that captures the error handler **at
 *   registration time** — before `setupErrorHandler(app)` is called at the end
 *   of `buildTestApp()` / `server.ts`. This means the global custom handler is
 *   NOT active inside route plugin scopes.
 *
 *   Fix: call `registerWorkspaceErrorHandler(fastify)` as the **first line**
 *   inside every route plugin function that throws WorkspaceError.
 *
 * Usage:
 *   export async function myRoutes(fastify: FastifyInstance) {
 *     registerWorkspaceErrorHandler(fastify);
 *     // ... route definitions
 *   }
 */
export function registerWorkspaceErrorHandler(fastify: FastifyInstance): void {
  fastify.setErrorHandler((error, _request, reply) => {
    // WorkspaceError: use its .code and .statusCode directly
    if (error instanceof WorkspaceError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      });
    }

    // Fastify validation errors (schema validation, FST_ERR_*)
    const err = error as { statusCode?: number; message?: string };
    const statusCode = err.statusCode ?? 500;
    const message = err.message ?? 'Unknown error';

    if (statusCode === 400) {
      return reply.status(400).send({
        error: {
          code: 'BAD_REQUEST',
          message,
        },
      });
    }
    if (statusCode === 401) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message,
        },
      });
    }
    if (statusCode === 403) {
      return reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message,
        },
      });
    }

    // All other errors: 500
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  });
}
