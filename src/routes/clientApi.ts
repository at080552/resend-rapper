import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { apiKeyAuth } from '../middleware/apiKeyAuth.js';
import { sendEmailSchema } from '../schemas/sendEmail.js';
import { db } from '../db/client.js';
import { emailLogs } from '../db/schema.js';
import { createPendingLog, markFailed, markSent } from '../services/emailLog.js';
import { sendViaResend } from '../services/resend.js';
import { getSetting, SETTING_KEYS, getAttachmentMaxBytes } from '../services/settings.js';
import type { ApiKey } from '../db/schema.js';

type Variables = { apiKey: ApiKey };
export const clientApi = new Hono<{ Variables: Variables }>();

clientApi.use('*', apiKeyAuth);

clientApi.post('/send', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = sendEmailSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_payload', details: parsed.error.flatten() }, 400);
  }
  const input = parsed.data;

  if (input.attachments?.length) {
    const max = await getAttachmentMaxBytes();
    let total = 0;
    for (const a of input.attachments) {
      total += Buffer.byteLength(a.content_base64, 'base64');
    }
    if (total > max) {
      return c.json({ error: 'attachment_too_large', max_bytes: max }, 413);
    }
  }

  const defaultFrom = (await getSetting(SETTING_KEYS.DEFAULT_FROM)) ?? '';
  const fromAddr = input.from ?? defaultFrom;
  if (!fromAddr) {
    return c.json({ error: 'from_required', hint: 'Provide "from" or set default_from in settings' }, 400);
  }

  const apiKey = c.get('apiKey');
  const log = await createPendingLog({ apiKeyId: apiKey.id, input, fromAddr });

  const result = await sendViaResend({ ...input, from: fromAddr }, defaultFrom);
  if (result.ok && result.resendId) {
    await markSent(log.id, result.resendId, result.attempts);
    return c.json({ id: log.id, resend_id: result.resendId, status: 'sent' });
  }
  await markFailed(log.id, result.error ?? 'unknown', result.attempts);
  return c.json({ id: log.id, status: 'failed', error: result.error }, 502);
});

clientApi.get('/messages/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'invalid_id' }, 400);
  const apiKey = c.get('apiKey');
  const row = db.select().from(emailLogs).where(eq(emailLogs.id, id)).get();
  if (!row || row.apiKeyId !== apiKey.id) {
    return c.json({ error: 'not_found' }, 404);
  }
  return c.json({
    id: row.id,
    status: row.status,
    resend_id: row.resendId,
    error: row.errorMessage,
    attempts: row.attempts,
    created_at: row.createdAt,
    sent_at: row.sentAt,
  });
});

clientApi.get('/health', (c) => c.json({ ok: true }));
