import type { FastifyRequest, FastifyReply } from 'fastify';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export function rateLimit(max: number, windowMs: number) {
  const store = new Map<string, RateLimitEntry>();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(key);
      }
    }
  }, 60_000);
  if (cleanup.unref) cleanup.unref();

  return async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const key = request.ip;
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }

    entry.count++;
    if (entry.count > max) {
      const err = Object.assign(new Error('Rate limit exceeded'), {
        statusCode: 429,
        rateLimitBody: {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded. Retry later.`,
            retryAfter: Math.ceil((entry.resetAt - now) / 1000).toString(),
          },
        },
      });
      throw err;
    }
  };
}
