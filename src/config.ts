import 'dotenv/config';

const MIN_SECRET_LEN = 32;
const PLACEHOLDER_RE = /^(dev|test|change|example|placeholder|secret|todo|please|xxx)/i;

function strictSecret(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is required. Generate with:\n  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  }
  if (v.length < MIN_SECRET_LEN) {
    throw new Error(`${name} must be at least ${MIN_SECRET_LEN} characters long`);
  }
  if (PLACEHOLDER_RE.test(v)) {
    throw new Error(`${name} looks like a placeholder. Use a real random secret.`);
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  databasePath: process.env.DATABASE_PATH ?? './data/resend_rapper.sqlite',
  masterKey: strictSecret('MASTER_KEY'),
  sessionSecret: strictSecret('SESSION_SECRET'),
  resendApiKeyEnv: process.env.RESEND_API_KEY,
  trustProxy: process.env.TRUST_PROXY === 'true',
  maxBodyBytes: Number(process.env.MAX_BODY_BYTES ?? 10 * 1024 * 1024),
  allowedAdminOrigins: (process.env.ADMIN_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

export type AppConfig = typeof config;
