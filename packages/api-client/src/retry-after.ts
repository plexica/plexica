// File: packages/api-client/src/retry-after.ts

/**
 * Parse a Retry-After header value into seconds.
 * Handles integer/float seconds and HTTP-date format.
 * Returns a safe default (60s) if the header is missing or unparseable.
 *
 * RFC 9110 specifies Retry-After as either:
 *   - A non-negative integer (seconds to wait)
 *   - An HTTP-date string
 *
 * As an extension, fractional second values (e.g. "1.5" emitted by some CDNs)
 * are accepted and rounded up to the nearest integer via Math.ceil.
 *
 * Negative numbers and non-numeric non-date strings fall back to 60.
 */
export function parseRetryAfter(header: string | null | undefined): number {
  if (!header) return 60;

  // If the value looks like a number (integer or float, optionally negative),
  // treat it as seconds. Using parseFloat + Math.ceil so that CDN values such
  // as "1.5" → 2 rather than 60. This also prevents negative strings from
  // accidentally being parsed as HTTP-dates.
  if (/^-?\d+(\.\d+)?$/.test(header.trim())) {
    const seconds = parseFloat(header);
    return seconds >= 0 ? Math.ceil(seconds) : 60;
  }

  // Otherwise try HTTP-date format
  const date = new Date(header).getTime();
  if (!isNaN(date)) return Math.max(1, Math.ceil((date - Date.now()) / 1000));

  return 60;
}
