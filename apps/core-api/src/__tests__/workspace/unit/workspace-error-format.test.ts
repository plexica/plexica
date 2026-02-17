// apps/core-api/src/__tests__/workspace/unit/workspace-error-format.test.ts
//
// Unit tests for the workspace error formatter utility.
// Validates Constitution Art. 6.2 compliance: { error: { code, message, details? } }
// Tests error code enum, WorkspaceError class, mapServiceError(), workspaceError().

import { describe, it, expect } from 'vitest';
import {
  WorkspaceErrorCode,
  WorkspaceError,
  workspaceError,
  mapServiceError,
  getStatusForCode,
} from '../../../modules/workspace/utils/error-formatter.js';

describe('WorkspaceErrorCode', () => {
  it('should define all 10 error codes from Spec 009 Section 6.5', () => {
    const expectedCodes = [
      'WORKSPACE_NOT_FOUND',
      'WORKSPACE_SLUG_CONFLICT',
      'WORKSPACE_HAS_TEAMS',
      'MEMBER_NOT_FOUND',
      'MEMBER_ALREADY_EXISTS',
      'LAST_ADMIN_VIOLATION',
      'INSUFFICIENT_PERMISSIONS',
      'VALIDATION_ERROR',
      'RESOURCE_ALREADY_SHARED',
      'SHARING_DISABLED',
    ];

    const actualCodes = Object.values(WorkspaceErrorCode);
    expect(actualCodes).toHaveLength(10);

    for (const code of expectedCodes) {
      expect(actualCodes).toContain(code);
    }
  });
});

describe('WorkspaceError', () => {
  it('should extend Error with correct name', () => {
    const error = new WorkspaceError(WorkspaceErrorCode.WORKSPACE_NOT_FOUND, 'Not found');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('WorkspaceError');
  });

  it('should set statusCode based on error code', () => {
    const error = new WorkspaceError(WorkspaceErrorCode.WORKSPACE_NOT_FOUND, 'Not found');
    expect(error.statusCode).toBe(404);
  });

  it('should preserve the error code', () => {
    const error = new WorkspaceError(
      WorkspaceErrorCode.WORKSPACE_SLUG_CONFLICT,
      'Slug already exists'
    );
    expect(error.code).toBe('WORKSPACE_SLUG_CONFLICT');
  });

  it('should store optional details', () => {
    const details = { workspaceId: 'ws-123', slug: 'my-workspace' };
    const error = new WorkspaceError(
      WorkspaceErrorCode.WORKSPACE_NOT_FOUND,
      'Workspace not found',
      details
    );
    expect(error.details).toEqual(details);
  });

  it('should leave details undefined when not provided', () => {
    const error = new WorkspaceError(WorkspaceErrorCode.VALIDATION_ERROR, 'Invalid input');
    expect(error.details).toBeUndefined();
  });

  it('should produce a readable error message', () => {
    const error = new WorkspaceError(
      WorkspaceErrorCode.LAST_ADMIN_VIOLATION,
      'Cannot remove the last admin'
    );
    expect(error.message).toBe('Cannot remove the last admin');
  });
});

describe('getStatusForCode', () => {
  it('should return correct HTTP status for each error code', () => {
    const expectations: Array<[WorkspaceErrorCode, number]> = [
      [WorkspaceErrorCode.WORKSPACE_NOT_FOUND, 404],
      [WorkspaceErrorCode.WORKSPACE_SLUG_CONFLICT, 409],
      [WorkspaceErrorCode.WORKSPACE_HAS_TEAMS, 400],
      [WorkspaceErrorCode.MEMBER_NOT_FOUND, 404],
      [WorkspaceErrorCode.MEMBER_ALREADY_EXISTS, 409],
      [WorkspaceErrorCode.LAST_ADMIN_VIOLATION, 400],
      [WorkspaceErrorCode.INSUFFICIENT_PERMISSIONS, 403],
      [WorkspaceErrorCode.VALIDATION_ERROR, 400],
      [WorkspaceErrorCode.RESOURCE_ALREADY_SHARED, 409],
      [WorkspaceErrorCode.SHARING_DISABLED, 403],
    ];

    for (const [code, expectedStatus] of expectations) {
      expect(getStatusForCode(code)).toBe(expectedStatus);
    }
  });
});

describe('workspaceError', () => {
  it('should return Constitution Art. 6.2 compliant response format', () => {
    const result = workspaceError(
      WorkspaceErrorCode.WORKSPACE_NOT_FOUND,
      'Workspace not found in tenant'
    );

    expect(result).toEqual({
      error: {
        code: 'WORKSPACE_NOT_FOUND',
        message: 'Workspace not found in tenant',
      },
    });
  });

  it('should include details when provided', () => {
    const result = workspaceError(WorkspaceErrorCode.VALIDATION_ERROR, 'Invalid request data', {
      fields: ['slug', 'name'],
    });

    expect(result).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: { fields: ['slug', 'name'] },
      },
    });
  });

  it('should omit details key when not provided', () => {
    const result = workspaceError(WorkspaceErrorCode.INSUFFICIENT_PERMISSIONS, 'Access denied');

    expect(result.error).not.toHaveProperty('details');
  });
});

describe('mapServiceError', () => {
  it('should map "already exists" to WORKSPACE_SLUG_CONFLICT', () => {
    const error = new Error('Workspace with slug already exists in tenant');
    const mapped = mapServiceError(error);

    expect(mapped).toBeInstanceOf(WorkspaceError);
    expect(mapped!.code).toBe(WorkspaceErrorCode.WORKSPACE_SLUG_CONFLICT);
    expect(mapped!.statusCode).toBe(409);
  });

  it('should map "already a member" to MEMBER_ALREADY_EXISTS', () => {
    const error = new Error('User is already a member of this workspace');
    const mapped = mapServiceError(error);

    expect(mapped).toBeInstanceOf(WorkspaceError);
    expect(mapped!.code).toBe(WorkspaceErrorCode.MEMBER_ALREADY_EXISTS);
    expect(mapped!.statusCode).toBe(409);
  });

  it('should map "existing teams" to WORKSPACE_HAS_TEAMS', () => {
    const error = new Error('Cannot delete workspace with existing teams');
    const mapped = mapServiceError(error);

    expect(mapped).toBeInstanceOf(WorkspaceError);
    expect(mapped!.code).toBe(WorkspaceErrorCode.WORKSPACE_HAS_TEAMS);
    expect(mapped!.statusCode).toBe(400);
  });

  it('should map "last admin" to LAST_ADMIN_VIOLATION', () => {
    const error = new Error('Cannot remove the last admin from workspace');
    const mapped = mapServiceError(error);

    expect(mapped).toBeInstanceOf(WorkspaceError);
    expect(mapped!.code).toBe(WorkspaceErrorCode.LAST_ADMIN_VIOLATION);
    expect(mapped!.statusCode).toBe(400);
  });

  it('should map "not found" to WORKSPACE_NOT_FOUND', () => {
    const error = new Error('Workspace not found');
    const mapped = mapServiceError(error);

    expect(mapped).toBeInstanceOf(WorkspaceError);
    expect(mapped!.code).toBe(WorkspaceErrorCode.WORKSPACE_NOT_FOUND);
    expect(mapped!.statusCode).toBe(404);
  });

  it('should map "member not found" to MEMBER_NOT_FOUND (more specific match)', () => {
    const error = new Error('Workspace member not found');
    const mapped = mapServiceError(error);

    expect(mapped).toBeInstanceOf(WorkspaceError);
    expect(mapped!.code).toBe(WorkspaceErrorCode.MEMBER_NOT_FOUND);
    expect(mapped!.statusCode).toBe(404);
  });

  it('should map "permission" to INSUFFICIENT_PERMISSIONS', () => {
    const error = new Error('Insufficient permission to perform this action');
    const mapped = mapServiceError(error);

    expect(mapped).toBeInstanceOf(WorkspaceError);
    expect(mapped!.code).toBe(WorkspaceErrorCode.INSUFFICIENT_PERMISSIONS);
    expect(mapped!.statusCode).toBe(403);
  });

  it('should map "sharing disabled" to SHARING_DISABLED', () => {
    const error = new Error('Cross-workspace sharing disabled for this tenant');
    const mapped = mapServiceError(error);

    expect(mapped).toBeInstanceOf(WorkspaceError);
    expect(mapped!.code).toBe(WorkspaceErrorCode.SHARING_DISABLED);
    expect(mapped!.statusCode).toBe(403);
  });

  it('should map "already shared" to RESOURCE_ALREADY_SHARED', () => {
    const error = new Error('Resource is already shared with this workspace');
    const mapped = mapServiceError(error);

    expect(mapped).toBeInstanceOf(WorkspaceError);
    expect(mapped!.code).toBe(WorkspaceErrorCode.RESOURCE_ALREADY_SHARED);
    expect(mapped!.statusCode).toBe(409);
  });

  it('should return null for unknown error messages', () => {
    const error = new Error('Some random internal error');
    const mapped = mapServiceError(error);

    expect(mapped).toBeNull();
  });

  it('should return null for non-Error values', () => {
    expect(mapServiceError('string error')).toBeNull();
    expect(mapServiceError(42)).toBeNull();
    expect(mapServiceError(null)).toBeNull();
    expect(mapServiceError(undefined)).toBeNull();
  });

  it('should preserve the original error message in the mapped WorkspaceError', () => {
    const originalMessage = 'Workspace with slug "my-ws" already exists in tenant acme';
    const error = new Error(originalMessage);
    const mapped = mapServiceError(error);

    expect(mapped!.message).toBe(originalMessage);
  });

  it('should handle case-insensitive matching for "not found"', () => {
    const error = new Error('Workspace Not Found in database');
    const mapped = mapServiceError(error);

    expect(mapped).not.toBeNull();
    expect(mapped!.code).toBe(WorkspaceErrorCode.WORKSPACE_NOT_FOUND);
  });
});

describe('WorkspaceError integration with global error handler', () => {
  it('should have properties compatible with Fastify error handler', () => {
    // The global error handler reads: error.statusCode, error.code, error.message
    const error = new WorkspaceError(
      WorkspaceErrorCode.WORKSPACE_NOT_FOUND,
      'Workspace not found',
      { workspaceId: 'ws-123' }
    );

    // statusCode is read by error-handler.ts line 140
    expect(error.statusCode).toBeDefined();
    expect(typeof error.statusCode).toBe('number');

    // code with underscore is detected by error-handler.ts line 79
    expect(error.code).toBeDefined();
    expect(error.code).toContain('_');

    // message is used directly
    expect(error.message).toBeDefined();
    expect(typeof error.message).toBe('string');
  });

  it('should have code property that passes the underscore check in getErrorCode()', () => {
    // error-handler.ts line 79: error.code.includes('_')
    // All WorkspaceErrorCode values contain underscores, so getErrorCode()
    // will use our custom code directly instead of mapping by error name.
    for (const code of Object.values(WorkspaceErrorCode)) {
      expect(code).toContain('_');
    }
  });
});
