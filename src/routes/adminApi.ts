import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { apiKeys, emailLogs } from '../db/schema.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { csrf } from '../middleware/csrf.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { bodyLimit } from '../middleware/bodyLimit.js';
import {
  authenticate,
  createSession,
  destroySession,
} from '../services/auth.js';
import {
  isLocked,
  recordFailure,
  recordSuccess,
} from '../services/loginLockout.js';
import {
  issueApiKey,
  listApiKeys,
  revokeApiKey,
  setApiKeyAllowedDomains,
} from '../services/apiKey.js';
import { getLog, listLogs, markFailed, markSent, createPendingLog } from '../services/emailLog.js';
import { getMetrics, lifetimeCount } from '../services/metrics.js';
import {
  SETTING_KEYS,
  getResendApiKey,
  getSetting,
  setSetting,
  getDefaultReplyTo,
} from '../services/settings.js';
import { sendViaResend } from '../services/resend.js';
import { sendEmailSchema } from '../schemas/sendEmail.js';
import { validateFrom } from '../services/fromValidation.js';
import { writeAuditFromContext, listAudit, getRequestIp } from '../services/audit.js';
import { config } from '../config.js';
import type { AdminUser } from '../db/schema.js';

type Variables = { adminUser: AdminUser };
export const adminApi = new Hono<{ Variables: Variables }>();

adminApi.use('*', bodyLimit(config.maxBodyBytes));
adminApi.use('*', csrf);

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

adminApi.use(
  '/login',
  rateLimit({
    windowMs: 60_000,
    max: 10,
    keyer: (c) => getRequestIp(c) ?? 'unknown',
    scope: 'login',
  }),
);

adminApi.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_payload' }, 400);

  const ip = getRequestIp(c) ?? 'unknown';
  const username = parsed.data.username;
  const lockKeyUser = `u:${username}`;
  const lockKeyIp = `i:${ip}`;

  const u = isLocked(lockKeyUser);
  const i = isLocked(lockKeyIp);
  if (u.locked || i.locked) {
    const retry = Math.max(u.retryAfterMs, i.retryAfterMs);
    c.header('Retry-After', String(Math.ceil(retry / 1000)));
    writeAuditFromContext(c, {
      action: 'admin.login.locked',
      metadata: { username, retry_ms: retry },
    });
    return c.json({ error: 'locked', retry_after_seconds: Math.ceil(retry / 1000) }, 429);
  }

  const user = await authenticate(username, parsed.data.password);
  if (!user) {
    const a = recordFailure(lockKeyUser);
    const b = recordFailure(lockKeyIp);
    writeAuditFromContext(c, {
      action: 'admin.login.failed',
      metadata: { username, locked: a.locked || b.locked },
    });
    return c.json({ error: 'invalid_credentials' }, 401);
  }
  recordSuccess(lockKeyUser);
  recordSuccess(lockKeyIp);

  const session = await createSession(user.id);
  setCookie(c, 'rr_session', session.id, {
    httpOnly: true,
    sameSite: 'Strict',
    secure: config.isProd || config.trustProxy,
    path: '/',
    expires: session.expiresAt,
  });
  writeAuditFromContext(c, {
    action: 'admin.login.success',
    actorUserId: user.id,
    metadata: { username: user.username },
  });
  return c.json({ id: user.id, username: user.username });
});

adminApi.post('/logout', async (c) => {
  const sid = getCookie(c, 'rr_session');
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
  writeAuditFromContext(c, {
    action: 'admin.email.resend',
    actorUserId: c.get('adminUser').id,
    targetType: 'email_log',
    targetId: id,
    metadata: { new_log_id: newLog.id, status: result.ok ? 'sent' : 'failed' },
  });
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
  const fv = await validateFrom(fromAddr, null);
  if (!fv.ok) {
    return c.json({ error: fv.reason ?? 'from_rejected', domain: fv.domain, allowed_domains: fv.allowed }, 403);
  }
  let replyTo = parsed.data.reply_to;
  if (replyTo === undefined) {
    const def = await getDefaultReplyTo();
    if (def.length > 0) replyTo = def;
  }
  if (replyTo && replyTo.length === 0) replyTo = undefined;
  const finalInput = { ...parsed.data, from: fromAddr, reply_to: replyTo };
  const log = await createPendingLog({ apiKeyId: null, input: finalInput, fromAddr });
  const result = await sendViaResend(finalInput);
  writeAuditFromContext(c, {
    action: 'admin.email.test_send',
    actorUserId: c.get('adminUser').id,
    targetType: 'email_log',
    targetId: log.id,
    metadata: { status: result.ok ? 'sent' : 'failed' },
  });
  if (result.ok && result.resendId) {
    await markSent(log.id, result.resendId, result.attempts);
    return c.json({ id: log.id, resend_id: result.resendId, status: 'sent' });
  }
  await markFailed(log.id, result.error ?? 'unknown', result.attempts);
  return c.json({ id: log.id, status: 'failed', error: result.error }, 502);
});

protectedRoutes.get('/api-keys', async (c) => {
  const rows = await listApiKeys();
  return c.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      prefix: r.prefix,
      allowed_domains: r.allowedDomains ? JSON.parse(r.allowedDomains) : [],
      created_at: r.createdAt,
      last_used_at: r.lastUsedAt,
      revoked_at: r.revokedAt,
    })),
  );
});

const apiKeyCreateSchema = z.object({
  name: z.string().min(1).max(64),
  allowed_domains: z.array(z.string().min(1).max(253)).optional(),
});

protectedRoutes.post('/api-keys', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = apiKeyCreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_payload', details: parsed.error.flatten() }, 400);
  const issued = await issueApiKey(parsed.data.name, parsed.data.allowed_domains ?? []);
  writeAuditFromContext(c, {
    action: 'admin.api_key.issue',
    actorUserId: c.get('adminUser').id,
    targetType: 'api_key',
    targetId: issued.id,
    metadata: { name: issued.name, allowed_domains: parsed.data.allowed_domains ?? [] },
  });
  return c.json(issued);
});

protectedRoutes.put('/api-keys/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => null);
  const parsed = z
    .object({ allowed_domains: z.array(z.string().min(1).max(253)) })
    .safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_payload', details: parsed.error.flatten() }, 400);
  await setApiKeyAllowedDomains(id, parsed.data.allowed_domains);
  writeAuditFromContext(c, {
    action: 'admin.api_key.update',
    actorUserId: c.get('adminUser').id,
    targetType: 'api_key',
    targetId: id,
    metadata: { allowed_domains: parsed.data.allowed_domains },
  });
  return c.json({ ok: true });
});

protectedRoutes.post('/api-keys/:id/revoke', async (c) => {
  const id = Number(c.req.param('id'));
  await revokeApiKey(id);
  writeAuditFromContext(c, {
    action: 'admin.api_key.revoke',
    actorUserId: c.get('adminUser').id,
    targetType: 'api_key',
    targetId: id,
  });
  return c.json({ ok: true });
});

protectedRoutes.get('/audit', async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 100), 1), 500);
  const rows = await listAudit(limit);
  return c.json(rows);
});

protectedRoutes.get('/settings', async (c) => {
  const stored = await getResendApiKey();
  return c.json({
    resend_api_key_set: Boolean(stored),
    default_from: (await getSetting(SETTING_KEYS.DEFAULT_FROM)) ?? '',
    default_reply_to: (await getSetting(SETTING_KEYS.DEFAULT_REPLY_TO)) ?? '',
    retry_count: (await getSetting(SETTING_KEYS.RETRY_COUNT)) ?? '3',
    attachment_max_bytes:
      (await getSetting(SETTING_KEYS.ATTACHMENT_MAX_BYTES)) ?? String(5 * 1024 * 1024),
    allowed_from_domains: (await getSetting(SETTING_KEYS.ALLOWED_FROM_DOMAINS)) ?? '',
    log_retention_days: (await getSetting(SETTING_KEYS.LOG_RETENTION_DAYS)) ?? '0',
    rate_limit_per_key_per_min:
      (await getSetting(SETTING_KEYS.RATE_LIMIT_PER_KEY_PER_MIN)) ?? '60',
  });
});

const settingsSchema = z.object({
  resend_api_key: z.string().optional(),
  default_from: z.string().max(320).optional(),
  default_reply_to: z.string().max(2000).optional(),
  retry_count: z.union([z.string(), z.number()]).optional(),
  attachment_max_bytes: z.union([z.string(), z.number()]).optional(),
  allowed_from_domains: z.string().max(2000).optional(),
  log_retention_days: z.union([z.string(), z.number()]).optional(),
  rate_limit_per_key_per_min: z.union([z.string(), z.number()]).optional(),
});

protectedRoutes.put('/settings', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_payload', details: parsed.error.flatten() }, 400);
  const d = parsed.data;
  const changed: string[] = [];
  if (d.resend_api_key !== undefined && d.resend_api_key.length > 0) {
    await setSetting(SETTING_KEYS.RESEND_API_KEY, d.resend_api_key, true);
    changed.push('resend_api_key');
  }
  if (d.default_from !== undefined) { await setSetting(SETTING_KEYS.DEFAULT_FROM, d.default_from); changed.push('default_from'); }
  if (d.default_reply_to !== undefined) {
    await setSetting(SETTING_KEYS.DEFAULT_REPLY_TO, d.default_reply_to);
    changed.push('default_reply_to');
  }
  if (d.retry_count !== undefined) { await setSetting(SETTING_KEYS.RETRY_COUNT, String(d.retry_count)); changed.push('retry_count'); }
  if (d.attachment_max_bytes !== undefined) {
    await setSetting(SETTING_KEYS.ATTACHMENT_MAX_BYTES, String(d.attachment_max_bytes));
    changed.push('attachment_max_bytes');
  }
  if (d.allowed_from_domains !== undefined) {
    await setSetting(SETTING_KEYS.ALLOWED_FROM_DOMAINS, d.allowed_from_domains);
    changed.push('allowed_from_domains');
  }
  if (d.log_retention_days !== undefined) {
    await setSetting(SETTING_KEYS.LOG_RETENTION_DAYS, String(d.log_retention_days));
    changed.push('log_retention_days');
  }
  if (d.rate_limit_per_key_per_min !== undefined) {
    await setSetting(SETTING_KEYS.RATE_LIMIT_PER_KEY_PER_MIN, String(d.rate_limit_per_key_per_min));
    changed.push('rate_limit_per_key_per_min');
  }
  writeAuditFromContext(c, {
    action: 'admin.settings.update',
    actorUserId: c.get('adminUser').id,
    metadata: { changed },
  });
  return c.json({ ok: true });
});

adminApi.route('/', protectedRoutes);
