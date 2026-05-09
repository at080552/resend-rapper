import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { settings } from '../db/schema.js';
import { decrypt, encrypt } from './crypto.js';
import { config } from '../config.js';

export const SETTING_KEYS = {
  RESEND_API_KEY: 'resend_api_key',
  DEFAULT_FROM: 'default_from',
  DEFAULT_REPLY_TO: 'default_reply_to',
  RETRY_COUNT: 'retry_count',
  ATTACHMENT_MAX_BYTES: 'attachment_max_bytes',
  ALLOWED_FROM_DOMAINS: 'allowed_from_domains',
  LOG_RETENTION_DAYS: 'log_retention_days',
  RATE_LIMIT_PER_KEY_PER_MIN: 'rate_limit_per_key_per_min',
} as const;

export async function getSetting(key: string): Promise<string | null> {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return null;
  if (!row.encrypted) return row.value;
  try {
    return decrypt(row.value);
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string, encrypted = false): Promise<void> {
  const stored = encrypted ? encrypt(value) : value;
  db.insert(settings)
    .values({ key, value: stored, encrypted, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: stored, encrypted, updatedAt: new Date() },
    })
    .run();
}

export async function getResendApiKey(): Promise<string | null> {
  const stored = await getSetting(SETTING_KEYS.RESEND_API_KEY);
  if (stored) return stored;
  return config.resendApiKeyEnv ?? null;
}

export async function getRetryCount(): Promise<number> {
  const v = await getSetting(SETTING_KEYS.RETRY_COUNT);
  return v ? Number(v) : 3;
}

export async function getAttachmentMaxBytes(): Promise<number> {
  const v = await getSetting(SETTING_KEYS.ATTACHMENT_MAX_BYTES);
  return v ? Number(v) : 5 * 1024 * 1024;
}

export async function getAllowedFromDomains(): Promise<string[]> {
  const v = await getSetting(SETTING_KEYS.ALLOWED_FROM_DOMAINS);
  if (!v) return [];
  return v
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function getLogRetentionDays(): Promise<number> {
  const v = await getSetting(SETTING_KEYS.LOG_RETENTION_DAYS);
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function getDefaultReplyTo(): Promise<string[]> {
  const v = await getSetting(SETTING_KEYS.DEFAULT_REPLY_TO);
  if (!v) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function getRateLimitPerKeyPerMin(): Promise<number> {
  const v = await getSetting(SETTING_KEYS.RATE_LIMIT_PER_KEY_PER_MIN);
  if (!v) return 60;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 60;
}
