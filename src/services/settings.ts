import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { settings } from '../db/schema.js';
import { decrypt, encrypt } from './crypto.js';
import { config } from '../config.js';

export const SETTING_KEYS = {
  RESEND_API_KEY: 'resend_api_key',
  DEFAULT_FROM: 'default_from',
  RETRY_COUNT: 'retry_count',
  ATTACHMENT_MAX_BYTES: 'attachment_max_bytes',
} as const;

export async function getSetting(key: string): Promise<string | null> {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return null;
  return row.encrypted ? decrypt(row.value) : row.value;
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
