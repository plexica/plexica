// file-upload.ts
// Multipart upload validation helpers.
// Used by avatar and logo upload route handlers.

import { FileTooLargeError, InvalidFileTypeError } from './app-error.js';

export const AVATAR_ALLOWED_MIME_TYPES: string[] = ['image/jpeg', 'image/png', 'image/webp'];

export const LOGO_ALLOWED_MIME_TYPES: string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
];

/**
 * Throws FileTooLargeError if the file size exceeds maxBytes.
 */
export function validateFileSize(bytes: number, maxBytes: number): void {
  if (bytes > maxBytes) {
    throw new FileTooLargeError(`File size ${bytes} bytes exceeds maximum of ${maxBytes} bytes`);
  }
}

/**
 * Throws InvalidFileTypeError if mimeType is not in the allowed list.
 */
export function validateMimeType(mimeType: string, allowed: string[]): void {
  if (!allowed.includes(mimeType)) {
    throw new InvalidFileTypeError(
      `MIME type '${mimeType}' is not allowed. Allowed: ${allowed.join(', ')}`
    );
  }
}
