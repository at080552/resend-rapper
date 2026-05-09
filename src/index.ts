import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from './config.js';
import { initSchema } from './db/init.js';
import { adminApi } from './routes/adminApi.js';
import { clientApi } from './routes/clientApi.js';
import { adminCount } from './services/auth.js';

initSchema();

const app = new Hono();
app.use('*', logger());
app.use('/admin/api/*', cors({ origin: '*', credentials: true }));

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

console.log(`resend-rapper listening on http://${config.host}:${config.port}`);
serve({ fetch: app.fetch, hostname: config.host, port: config.port });
