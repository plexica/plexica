// app-error-domain.ts
// Domain-specific error classes — workspace, member, invitation, user, file, plugin.
// Kept separate from app-error.ts to stay within the 200-line file limit.
// All classes are re-exported from app-error.ts for backwards compatibility.

import { AppError } from './app-error.js';

export class WorkspaceNotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = 'WORKSPACE_NOT_FOUND';
  constructor(message = 'Workspace not found') {
    super(message);
  }
}

export class WorkspaceArchivedError extends AppError {
  readonly statusCode = 409;
  readonly code = 'WORKSPACE_ARCHIVED';
  constructor(message = 'Workspace is archived') {
    super(message);
  }
}

export class CircularReparentError extends AppError {
  readonly statusCode = 422;
  readonly code = 'CIRCULAR_REPARENT';
  constructor(message = 'Cannot move workspace: circular hierarchy') {
    super(message);
  }
}

export class MaxHierarchyDepthError extends AppError {
  readonly statusCode = 422;
  readonly code = 'MAX_HIERARCHY_DEPTH';
  constructor(message = 'Maximum workspace hierarchy depth exceeded') {
    super(message);
  }
}

export class WorkspaceSlugConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = 'WORKSPACE_SLUG_CONFLICT';
  constructor(message = 'Workspace slug already exists') {
    super(message);
  }
}

export class MemberAlreadyExistsError extends AppError {
  readonly statusCode = 409;
  readonly code = 'MEMBER_ALREADY_EXISTS';
  constructor(message = 'User is already a member of this workspace') {
    super(message);
  }
}

export class MemberNotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = 'MEMBER_NOT_FOUND';
  constructor(message = 'Workspace member not found') {
    super(message);
  }
}

export class InvitationNotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = 'INVITATION_NOT_FOUND';
  constructor(message = 'Invitation not found') {
    super(message);
  }
}

export class InvitationExpiredError extends AppError {
  readonly statusCode = 410;
  readonly code = 'INVITATION_EXPIRED';
  constructor(message = 'Invitation has expired') {
    super(message);
  }
}

export class InvitationAlreadyAcceptedError extends AppError {
  readonly statusCode = 409;
  readonly code = 'INVITATION_ALREADY_ACCEPTED';
  constructor(message = 'Invitation has already been accepted') {
    super(message);
  }
}

export class UserNotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = 'USER_NOT_FOUND';
  constructor(message = 'User not found') {
    super(message);
  }
}

export class FileTooLargeError extends AppError {
  readonly statusCode = 413;
  readonly code = 'FILE_TOO_LARGE';
  constructor(message = 'File exceeds maximum allowed size') {
    super(message);
  }
}

export class InvalidFileTypeError extends AppError {
  readonly statusCode = 415;
  readonly code = 'INVALID_FILE_TYPE';
  constructor(message = 'File type is not allowed') {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly code = 'FORBIDDEN';
  constructor(message = 'Access denied') {
    super(message);
  }
}

export class VersionConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = 'VERSION_CONFLICT';
  constructor(message = 'Version conflict — resource was modified by another request') {
    super(message);
  }
}

export class WorkspaceNotArchivedError extends AppError {
  readonly statusCode = 400;
  readonly code = 'WORKSPACE_NOT_ARCHIVED';
  constructor(message = 'Workspace is not archived') {
    super(message);
  }
}
