import type { MiddlewareHandler } from 'hono';
import { verifyApiKey } from '../services/apiKey.js';

export const apiKeyAuth: MiddlewareHandler = async (c, next) => {
  const key = c.req.header('x-api-key') ?? c.req.header('X-API-Key');
  if (!key) {
    return c.json({ error: 'Missing X-API-Key header' }, 401);
  }
  const row = await verifyApiKey(key);
  if (!row) {
    return c.json({ error: 'Invalid API key' }, 401);
  }
  c.set('apiKey', row);
  await next();
};
