// file-upload.ts
// Multipart upload validation helpers.
// Used by avatar and logo upload route handlers.
//
// Two layers, deliberately separate:
//   1. `validateMimeType` — cheap allowlist check on the CLIENT-DECLARED
//      Content-Type of the multipart part. Trivially forgeable; it exists only to
//      reject obvious mismatches before any bytes are buffered.
//   2. `validateFileContent` — the authoritative check. Sniffs the magic bytes of
//      the buffered payload and refuses anything whose real type does not match
//      what was declared, plus active content inside SVG (see svg-safety.ts).
// Any call site that has the payload in memory MUST use layer 2.

import { FileTooLargeError, InvalidFileTypeError } from './app-error.js';
import { assertSafeSvg } from './svg-safety.js';

// Re-exported so existing importers keep working after the SVG scanner moved
// to svg-safety.ts (Rule 4 split).
export { assertSafeSvg } from './svg-safety.js';

export const AVATAR_ALLOWED_MIME_TYPES: string[] = ['image/jpeg', 'image/png', 'image/webp'];

export const LOGO_ALLOWED_MIME_TYPES: string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  // SVG is stored active content: it can carry <script>, event handlers and
  // external references, and MinIO serves it back with this Content-Type. It is
  // kept because logo SVG support is a declared capability (spec 003), but every
  // SVG MUST pass `assertSafeSvg` via `validateFileContent` before being stored.
  'image/svg+xml',
];

/** Number of leading bytes inspected when sniffing a text-based format. */
const SNIFF_TEXT_WINDOW = 1024;

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
 *
 * Client-supplied value — NOT sufficient on its own. See `validateFileContent`.
 */
export function validateMimeType(mimeType: string, allowed: string[]): void {
  if (!allowed.includes(mimeType)) {
    throw new InvalidFileTypeError(
      `MIME type '${mimeType}' is not allowed. Allowed: ${allowed.join(', ')}`
    );
  }
}

function startsWith(content: Buffer, bytes: number[]): boolean {
  if (content.length < bytes.length) return false;
  return bytes.every((byte, index) => content[index] === byte);
}

function isWebp(content: Buffer): boolean {
  return (
    content.length >= 12 &&
    content.subarray(0, 4).toString('latin1') === 'RIFF' &&
    content.subarray(8, 12).toString('latin1') === 'WEBP'
  );
}

function isSvg(content: Buffer): boolean {
  const head = content.subarray(0, SNIFF_TEXT_WINDOW).toString('utf8');
  // Allow a BOM, an XML declaration, comments and a DOCTYPE before the root tag,
  // but nothing else — a file that only *contains* "<svg" is not an SVG.
  return /^\uFEFF?\s*(<\?xml[^>]*\?>\s*|<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<svg[\s>]/i.test(
    head
  );
}

const BINARY_SIGNATURES: Array<{ mimeType: string; matches: (content: Buffer) => boolean }> = [
  { mimeType: 'image/jpeg', matches: (c) => startsWith(c, [0xff, 0xd8, 0xff]) },
  {
    mimeType: 'image/png',
    matches: (c) => startsWith(c, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  { mimeType: 'image/gif', matches: (c) => startsWith(c, [0x47, 0x49, 0x46, 0x38]) },
  { mimeType: 'image/webp', matches: isWebp },
];

/**
 * Returns the MIME type implied by the payload's own bytes, or `null` when the
 * format is not recognised. Never trusts the declared Content-Type.
 */
export function sniffMimeType(content: Buffer): string | null {
  for (const signature of BINARY_SIGNATURES) {
    if (signature.matches(content)) return signature.mimeType;
  }
  return isSvg(content) ? 'image/svg+xml' : null;
}

/**
 * Authoritative upload validation. Requires the payload in memory.
 *
 * 1. the declared type must be in the allowlist,
 * 2. the payload's magic bytes must resolve to that same type,
 * 3. SVG payloads must contain no active content.
 */
export function validateFileContent(
  content: Buffer,
  declaredMimeType: string,
  allowed: string[]
): void {
  validateMimeType(declaredMimeType, allowed);

  const sniffed = sniffMimeType(content);
  if (sniffed === null) {
    throw new InvalidFileTypeError(
      `File content does not match any supported image format. Allowed: ${allowed.join(', ')}`
    );
  }
  if (sniffed !== declaredMimeType) {
    throw new InvalidFileTypeError(
      `File content is '${sniffed}' but was declared as '${declaredMimeType}'`
    );
  }
  if (sniffed === 'image/svg+xml') assertSafeSvg(content);
}
