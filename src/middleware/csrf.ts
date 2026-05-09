import type { MiddlewareHandler } from 'hono';
import { config } from '../config.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export const csrf: MiddlewareHandler = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) {
    await next();
    return;
  }

  const origin = c.req.header('origin');
  const referer = c.req.header('referer');
  const host = c.req.header('host');

  const candidateHost = origin ? hostOf(origin) : referer ? hostOf(referer) : null;

  const allowedHosts = new Set<string>();
  if (host) allowedHosts.add(host);
  for (const o of config.allowedAdminOrigins) {
    const h = hostOf(o);
    if (h) allowedHosts.add(h);
  }

  if (!candidateHost || !allowedHosts.has(candidateHost)) {
    return c.json({ error: 'csrf_origin_mismatch' }, 403);
  }
  await next();
};
