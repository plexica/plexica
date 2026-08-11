// upload-messages.ts
// Maps upload failures and MIME allowlists onto react-intl message ids.
// Kept next to the message catalogues so the error codes and the copy that
// renders them stay together. No UI string is produced here — only ids.

import { ApiError } from '@plexica/auth/api-client';

/**
 * Display labels for the MIME types the upload endpoints accept.
 * These are format brand names (JPEG, PNG, WebP, SVG), not translatable copy —
 * the *list* is assembled locale-aware by `intl.formatList` at the call site.
 */
const MIME_TYPE_LABELS: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'image/svg+xml': 'SVG',
  'image/gif': 'GIF',
};

/** Turns an allowlist into human-readable format labels, e.g. ['JPEG','PNG']. */
export function mimeTypeLabels(mimeTypes: readonly string[]): string[] {
  return mimeTypes.map((type) => MIME_TYPE_LABELS[type] ?? type);
}

/** The `accept` attribute for an <input type="file">, derived from the allowlist. */
export function acceptAttribute(mimeTypes: readonly string[]): string {
  return mimeTypes.join(',');
}

/** Bytes → whole megabytes, for the "Max N MB" copy and for error messages. */
export function megabytes(bytes: number): number {
  return Math.round((bytes / 1_048_576) * 10) / 10;
}

/**
 * Resolves an upload failure to a localized message id.
 *
 * Prefers the machine-readable `ApiError.code` emitted by core-api and falls back
 * to the HTTP status, so a code that is added server-side before the client knows
 * about it still produces a sensible message instead of silence.
 */
export function uploadErrorMessageId(error: unknown): string {
  if (!(error instanceof ApiError)) return 'upload.error.generic';

  switch (error.code) {
    case 'FILE_TOO_LARGE':
      return 'upload.error.tooLarge';
    case 'INVALID_FILE_TYPE':
      return 'upload.error.invalidType';
    case 'RATE_LIMIT_EXCEEDED':
      return 'upload.error.rateLimited';
    case 'INVALID_RESPONSE':
      return 'upload.error.invalidResponse';
    case 'VALIDATION_ERROR':
      return 'upload.error.invalidFile';
    case 'FORBIDDEN':
      return 'upload.error.forbidden';
    default:
      break;
  }

  if (error.status === 413) return 'upload.error.tooLarge';
  if (error.status === 415) return 'upload.error.invalidType';
  if (error.status === 429) return 'upload.error.rateLimited';
  if (error.status === 403) return 'upload.error.forbidden';
  if (error.status >= 500) return 'upload.error.server';
  return 'upload.error.generic';
}
