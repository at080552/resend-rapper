import type { MiddlewareHandler } from 'hono';

export function bodyLimit(maxBytes: number): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS') {
      await next();
      return;
    }
    const cl = c.req.header('content-length');
    if (cl) {
      const n = Number(cl);
      if (Number.isFinite(n) && n > maxBytes) {
        return c.json({ error: 'request_too_large', max_bytes: maxBytes }, 413);
      }
    }
    await next();
  };
}
