// File: packages/ui/src/utils/validate-image-url.ts
// T015-24: URL scheme validation utility to prevent XSS via unsafe src attributes.
// Spec 015 FR-024.

/**
 * Validates an image URL for safe use in `<img src>` attributes.
 *
 * Allowlisted safe prefixes (case-insensitive):
 *  - `https://` — standard HTTPS image URL
 *  - `http://` — HTTP image URL (allowed for non-production / intranet use)
 *  - `data:image/` — inline base64-encoded image data
 *
 * Explicitly rejected dangerous schemes (checked before allowlist):
 *  - `javascript:` — script execution
 *  - `vbscript:` — VBScript execution (IE/legacy XSS vector)
 *  - `data:text/html` — HTML injection via data URI
 *  - `data:application/` — executable payloads via data URI
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
 * validateImageUrl('data:text/html,<h1>XSS</h1>');     // => null
 * validateImageUrl('');                                  // => null
 */
export function validateImageUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null;

  const trimmed = url.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();

  // Explicit rejection of dangerous schemes (checked first for clarity)
  if (lower.startsWith('javascript:')) return null;
  if (lower.startsWith('vbscript:')) return null;
  if (lower.startsWith('data:text/html')) return null;
  if (lower.startsWith('data:application/')) return null;

  // Allowlist of safe URL prefixes
  const SAFE_PREFIXES = ['https://', 'http://', 'data:image/'] as const;
  if (!SAFE_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
    return null;
  }

  // Return original (not lowercased) URL to preserve case in path/query
  return trimmed;
}
