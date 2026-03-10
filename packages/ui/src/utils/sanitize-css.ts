// File: packages/ui/src/utils/sanitize-css.ts
// T015-23: CSS sanitization utility using DOMPurify to prevent XSS via
// dangerouslySetInnerHTML in ThemePreview. Spec 015 FR-023.

/**
 * Sanitizes a CSS string before it is injected via dangerouslySetInnerHTML.
 *
 * Defense-in-depth strategy (applied in order):
 *  1. DOMPurify pass (browser only, strings ≤ 10 KB) — wraps CSS in <style>
 *     tags, sanitizes as HTML, and extracts the cleaned CSS content. Skipped
 *     for large strings for performance (NFR-004); string-level strips below
 *     cover those cases.
 *  2. Strip `</style>` closing tags — prevents breaking out of the <style>
 *     element and injecting arbitrary HTML.
 *  3. Strip `<script>` and other HTML tags — defense-in-depth after DOMPurify.
 *  4. Strip `expression(...)` calls — IE CSS expression XSS vector.
 *  5. Strip `url('javascript:...')` values — script execution via CSS url().
 *  6. Strip `@import` rules — CSS exfiltration via external stylesheets.
 *
 * @param css - Raw CSS string (e.g. user-supplied custom CSS).
 * @returns Sanitized CSS string safe for use in dangerouslySetInnerHTML.
 *
 * @example
 * // Malicious input: XSS via expression()
 * sanitizeCss('background: expression(alert(1))');
 * // => 'background: (alert(1))'   (expression() prefix stripped)
 *
 * @example
 * // Safe input: preserved as-is
 * sanitizeCss('color: red; font-size: 14px;');
 * // => 'color: red; font-size: 14px;'
 */

/** Max string length that DOMPurify will process (10 KB). Larger strings use string-level strips only. */
const MAX_DOMPURIFY_SIZE = 10 * 1024;

export function sanitizeCss(css: string): string {
  if (!css || typeof css !== 'string') return '';

  let sanitized = css;

  // 1. DOMPurify pass — only in browser environments with a real DOM and for
  //    strings within the size budget (perf guard, NFR-004).
  if (typeof window !== 'undefined' && sanitized.length <= MAX_DOMPURIFY_SIZE) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const DOMPurify = require('dompurify') as { default?: unknown } & unknown as {
        isSupported: boolean;
        sanitize: (input: string, config: Record<string, unknown>) => string;
      };

      const purify =
        'default' in DOMPurify && DOMPurify.default
          ? (DOMPurify.default as typeof DOMPurify)
          : DOMPurify;

      if (purify.isSupported) {
        // Wrap in <style> so DOMPurify processes it as CSS-in-HTML context.
        // If DOMPurify returns an empty string (e.g. content contained script
        // tags that caused the entire <style> to be dropped), keep the
        // pre-DOMPurify value so the string-level strips below can still run.
        const wrapped = purify.sanitize(`<style>${sanitized}</style>`, {
          FORCE_BODY: true,
        });
        const match = wrapped.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
        if (match && match[1] !== undefined) {
          sanitized = match[1];
        }
        // If match is null, DOMPurify stripped the entire <style> element
        // (e.g. it contained script tags). Keep `sanitized` as-is so the
        // string-level strips below still neutralise any remaining vectors.
      }
    } catch {
      // DOMPurify unavailable — string-level strips below are still active.
    }
  }

  // 2. Strip </style> closing tags (escape from style element → arbitrary HTML injection)
  sanitized = sanitized.replace(/<\/style>/gi, '');

  // 3. Strip remaining HTML tags (defense-in-depth — catches <script>, <b>, etc.
  //    that survived or were not processed by DOMPurify)
  sanitized = sanitized.replace(/<[^>]+>/g, '');

  // 4. Strip CSS expression() calls (IE XSS vector — executes arbitrary JS in IE)
  sanitized = sanitized.replace(/expression\s*\(/gi, '(');

  // 5. Strip javascript: scheme in url() CSS function values
  //    Matches: url('javascript:...'), url("javascript:..."), url(javascript:...)
  sanitized = sanitized.replace(/url\s*\(\s*['"]?\s*javascript\s*:/gi, 'url(');

  // 6. Strip @import rules (CSS exfiltration — loads attacker-controlled stylesheets).
  //    Replace with empty string so the @import token is fully removed.
  sanitized = sanitized.replace(/@import\s/gi, '');

  return sanitized;
}
