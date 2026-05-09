import { Resend } from 'resend';
import type { SendEmailInput } from '../schemas/sendEmail.js';
import { getResendApiKey, getRetryCount } from './settings.js';

export interface ResendSendResult {
  ok: boolean;
  resendId?: string;
  error?: string;
  attempts: number;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendViaResend(input: SendEmailInput, fromOverride?: string): Promise<ResendSendResult> {
  const apiKey = await getResendApiKey();
  if (!apiKey) {
    return { ok: false, error: 'Resend API key is not configured', attempts: 0 };
  }
  const client = new Resend(apiKey);
  const maxAttempts = Math.max(1, await getRetryCount());

  const payload = {
    from: input.from ?? fromOverride ?? '',
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    replyTo: input.reply_to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    headers: input.headers,
    attachments: input.attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content_base64, 'base64'),
      contentType: a.content_type,
    })),
    tags: input.tags,
  } as Parameters<typeof client.emails.send>[0];

  let lastError = 'unknown error';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data, error } = await client.emails.send(payload);
      if (error) {
        lastError = error.message ?? JSON.stringify(error);
        const status = (error as { statusCode?: number }).statusCode;
        if (status && status >= 400 && status < 500) {
          return { ok: false, error: lastError, attempts: attempt };
        }
      } else if (data?.id) {
        return { ok: true, resendId: data.id, attempts: attempt };
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (attempt < maxAttempts) {
      await sleep(2 ** attempt * 250);
    }
  }
  return { ok: false, error: lastError, attempts: maxAttempts };
}
