// Utility to sanitize timeout durations before passing to setTimeout
export const MAX_NODE_TIMEOUT_MS = 0x7fffffff; // 2^31-1

export function sanitizeTimeoutMs(ms: number | undefined | null): number {
  const n = Number(ms) || 0;
  if (!isFinite(n) || isNaN(n)) return 0;
  const v = Math.max(0, Math.floor(n));
  return Math.min(v, MAX_NODE_TIMEOUT_MS);
}
