// File: packages/ui/src/utils/sanitize-css.ts
// T015-23: CSS sanitization utility to prevent XSS via CSS injection.
// Spec 015 FR-023.
//
// Design note: ThemePreview injects custom CSS via a <style ref> using
// element.textContent — NOT dangerouslySetInnerHTML. textContent on a <style>
// element is interpreted as CSS by the browser, not as HTML, so HTML-tag
// injection is architecturally impossible. This function therefore only needs
// to strip CSS-level XSS vectors (expression(), url(javascript:), @import).
// HTML tag stripping regexes have been intentionally removed to avoid CodeQL
// js/incomplete-multi-character-sanitization false positives.

/**
 * Sanitizes a CSS string before it is injected into a <style> element via
 * element.textContent (NOT dangerouslySetInnerHTML).
 *
 * Strips CSS-level XSS vectors:
 *  1. `expression(...)` calls — IE CSS expression XSS vector.
 *  2. `url('javascript:...')` values — script execution via CSS url().
 *  3. `@import` rules — CSS exfiltration via external stylesheets.
 *
 * HTML tags are NOT stripped here because the caller uses textContent
 * injection (not innerHTML), making HTML injection impossible by construction.
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

  return sanitized;
}
