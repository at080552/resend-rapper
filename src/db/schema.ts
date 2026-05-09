import { sqliteTable, text, integer, blob, index } from 'drizzle-orm/sqlite-core';

export const apiKeys = sqliteTable('api_keys', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  prefix: text('prefix').notNull(),
  allowedDomains: text('allowed_domains'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
});

export const emailLogs = sqliteTable(
  'email_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    apiKeyId: integer('api_key_id').references(() => apiKeys.id),
    fromAddr: text('from_addr').notNull(),
    toJson: text('to_json').notNull(),
    ccJson: text('cc_json'),
    bccJson: text('bcc_json'),
    replyTo: text('reply_to'),
    subject: text('subject').notNull(),
    html: text('html'),
    textBody: text('text_body'),
    headersJson: text('headers_json'),
    status: text('status', { enum: ['pending', 'sent', 'failed'] }).notNull(),
    resendId: text('resend_id'),
    errorMessage: text('error_message'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
  },
  (t) => ({
    statusIdx: index('email_logs_status_idx').on(t.status),
    createdIdx: index('email_logs_created_idx').on(t.createdAt),
  }),
);

export const attachments = sqliteTable('attachments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  emailLogId: integer('email_log_id')
    .notNull()
    .references(() => emailLogs.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  contentType: text('content_type'),
  sizeBytes: integer('size_bytes').notNull(),
  contentBlob: blob('content_blob'),
});

export const adminUsers = sqliteTable('admin_users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  encrypted: integer('encrypted', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => adminUsers.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
});

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    actorUserId: integer('actor_user_id'),
    actorApiKeyId: integer('actor_api_key_id'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: text('metadata'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    auditCreatedIdx: index('audit_logs_created_idx').on(t.createdAt),
    auditActionIdx: index('audit_logs_action_idx').on(t.action),
  }),
);

export type ApiKey = typeof apiKeys.$inferSelect;
export type EmailLog = typeof emailLogs.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
