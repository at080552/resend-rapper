import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { getSessionUser } from '../services/auth.js';

export const adminAuth: MiddlewareHandler = async (c, next) => {
  const sid = getCookie(c, 'rr_session');
  if (!sid) return c.json({ error: 'unauthenticated' }, 401);
  const user = await getSessionUser(sid);
  if (!user) return c.json({ error: 'unauthenticated' }, 401);
  c.set('adminUser', user);
  await next();
};
