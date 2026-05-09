import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { emailLogs } from '../db/schema.js';
import { adminAuth } from '../middleware/adminAuth.js';
import {
  authenticate,
  createSession,
  destroySession,
} from '../services/auth.js';
import {
  issueApiKey,
  listApiKeys,
  revokeApiKey,
} from '../services/apiKey.js';
import { getLog, listLogs, markFailed, markSent, createPendingLog } from '../services/emailLog.js';
import { getMetrics, lifetimeCount } from '../services/metrics.js';
import {
  SETTING_KEYS,
  getResendApiKey,
  getSetting,
  setSetting,
} from '../services/settings.js';
import { sendViaResend } from '../services/resend.js';
import { sendEmailSchema } from '../schemas/sendEmail.js';
import type { AdminUser } from '../db/schema.js';

type Variables = { adminUser: AdminUser };
export const adminApi = new Hono<{ Variables: Variables }>();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

adminApi.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_payload' }, 400);
  const user = await authenticate(parsed.data.username, parsed.data.password);
  if (!user) return c.json({ error: 'invalid_credentials' }, 401);
  const session = await createSession(user.id);
  setCookie(c, 'rr_session', session.id, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: false,
    path: '/',
    expires: session.expiresAt,
  });
  return c.json({ id: user.id, username: user.username });
});

adminApi.post('/logout', async (c) => {
  const sid = c.req.header('cookie')?.match(/rr_session=([^;]+)/)?.[1];
  if (sid) await destroySession(sid);
  deleteCookie(c, 'rr_session', { path: '/' });
  return c.json({ ok: true });
});

const protectedRoutes = new Hono<{ Variables: Variables }>();
protectedRoutes.use('*', adminAuth);

protectedRoutes.get('/me', (c) => {
  const u = c.get('adminUser');
  return c.json({ id: u.id, username: u.username });
});

protectedRoutes.get('/metrics', async (c) => {
  const win = Number(c.req.query('window') ?? 24);
  const summary = await getMetrics(Number.isFinite(win) ? win : 24);
  const lifetime = await lifetimeCount();
  return c.json({ ...summary, lifetime });
});

protectedRoutes.get('/logs', async (c) => {
  const status = c.req.query('status') as 'pending' | 'sent' | 'failed' | undefined;
  const search = c.req.query('q');
  const limit = Number(c.req.query('limit') ?? 50);
  const offset = Number(c.req.query('offset') ?? 0);
  const result = await listLogs({ status, search: search ?? undefined, limit, offset });
  return c.json(result);
});

protectedRoutes.get('/logs/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const row = await getLog(id);
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({
    ...row,
    attachments: row.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      content_type: a.contentType,
      size_bytes: a.sizeBytes,
    })),
  });
});

protectedRoutes.post('/logs/:id/resend', async (c) => {
  const id = Number(c.req.param('id'));
  const row = await getLog(id);
  if (!row) return c.json({ error: 'not_found' }, 404);

  const input = {
    from: row.fromAddr,
    to: JSON.parse(row.toJson) as string[],
    cc: row.ccJson ? (JSON.parse(row.ccJson) as string[]) : undefined,
    bcc: row.bccJson ? (JSON.parse(row.bccJson) as string[]) : undefined,
    reply_to: row.replyTo ? (JSON.parse(row.replyTo) as string[]) : undefined,
    subject: row.subject,
    html: row.html ?? undefined,
    text: row.textBody ?? undefined,
    headers: row.headersJson ? (JSON.parse(row.headersJson) as Record<string, string>) : undefined,
    attachments: row.attachments.map((a) => ({
      filename: a.filename,
      content_base64: Buffer.from(a.contentBlob as Buffer).toString('base64'),
      content_type: a.contentType ?? undefined,
    })),
  };
  const newLog = await createPendingLog({ apiKeyId: row.apiKeyId ?? null, input, fromAddr: row.fromAddr });
  const result = await sendViaResend(input);
  if (result.ok && result.resendId) {
    await markSent(newLog.id, result.resendId, result.attempts);
    return c.json({ id: newLog.id, resend_id: result.resendId, status: 'sent' });
  }
  await markFailed(newLog.id, result.error ?? 'unknown', result.attempts);
  return c.json({ id: newLog.id, status: 'failed', error: result.error }, 502);
});

protectedRoutes.post('/test-send', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = sendEmailSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_payload', details: parsed.error.flatten() }, 400);
  const defaultFrom = (await getSetting(SETTING_KEYS.DEFAULT_FROM)) ?? '';
  const fromAddr = parsed.data.from ?? defaultFrom;
  if (!fromAddr) return c.json({ error: 'from_required' }, 400);
  const log = await createPendingLog({ apiKeyId: null, input: parsed.data, fromAddr });
  const result = await sendViaResend({ ...parsed.data, from: fromAddr });
  if (result.ok && result.resendId) {
    await markSent(log.id, result.resendId, result.attempts);
    return c.json({ id: log.id, resend_id: result.resendId, status: 'sent' });
  }
  await markFailed(log.id, result.error ?? 'unknown', result.attempts);
  return c.json({ id: log.id, status: 'failed', error: result.error }, 502);
});

protectedRoutes.get('/api-keys', async (c) => {
  const rows = await listApiKeys();
  return c.json(rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    created_at: r.createdAt,
    last_used_at: r.lastUsedAt,
    revoked_at: r.revokedAt,
  })));
});

protectedRoutes.post('/api-keys', async (c) => {
  const body = await c.req.json().catch(() => null) as { name?: string } | null;
  const name = body?.name?.trim();
  if (!name) return c.json({ error: 'name_required' }, 400);
  const issued = await issueApiKey(name);
  return c.json(issued);
});

protectedRoutes.post('/api-keys/:id/revoke', async (c) => {
  const id = Number(c.req.param('id'));
  await revokeApiKey(id);
  return c.json({ ok: true });
});

protectedRoutes.get('/settings', async (c) => {
  const stored = await getResendApiKey();
  return c.json({
    resend_api_key_set: Boolean(stored),
    default_from: (await getSetting(SETTING_KEYS.DEFAULT_FROM)) ?? '',
    retry_count: (await getSetting(SETTING_KEYS.RETRY_COUNT)) ?? '3',
    attachment_max_bytes: (await getSetting(SETTING_KEYS.ATTACHMENT_MAX_BYTES)) ?? String(5 * 1024 * 1024),
  });
});

const settingsSchema = z.object({
  resend_api_key: z.string().optional(),
  default_from: z.string().optional(),
  retry_count: z.union([z.string(), z.number()]).optional(),
  attachment_max_bytes: z.union([z.string(), z.number()]).optional(),
});

protectedRoutes.put('/settings', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_payload', details: parsed.error.flatten() }, 400);
  const d = parsed.data;
  if (d.resend_api_key !== undefined && d.resend_api_key.length > 0) {
    await setSetting(SETTING_KEYS.RESEND_API_KEY, d.resend_api_key, true);
  }
  if (d.default_from !== undefined) await setSetting(SETTING_KEYS.DEFAULT_FROM, d.default_from);
  if (d.retry_count !== undefined) await setSetting(SETTING_KEYS.RETRY_COUNT, String(d.retry_count));
  if (d.attachment_max_bytes !== undefined) {
    await setSetting(SETTING_KEYS.ATTACHMENT_MAX_BYTES, String(d.attachment_max_bytes));
  }
  return c.json({ ok: true });
});

adminApi.route('/', protectedRoutes);
