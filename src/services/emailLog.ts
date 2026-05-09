import { and, desc, eq, like, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { attachments, emailLogs } from '../db/schema.js';
import type { SendEmailInput } from '../schemas/sendEmail.js';

export interface CreateLogInput {
  apiKeyId: number | null;
  input: SendEmailInput;
  fromAddr: string;
}

export async function createPendingLog({ apiKeyId, input, fromAddr }: CreateLogInput) {
  const log = db
    .insert(emailLogs)
    .values({
      apiKeyId: apiKeyId ?? undefined,
      fromAddr,
      toJson: JSON.stringify(input.to),
      ccJson: input.cc ? JSON.stringify(input.cc) : null,
      bccJson: input.bcc ? JSON.stringify(input.bcc) : null,
      replyTo: input.reply_to ? JSON.stringify(input.reply_to) : null,
      subject: input.subject,
      html: input.html ?? null,
      textBody: input.text ?? null,
      headersJson: input.headers ? JSON.stringify(input.headers) : null,
      status: 'pending',
      attempts: 0,
      createdAt: new Date(),
    })
    .returning()
    .get();

  if (input.attachments?.length) {
    for (const a of input.attachments) {
      const buf = Buffer.from(a.content_base64, 'base64');
      db.insert(attachments)
        .values({
          emailLogId: log.id,
          filename: a.filename,
          contentType: a.content_type ?? null,
          sizeBytes: buf.byteLength,
          contentBlob: buf,
        })
        .run();
    }
  }
  return log;
}

export async function markSent(id: number, resendId: string, attempts: number) {
  db.update(emailLogs)
    .set({ status: 'sent', resendId, attempts, sentAt: new Date(), errorMessage: null })
    .where(eq(emailLogs.id, id))
    .run();
}

export async function markFailed(id: number, error: string, attempts: number) {
  db.update(emailLogs)
    .set({ status: 'failed', errorMessage: error, attempts })
    .where(eq(emailLogs.id, id))
    .run();
}

export interface ListLogsOptions {
  status?: 'pending' | 'sent' | 'failed';
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listLogs(opts: ListLogsOptions = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const conditions = [];
  if (opts.status) conditions.push(eq(emailLogs.status, opts.status));
  if (opts.search) {
    const q = `%${opts.search}%`;
    conditions.push(
      sql`(${like(emailLogs.subject, q)} OR ${like(emailLogs.toJson, q)} OR ${like(emailLogs.fromAddr, q)})`,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const rows = db
    .select()
    .from(emailLogs)
    .where(where)
    .orderBy(desc(emailLogs.createdAt))
    .limit(limit)
    .offset(offset)
    .all();
  const totalRow = db
    .select({ count: sql<number>`count(*)` })
    .from(emailLogs)
    .where(where)
    .get();
  return { rows, total: totalRow?.count ?? 0, limit, offset };
}

export async function getLog(id: number) {
  const row = db.select().from(emailLogs).where(eq(emailLogs.id, id)).get();
  if (!row) return null;
  const atts = db.select().from(attachments).where(eq(attachments.emailLogId, id)).all();
  return { ...row, attachments: atts };
}
