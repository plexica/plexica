// File: packages/ui/src/utils/validate-image-url.ts
// T015-24: URL scheme validation utility to prevent XSS via unsafe src attributes.
// Spec 015 FR-024.

/**
 * Validates an image URL for safe use in `<img src>` attributes.
 *
 * Strategy: explicit allowlist of safe URL prefixes.
 * Any URL that does not match the allowlist is rejected, including all
 * `javascript:`, `vbscript:`, `data:text/html`, and `data:image/svg`
 * (SVG data URIs can contain `<script>` tags and are therefore unsafe).
 *
 * Allowlisted safe prefixes (case-insensitive):
 *  - `https://` — standard HTTPS image URL
 *  - `http://`  — HTTP image URL (allowed for non-production / intranet use)
 *  - `data:image/png;base64,`
 *  - `data:image/jpeg;base64,`
 *  - `data:image/jpg;base64,`
 *  - `data:image/gif;base64,`
 *  - `data:image/webp;base64,`
 *  - `data:image/avif;base64,`
 *  - `data:image/bmp;base64,`
 *  - `data:image/ico;base64,`
 *  - `data:image/x-icon;base64,`
 *
 * Explicitly excluded `data:` sub-types:
 *  - `data:image/svg` — SVG can contain `<script>` tags (XSS risk)
 *  - `data:text/*`    — HTML/plain-text injection
 *  - `data:application/*` — executable payloads
 *  - All other `data:` types not in the allowlist above
 *
 * @param url - Raw URL string from user input or API response.
 * @returns The original (un-lowercased) URL if it passes validation,
 *          `null` if it is rejected or empty.
 *
 * @example
 * validateImageUrl('https://cdn.example.com/logo.png'); // => the URL
 * validateImageUrl('javascript:alert(1)');              // => null
 * validateImageUrl('vbscript:MsgBox(1)');               // => null
 * validateImageUrl('data:image/png;base64,ABC==');      // => the URL
 * validateImageUrl('data:image/svg+xml,<svg/>');        // => null (SVG unsafe)
 * validateImageUrl('data:text/html,<h1>XSS</h1>');     // => null
 * validateImageUrl('');                                  // => null
 */
export function validateImageUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null;

  const trimmed = url.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();

  // Allowlist of safe URL prefixes — anything not in this list is rejected.
  // data:image/svg is intentionally excluded (SVG can contain <script> tags).
  const SAFE_PREFIXES = [
    'https://',
    'http://',
    'data:image/png;base64,',
    'data:image/jpeg;base64,',
    'data:image/jpg;base64,',
    'data:image/gif;base64,',
    'data:image/webp;base64,',
    'data:image/avif;base64,',
    'data:image/bmp;base64,',
    'data:image/ico;base64,',
    'data:image/x-icon;base64,',
  ] as const;

  if (!SAFE_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
    return null;
  }

  // Return original (not lowercased) URL to preserve case in path/query
  return trimmed;
}
