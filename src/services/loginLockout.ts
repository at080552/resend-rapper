const MAX_FAILED = 8;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

interface Entry {
  failures: { at: number }[];
  lockedUntil: number;
}

const byKey = new Map<string, Entry>();

function get(key: string): Entry {
  let e = byKey.get(key);
  if (!e) {
    e = { failures: [], lockedUntil: 0 };
    byKey.set(key, e);
  }
  return e;
}

export function isLocked(key: string): { locked: boolean; retryAfterMs: number } {
  const e = get(key);
  const now = Date.now();
  if (e.lockedUntil > now) {
    return { locked: true, retryAfterMs: e.lockedUntil - now };
  }
  return { locked: false, retryAfterMs: 0 };
}

export function recordFailure(key: string): { locked: boolean; remaining: number } {
  const e = get(key);
  const now = Date.now();
  e.failures = e.failures.filter((f) => now - f.at < WINDOW_MS);
  e.failures.push({ at: now });
  if (e.failures.length >= MAX_FAILED) {
    e.lockedUntil = now + LOCK_MS;
    e.failures = [];
    return { locked: true, remaining: 0 };
  }
  return { locked: false, remaining: MAX_FAILED - e.failures.length };
}

export function recordSuccess(key: string): void {
  byKey.delete(key);
}
