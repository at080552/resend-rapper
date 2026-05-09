# Resend Rapper

A small, self-hosted HTTP wrapper that lets **legacy applications** (Rails 2,
old PHP, vintage cron scripts, IoT firmware) send mail through
[Resend](https://resend.com) — even when the client cannot negotiate modern TLS.

The wrapper accepts plain HTTP on your trusted network and forwards each
message over modern TLS to Resend, while keeping a full audit log, metrics,
and a friendly admin web UI.

> **日本語**: Rails 2 など TLS 1.2+ を喋れない古い環境から、ローカル LAN を
> 経由して Resend へメールを投げるためのラッパー Web アプリです。送信ログ・
> メトリクス・API キー管理・再送/テスト送信を Web UI から扱えます。

---

## Features

- **HTTP `POST /api/v1/send`** — JSON in, Resend message id out
- **API-key auth** — issue & revoke keys per client app, scope each key to specific from-domains
- **Admin web UI** — dashboard, log search with HTML preview, resend button, test send, audit log
- **Persistent SQLite** — every send is logged with status, attempts, and error
- **Encrypted secrets** — Resend API key is AES-256-GCM-encrypted at rest
- **Anti-abuse** — strict secret validation, per-key send rate limit, login lockout, CSRF/Origin checks, secure headers, body-size cap, from-domain allowlist, log retention sweeper, audit log
- **Single container** — runs on Docker, docker-compose, Railway, Render, Fly.io
- **Rails 2 example** — drop-in `delivery_method = :resend_wrapper` adapter

## Architecture

```
Rails 2 / legacy app ──[plain HTTP, internal LAN]──▶ Resend Rapper ──[TLS 1.3]──▶ Resend API
                                                          │
                                                          ├─ SQLite (logs, keys, settings)
                                                          └─ Admin Web UI (React SPA)
```

## Quick start (Docker)

```bash
git clone https://github.com/at080552/resend-rapper.git
cd resend-rapper
cp .env.example .env
# generate strong secrets — the app refuses to start without them
echo "MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" >> .env
echo "SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" >> .env

docker compose up --build -d
docker compose exec resend-rapper node dist/cli/createAdmin.js \
  --username admin --password 'change-me-now-please'
open http://localhost:3000/admin
```

Then:

1. Sign in to `/admin` with the admin you just created.
2. Open **Settings** → paste your Resend API key (it gets encrypted).
3. Open **API Keys** → create a key for your legacy client. Copy it now — you won't see it again.
4. From the legacy client, `POST` to `http://<host>:3000/api/v1/send`.

## Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

1. Click the button (or fork this repo and create a new Railway project from it).
2. Add a **Volume** mounted at `/data` so your SQLite database survives restarts.
3. Set environment variables: `MASTER_KEY`, `SESSION_SECRET`, optionally `RESEND_API_KEY`.
4. Deploy. Once the service is up, exec into the container to run
   `node dist/cli/createAdmin.js` and create your first admin user.

`railway.json` configures the build (Dockerfile) and a `/healthz` healthcheck.

## API

### `POST /api/v1/send`

Request:

```http
POST /api/v1/send HTTP/1.1
X-API-Key: rrk_...
Content-Type: application/json

{
  "from": "Acme <noreply@acme.com>",
  "to": ["alice@example.com"],
  "cc": [],
  "bcc": [],
  "reply_to": "support@acme.com",
  "subject": "Hello",
  "html": "<p>Hi.</p>",
  "text": "Hi.",
  "headers": {"X-Foo": "bar"},
  "attachments": [
    {"filename": "doc.pdf", "content_base64": "JVBERi0xLjQK...", "content_type": "application/pdf"}
  ]
}
```

Response (200):

```json
{ "id": 42, "resend_id": "abc123", "status": "sent" }
```

Response (502 on upstream failure):

```json
{ "id": 42, "status": "failed", "error": "..." }
```

Other endpoints:

- `GET /api/v1/messages/:id` — status of a previously submitted message (auth: same API key)
- `GET /healthz` — liveness probe

## Rails 2 integration

```ruby
# lib/resend_wrapper_mailer.rb  (copy from examples/rails2/)
require 'resend_wrapper_mailer'

# config/initializers/resend_wrapper.rb
ActionMailer::Base.delivery_method = :resend_wrapper
ActionMailer::Base.resend_wrapper_settings = {
  :endpoint => 'http://10.0.0.5:3000/api/v1/send',
  :api_key  => ENV['RESEND_WRAPPER_API_KEY']
}
```

After that, every `ActionMailer` `deliver` call goes through Resend Rapper.
See [`examples/rails2/`](examples/rails2/) for the full adapter.

## Managing admin credentials

**Initial admin** (one-shot, container or shell):

```bash
docker compose exec resend-rapper node dist/cli/createAdmin.js \
  --username admin --password 'pick-a-strong-one'
```

**Reset password from CLI** (forgot password / lost-key recovery):

```bash
docker compose exec resend-rapper node dist/cli/createAdmin.js \
  --username admin --password 'new-strong-password' --reset
```

The CLI is the same script — without `--reset` it refuses to overwrite an
existing user; with `--reset` it updates the password and invalidates **all**
active sessions for that user.

**Change password / username from the admin UI**: sign in → **Account**.
Successful password change signs you out of every device.

## Local development

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run create-admin
npm run dev          # API on :3000
# in another shell:
cd web && npm run dev   # admin UI on :5173 (proxies to :3000)
```

## Security

- **Trusted network only.** The client API path uses plain HTTP for legacy clients.
  Keep `/api/v1/*` reachable only from your internal network or VPN.
- **Strict secrets.** `MASTER_KEY` and `SESSION_SECRET` must be ≥ 32 chars and not
  placeholder-ish — the app refuses to start otherwise.
- **API keys.** Stored as SHA-256 hashes; the plain value is shown **once** at issue.
  Each key can be scoped to specific from-domains; otherwise the global allowlist
  in Settings applies.
- **At-rest encryption.** Resend API key is encrypted with AES-256-GCM. Back up
  `MASTER_KEY` — losing it makes the encrypted value unrecoverable.
- **Admin auth.** Argon2id password hashing, `SameSite=Strict` session cookie,
  `secure` flag enabled in production / behind a trusted proxy. CSRF guarded by
  Origin/Referer validation.
- **Anti-abuse.**
  - Login: 10/min per IP rate limit + 8 failures in 15 min → 15 min lockout
    (per username and per IP).
  - Send API: configurable per-API-key rate limit (default 60/min).
  - Body size: hard cap (default 10 MB).
  - From-domain allowlist enforced per request.
- **Retention.** `Settings → log retention days` purges old `email_logs`
  (including attachments) on an hourly sweeper.
- **Audit log.** All admin mutations and auth attempts are logged with IP and
  user-agent; visible at `/admin/audit`.
- **Headers.** CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: same-origin` applied globally.

## Documentation

- 📖 **Online manual** (white-background, graphical): <https://at080552.github.io/resend-rapper/manual.html>
- Source: [`docs/manual.html`](docs/manual.html) — single file, no external assets, opens in any browser
- Implementation plan: [`docs/plan.md`](docs/plan.md)

## License

MIT
