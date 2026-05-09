import type { Context } from 'hono';
import { desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { auditLogs } from '../db/schema.js';
import { config } from '../config.js';

export interface AuditEvent {
  action: string;
  actorUserId?: number | null;
  actorApiKeyId?: number | null;
  targetType?: string | null;
  targetId?: string | number | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export function getRequestIp(c: Context): string | null {
  if (config.trustProxy) {
    const xff = c.req.header('x-forwarded-for');
    if (xff) return xff.split(',')[0]?.trim() ?? null;
    const real = c.req.header('x-real-ip');
    if (real) return real;
  }
  // node-server exposes remote address via env.incoming
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
  return incoming?.socket?.remoteAddress ?? null;
}

export function writeAudit(event: AuditEvent): void {
  db.insert(auditLogs)
    .values({
      action: event.action,
      actorUserId: event.actorUserId ?? null,
      actorApiKeyId: event.actorApiKeyId ?? null,
      targetType: event.targetType ?? null,
      targetId: event.targetId !== undefined && event.targetId !== null ? String(event.targetId) : null,
      metadata: event.metadata ? JSON.stringify(event.metadata) : null,
      ip: event.ip ?? null,
      userAgent: event.userAgent ?? null,
      createdAt: new Date(),
    })
    .run();
}

export function writeAuditFromContext(c: Context, event: Omit<AuditEvent, 'ip' | 'userAgent'>): void {
  writeAudit({
    ...event,
    ip: getRequestIp(c),
    userAgent: c.req.header('user-agent') ?? null,
  });
}

export async function listAudit(limit = 100) {
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit).all();
}
