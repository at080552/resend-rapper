import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databasePath: process.env.DATABASE_PATH ?? './data/resend_rapper.sqlite',
  masterKey: required('MASTER_KEY', 'dev-master-key-change-me-0123456789abcdef0123456789abcdef'),
  sessionSecret: required('SESSION_SECRET', 'dev-session-secret-change-me-0123456789abcdef0123456789abcdef'),
  resendApiKeyEnv: process.env.RESEND_API_KEY,
};

export type AppConfig = typeof config;
