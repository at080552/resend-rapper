import { and, desc, eq, isNull } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';
import { db } from '../db/client.js';
import { apiKeys } from '../db/schema.js';
import { sha256 } from './crypto.js';

const tokenAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const generateToken = customAlphabet(tokenAlphabet, 40);

export interface IssuedKey {
  id: number;
  name: string;
  prefix: string;
  plainKey: string;
}

export async function issueApiKey(name: string): Promise<IssuedKey> {
  const raw = generateToken();
  const plainKey = `rrk_${raw}`;
  const prefix = plainKey.slice(0, 12);
  const keyHash = sha256(plainKey);
  const inserted = db
    .insert(apiKeys)
    .values({ name, keyHash, prefix, createdAt: new Date() })
    .returning()
    .get();
  return { id: inserted.id, name: inserted.name, prefix, plainKey };
}

export async function verifyApiKey(plainKey: string) {
  const keyHash = sha256(plainKey);
  const row = db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
    .get();
  if (!row) return null;
  db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id)).run();
  return row;
}

export async function revokeApiKey(id: number): Promise<void> {
  db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id)).run();
}

export async function listApiKeys() {
  return db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt)).all();
}
