// file-upload-security.test.ts
// Unit tests for the authoritative content-sniffing layer of file-upload.ts:
// sniffMimeType() and validateFileContent(). Tests for assertSafeSvg() live in
// the sibling file-upload-svg-safety.test.ts — kept separate to stay under the
// 200-line file limit (Rule 4).

import { describe, expect, it } from 'vitest';

import {
  AVATAR_ALLOWED_MIME_TYPES,
  LOGO_ALLOWED_MIME_TYPES,
  sniffMimeType,
  validateFileContent,
} from '../../lib/file-upload.js';
import { InvalidFileTypeError } from '../../lib/app-error.js';

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const GIF_BYTES = Buffer.from('GIF89a' + '\0'.repeat(10));
const WEBP_BYTES = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP'),
]);
const LEGIT_SVG = Buffer.from(
  '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">' +
    '<circle cx="5" cy="5" r="4" fill="red"/></svg>'
);

describe('sniffMimeType()', () => {
  it('detects JPEG magic bytes', () => {
    expect(sniffMimeType(JPEG_BYTES)).toBe('image/jpeg');
  });

  it('detects PNG magic bytes', () => {
    expect(sniffMimeType(PNG_BYTES)).toBe('image/png');
  });

  it('detects GIF magic bytes', () => {
    expect(sniffMimeType(GIF_BYTES)).toBe('image/gif');
  });

  it('detects WEBP (RIFF/WEBP container)', () => {
    expect(sniffMimeType(WEBP_BYTES)).toBe('image/webp');
  });

  it('detects a real SVG root tag', () => {
    expect(sniffMimeType(LEGIT_SVG)).toBe('image/svg+xml');
  });

  it('returns null for unrecognised content', () => {
    expect(sniffMimeType(Buffer.from('not an image at all'))).toBeNull();
  });
});

describe('validateFileContent()', () => {
  it('rejects a file declared image/png but with JPEG magic bytes', () => {
    expect(() =>
      validateFileContent(JPEG_BYTES, 'image/png', AVATAR_ALLOWED_MIME_TYPES)
    ).toThrow(InvalidFileTypeError);
  });

  it('accepts a real PNG declared as image/png', () => {
    expect(() =>
      validateFileContent(PNG_BYTES, 'image/png', AVATAR_ALLOWED_MIME_TYPES)
    ).not.toThrow();
  });

  it('rejects an SVG declared as image/svg+xml carrying a <script> tag', () => {
    const malicious = Buffer.from('<svg><script>alert(1)</script></svg>');
    expect(() =>
      validateFileContent(malicious, 'image/svg+xml', LOGO_ALLOWED_MIME_TYPES)
    ).toThrow(InvalidFileTypeError);
  });

  it('accepts a legitimate SVG declared as image/svg+xml', () => {
    expect(() =>
      validateFileContent(LEGIT_SVG, 'image/svg+xml', LOGO_ALLOWED_MIME_TYPES)
    ).not.toThrow();
  });

  it('rejects content that does not sniff to any supported format', () => {
    expect(() =>
      validateFileContent(Buffer.from('plain text'), 'image/png', AVATAR_ALLOWED_MIME_TYPES)
    ).toThrow(InvalidFileTypeError);
  });

  it('rejects an SVG exploiting the padding-window bypass (defeated the {0,4096} bound)', () => {
    const padding = Array.from({ length: 600 }, (_, i) => `data-pad${i}="x"`).join(' ');
    const malicious = Buffer.from(
      `<svg><image ${padding} href="https://evil.example/b.png"/></svg>`
    );
    expect(() =>
      validateFileContent(malicious, 'image/svg+xml', LOGO_ALLOWED_MIME_TYPES)
    ).toThrow(InvalidFileTypeError);
  });
});
