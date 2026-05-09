import { hash, verify } from '@node-rs/argon2';
import { eq, lt } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import { adminUsers, sessions } from '../db/schema.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

export async function createAdmin(username: string, password: string) {
  const passwordHash = await hash(password);
  return db
    .insert(adminUsers)
    .values({ username, passwordHash, createdAt: new Date() })
    .returning()
    .get();
}

export async function adminCount(): Promise<number> {
  return db.select().from(adminUsers).all().length;
}

export async function authenticate(username: string, password: string) {
  const user = db.select().from(adminUsers).where(eq(adminUsers.username, username)).get();
  if (!user) return null;
  const ok = await verify(user.passwordHash, password);
  return ok ? user : null;
}

export async function createSession(userId: number) {
  const id = nanoid(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  db.insert(sessions).values({ id, userId, expiresAt }).run();
  return { id, expiresAt };
}

export async function getSessionUser(sessionId: string) {
  const now = new Date();
  const row = db
    .select({
      session: sessions,
      user: adminUsers,
    })
    .from(sessions)
    .innerJoin(adminUsers, eq(sessions.userId, adminUsers.id))
    .where(eq(sessions.id, sessionId))
    .get();
  if (!row) return null;
  if (row.session.expiresAt.getTime() < now.getTime()) {
    db.delete(sessions).where(eq(sessions.id, sessionId)).run();
    return null;
  }
  return row.user;
}

export async function destroySession(sessionId: string) {
  db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}

export async function purgeExpiredSessions() {
  db.delete(sessions).where(lt(sessions.expiresAt, new Date())).run();
}
