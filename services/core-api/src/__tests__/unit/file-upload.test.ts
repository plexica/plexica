// file-upload.test.ts
// Pure unit tests for validateFileSize() and validateMimeType() helpers.
// No mocks needed — the functions are pure and throw typed AppError subclasses.

import { describe, expect, it } from 'vitest';

import {
  AVATAR_ALLOWED_MIME_TYPES,
  LOGO_ALLOWED_MIME_TYPES,
  validateFileSize,
  validateMimeType,
} from '../../lib/file-upload.js';
import { FileTooLargeError, InvalidFileTypeError } from '../../lib/app-error.js';

// ---------------------------------------------------------------------------
// Constants matching Constitution / spec requirements
// ---------------------------------------------------------------------------

const AVATAR_MAX_BYTES = 1_048_576; // 1 MB exactly
const LOGO_MAX_BYTES = 2_097_152; // 2 MB exactly

// ===========================================================================
// validateFileSize()
// ===========================================================================

describe('validateFileSize() — avatar (1 MB limit)', () => {
  it('accepts exactly 1 MB (boundary: 1,048,576 bytes)', () => {
    expect(() => validateFileSize(AVATAR_MAX_BYTES, AVATAR_MAX_BYTES)).not.toThrow();
  });

  it('rejects 1 MB + 1 byte (1,048,577 bytes)', () => {
    expect(() => validateFileSize(AVATAR_MAX_BYTES + 1, AVATAR_MAX_BYTES)).toThrow(
      FileTooLargeError
    );
  });

  it('accepts 0 bytes (empty file passes size check)', () => {
    expect(() => validateFileSize(0, AVATAR_MAX_BYTES)).not.toThrow();
  });

  it('accepts 512 KB (half the limit)', () => {
    expect(() => validateFileSize(524_288, AVATAR_MAX_BYTES)).not.toThrow();
  });

  it('thrown error is instance of FileTooLargeError', () => {
    let caught: unknown;
    try {
      validateFileSize(AVATAR_MAX_BYTES + 1, AVATAR_MAX_BYTES);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FileTooLargeError);
  });
});

describe('validateFileSize() — logo (2 MB limit)', () => {
  it('accepts exactly 2 MB (boundary: 2,097,152 bytes)', () => {
    expect(() => validateFileSize(LOGO_MAX_BYTES, LOGO_MAX_BYTES)).not.toThrow();
  });

  it('rejects 2 MB + 1 byte (2,097,153 bytes)', () => {
    expect(() => validateFileSize(LOGO_MAX_BYTES + 1, LOGO_MAX_BYTES)).toThrow(FileTooLargeError);
  });
});

// ===========================================================================
// validateMimeType() — avatar
// ===========================================================================

describe('validateMimeType() — avatar allowlist', () => {
  it('accepts image/jpeg', () => {
    expect(() => validateMimeType('image/jpeg', AVATAR_ALLOWED_MIME_TYPES)).not.toThrow();
  });

  it('accepts image/png', () => {
    expect(() => validateMimeType('image/png', AVATAR_ALLOWED_MIME_TYPES)).not.toThrow();
  });

  it('accepts image/webp', () => {
    expect(() => validateMimeType('image/webp', AVATAR_ALLOWED_MIME_TYPES)).not.toThrow();
  });

  it('rejects image/gif', () => {
    expect(() => validateMimeType('image/gif', AVATAR_ALLOWED_MIME_TYPES)).toThrow(
      InvalidFileTypeError
    );
  });

  it('rejects application/pdf', () => {
    expect(() => validateMimeType('application/pdf', AVATAR_ALLOWED_MIME_TYPES)).toThrow(
      InvalidFileTypeError
    );
  });

  it('rejects image/svg+xml (not in avatar allowlist)', () => {
    expect(() => validateMimeType('image/svg+xml', AVATAR_ALLOWED_MIME_TYPES)).toThrow(
      InvalidFileTypeError
    );
  });

  it('thrown error is instance of InvalidFileTypeError', () => {
    let caught: unknown;
    try {
      validateMimeType('image/gif', AVATAR_ALLOWED_MIME_TYPES);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(InvalidFileTypeError);
  });
});

// ===========================================================================
// validateMimeType() — logo
// ===========================================================================

describe('validateMimeType() — logo allowlist', () => {
  it('accepts image/jpeg', () => {
    expect(() => validateMimeType('image/jpeg', LOGO_ALLOWED_MIME_TYPES)).not.toThrow();
  });

  it('accepts image/png', () => {
    expect(() => validateMimeType('image/png', LOGO_ALLOWED_MIME_TYPES)).not.toThrow();
  });

  it('accepts image/webp', () => {
    expect(() => validateMimeType('image/webp', LOGO_ALLOWED_MIME_TYPES)).not.toThrow();
  });

  it('accepts image/svg+xml (in logo allowlist)', () => {
    expect(() => validateMimeType('image/svg+xml', LOGO_ALLOWED_MIME_TYPES)).not.toThrow();
  });

  it('rejects image/gif', () => {
    expect(() => validateMimeType('image/gif', LOGO_ALLOWED_MIME_TYPES)).toThrow(
      InvalidFileTypeError
    );
  });
});
