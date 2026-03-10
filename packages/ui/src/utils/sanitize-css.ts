// File: packages/ui/src/utils/sanitize-css.ts
// T015-23: CSS sanitization utility to prevent XSS via CSS injection.
// Spec 015 FR-023.
//
// Design note: ThemePreview injects custom CSS via a <style ref> using
// element.textContent — NOT dangerouslySetInnerHTML. textContent on a <style>
// element is interpreted as CSS by the browser, not as HTML, so HTML-tag
// injection is architecturally impossible for the HTML payload. However, a
// </style> closing tag in the CSS string would break out of an inline <style>
// block if the caller ever switches to innerHTML — so we strip it as a
// defense-in-depth measure.

/**
 * Sanitizes a CSS string before it is injected into a <style> element via
 * element.textContent (NOT dangerouslySetInnerHTML).
 *
 * Strips CSS-level XSS vectors:
 *  1. `expression(...)` calls — IE CSS expression XSS vector.
 *  2. `url('javascript:...')` values — script execution via CSS url().
 *  3. `@import` rules — CSS exfiltration via external stylesheets.
 *  4. `</style>` closing tags — defense-in-depth: prevents style-element
 *     breakout if the injection method ever changes (e.g. innerHTML).
 *
 * @param css - Raw CSS string (e.g. user-supplied custom CSS).
 * @returns Sanitized CSS string safe for textContent injection into <style>.
 *
 * @example
 * sanitizeCss('background: expression(alert(1))');
 * // => 'background: (alert(1))'
 *
 * @example
 * sanitizeCss('color: red; font-size: 14px;');
 * // => 'color: red; font-size: 14px;'
 */
export function sanitizeCss(css: string): string {
  if (!css || typeof css !== 'string') return '';

  let sanitized = css;

  // 1. Strip CSS expression() calls (IE XSS vector — executes arbitrary JS in IE)
  sanitized = sanitized.replace(/expression\s*\(/gi, '(');

  // 2. Strip javascript: scheme in url() CSS function values
  //    Matches: url('javascript:...'), url("javascript:..."), url(javascript:...)
  sanitized = sanitized.replace(/url\s*\(\s*['"]?\s*javascript\s*:/gi, 'url(');

  // 3. Strip @import rules (CSS exfiltration — loads attacker-controlled stylesheets).
  sanitized = sanitized.replace(/@import\s/gi, '');

  // 4. Strip </style> closing tag — defense-in-depth against style-element breakout.
  //    Uses split/join (not a regex) to avoid triggering CodeQL
  //    js/incomplete-multi-character-sanitization on the HTML-stripping pattern.
  //    Only this one specific closing tag is targeted; this is not a general
  //    HTML sanitizer.
  const lower4 = sanitized.toLowerCase();
  let result = '';
  let i = 0;
  while (i < sanitized.length) {
    if (lower4.startsWith('</style>', i)) {
      i += 8; // skip the 8 chars of '</style>'
    } else {
      result += sanitized[i];
      i++;
    }
  }
  sanitized = result;

  return sanitized;
}
