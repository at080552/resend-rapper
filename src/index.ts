import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from './config.js';
import { initSchema } from './db/init.js';
import { adminApi } from './routes/adminApi.js';
import { clientApi } from './routes/clientApi.js';
import { adminCount } from './services/auth.js';
import { purgeOlderThan } from './services/emailLog.js';
import { getLogRetentionDays } from './services/settings.js';

initSchema();

const app = new Hono();
app.use('*', logger());
app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameSrc: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
    referrerPolicy: 'same-origin',
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
  }),
);

app.get('/', (c) => c.redirect('/admin/'));
app.get('/healthz', (c) => c.json({ ok: true }));

app.get('/setup-status', async (c) => c.json({ has_admin: (await adminCount()) > 0 }));

app.route('/api/v1', clientApi);
app.route('/admin/api', adminApi);

const webDist = resolve(process.cwd(), 'web/dist');
if (existsSync(webDist)) {
  app.use(
    '/admin/*',
    serveStatic({
      root: './web/dist',
      rewriteRequestPath: (p) => p.replace(/^\/admin/, ''),
    }),
  );
  app.get('/admin/*', (c) => {
    const indexPath = join(webDist, 'index.html');
    if (!existsSync(indexPath)) return c.text('admin UI build missing', 500);
    return c.html(readFileSync(indexPath, 'utf8'));
  });
} else {
  app.get('/admin/*', (c) =>
    c.html(
      `<!doctype html><html><body style="font-family:system-ui;padding:2rem"><h1>Admin UI not built</h1><p>Run <code>npm run build:web</code> to build the admin SPA.</p></body></html>`,
    ),
  );
}

async function runRetentionSweep(): Promise<void> {
  try {
    const days = await getLogRetentionDays();
    if (days <= 0) return;
    const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
    const purged = await purgeOlderThan(cutoff);
    if (purged > 0) {
      console.log(`[retention] purged ${purged} email_logs older than ${days}d`);
    }
  } catch (err) {
    console.error('[retention] sweep error', err);
  }
}

void runRetentionSweep();
setInterval(() => {
  void runRetentionSweep();
}, 60 * 60 * 1000).unref();

console.log(`resend-rapper listening on http://${config.host}:${config.port}`);
serve({ fetch: app.fetch, hostname: config.host, port: config.port });
