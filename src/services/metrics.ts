import { gte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { emailLogs } from '../db/schema.js';

export interface MetricsSummary {
  windowHours: number;
  total: number;
  sent: number;
  failed: number;
  pending: number;
  successRate: number;
  series: { bucket: string; sent: number; failed: number }[];
}

function bucketSize(windowHours: number): number {
  if (windowHours <= 24) return 60 * 60 * 1000;
  if (windowHours <= 24 * 7) return 6 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

export async function getMetrics(windowHours = 24): Promise<MetricsSummary> {
  const since = new Date(Date.now() - windowHours * 3600 * 1000);
  const rows = db
    .select({ status: emailLogs.status, createdAt: emailLogs.createdAt })
    .from(emailLogs)
    .where(gte(emailLogs.createdAt, since))
    .all();

  const total = rows.length;
  const sent = rows.filter((r) => r.status === 'sent').length;
  const failed = rows.filter((r) => r.status === 'failed').length;
  const pending = rows.filter((r) => r.status === 'pending').length;
  const successRate = total === 0 ? 0 : sent / total;

  const size = bucketSize(windowHours);
  const buckets = new Map<number, { sent: number; failed: number }>();
  for (const r of rows) {
    const key = Math.floor(r.createdAt.getTime() / size) * size;
    const cur = buckets.get(key) ?? { sent: 0, failed: 0 };
    if (r.status === 'sent') cur.sent++;
    else if (r.status === 'failed') cur.failed++;
    buckets.set(key, cur);
  }
  const series = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ts, v]) => ({ bucket: new Date(ts).toISOString(), sent: v.sent, failed: v.failed }));

  return { windowHours, total, sent, failed, pending, successRate, series };
}

export async function lifetimeCount() {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(emailLogs)
    .get();
  return row?.count ?? 0;
}
