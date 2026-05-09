import type { Context, MiddlewareHandler } from 'hono';

interface Bucket {
  resetAt: number;
  count: number;
}

interface RateLimitOptions {
  windowMs: number;
  max: number | (() => number) | (() => Promise<number>);
  keyer: (c: Context) => string | Promise<string>;
  scope: string;
}

const buckets = new Map<string, Bucket>();

export function rateLimit({ windowMs, max, keyer, scope }: RateLimitOptions): MiddlewareHandler {
  return async (c, next) => {
    const k = `${scope}:${await keyer(c)}`;
    const now = Date.now();
    let b = buckets.get(k);
    if (!b || b.resetAt <= now) {
      b = { resetAt: now + windowMs, count: 0 };
      buckets.set(k, b);
    }
    const limit = typeof max === 'function' ? await max() : max;
    if (b.count >= limit) {
      const retryAfter = Math.ceil((b.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: 'rate_limited', retry_after_seconds: retryAfter }, 429);
    }
    b.count++;
    await next();
  };
}

// Periodic cleanup of expired buckets to bound memory
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}, 5 * 60 * 1000).unref();
