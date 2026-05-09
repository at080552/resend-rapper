# Rails 2 等の TLS 非対応クライアント向け Resend ラッパー Web アプリ

## Context

Rails 2 のような古いフレームワーク／ランタイムは OpenSSL が古く、Resend など現代的メール送信 API が要求する TLS 1.2+ をネゴシエートできない。さらに Rails 2 アプリのサーバーには MTA すら無いことも多い。

そこで「ローカル LAN 内で平文 HTTP を受け取り、サーバー側で現代的 TLS により Resend へ転送する」プロキシ／ラッパー Web アプリを新規構築する。Web 管理画面では送信ログの閲覧・検索、API キー管理、メトリクスダッシュボード、再送／テスト送信を行えるようにする。

作業ディレクトリ `/Users/at/resend_rapper` は空のためゼロから構築する。

## 技術スタック

- **ランタイム**: Node.js 20+ / TypeScript
- **HTTP フレームワーク**: Hono (軽量・型安全。同一プロセスでクライアント API と管理画面の両方を提供)
- **DB**: SQLite (better-sqlite3) + Drizzle ORM (単一ファイルで完結し、運用が楽)
- **バリデーション**: Zod
- **メール送信**: `resend` 公式 SDK
- **管理画面 UI**: React + Vite + Tailwind CSS (Hono が静的ファイルとして配信)
- **認証**:
  - クライアント API → API キー (`X-API-Key` ヘッダ、bcrypt でハッシュ保存)
  - 管理画面 → セッション Cookie + パスワードログイン (`argon2`)
- **テスト**: Vitest + supertest (API 単体)、Playwright (任意で UI E2E)
- **配布 / デプロイ**:
  - Dockerfile (multi-stage、distroless or `node:20-slim` ベース、最終イメージ < 200MB)
  - `docker-compose.yml` でローカル起動 (SQLite は名前付きボリューム)
  - **Railway 対応**: `railway.json` を同梱しワンクリックデプロイ可能に。永続ストレージは Railway Volume をマウント (`/data`) して SQLite を置く
  - 同様に Render / Fly.io でも動くよう `PORT` 環境変数のみで稼働するように設計
- **公開**: GitHub にパブリックリポジトリ (`resend-rapper` を想定) を作成、本プランファイルもリポジトリに同梱して共有
- **マニュアル**: ルートに `docs/manual.html` を配置 (背景白基調・グラフィカル・単一ファイル)。同内容を GitHub Pages でも公開

## アーキテクチャ概要

```
Rails 2 / 旧システム ──[平文 HTTP POST]──▶  ラッパー (Hono) ──[HTTPS/TLS1.3]──▶  Resend API
                                                │
                                                ├─ SQLite (ログ・設定・APIキー)
                                                └─ 管理 Web UI (React SPA)
```

- 単一プロセス・単一ポートで稼働 (例: `:3000`)
  - `POST /api/v1/send` → クライアント向け送信 API
  - `GET  /api/v1/messages/:id` → 送信状況確認
  - `/admin/*` → 管理 SPA (静的)
  - `/admin/api/*` → 管理画面用 API
- 平文 HTTP 待受は **クライアント API のみ**、管理画面は別ポート or リバースプロキシで HTTPS 化を推奨 (README に明記)

## ディレクトリ構成

```
resend_rapper/
├─ package.json
├─ tsconfig.json
├─ drizzle.config.ts
├─ Dockerfile
├─ docker-compose.yml
├─ railway.json               ← Railway デプロイ設定
├─ .env.example
├─ README.md                  ← クイックスタート + Rails 2 連携サンプル
├─ docs/
│  ├─ manual.html             ← グラフィカル HTML マニュアル (白基調、単一ファイル)
│  ├─ assets/                 ← 図版 SVG / スクショ
│  └─ plan.md                 ← 本プランをコピー (GitHub 共有用)
├─ data/                      ← SQLite ファイル置き場 (gitignore)
├─ src/
│  ├─ index.ts                ← エントリ (Hono 起動)
│  ├─ config.ts               ← env 読込
│  ├─ db/
│  │  ├─ client.ts
│  │  ├─ schema.ts            ← Drizzle スキーマ
│  │  └─ migrations/
│  ├─ services/
│  │  ├─ resend.ts            ← Resend SDK ラッパ + リトライ
│  │  ├─ apiKey.ts            ← 発行・ハッシュ・検証
│  │  ├─ emailLog.ts          ← ログ書込/検索
│  │  └─ metrics.ts           ← 集計
│  ├─ middleware/
│  │  ├─ apiKeyAuth.ts
│  │  └─ adminAuth.ts
│  ├─ routes/
│  │  ├─ clientApi.ts         ← /api/v1/*
│  │  └─ adminApi.ts          ← /admin/api/*
│  └─ schemas/
│     └─ sendEmail.ts         ← Zod 定義
├─ web/                       ← 管理 SPA (Vite)
│  ├─ vite.config.ts
│  ├─ index.html
│  └─ src/
│     ├─ main.tsx
│     ├─ App.tsx
│     ├─ pages/
│     │  ├─ Login.tsx
│     │  ├─ Dashboard.tsx     ← メトリクス
│     │  ├─ Logs.tsx          ← 検索・本文プレビュー
│     │  ├─ ApiKeys.tsx
│     │  └─ Settings.tsx      ← Resend API キー等
│     └─ components/
└─ examples/
   └─ rails2/
      └─ resend_wrapper_mailer.rb   ← Net::HTTP で叩くサンプル
```

## DB スキーマ (Drizzle)

| テーブル | 主なカラム |
| --- | --- |
| `api_keys` | id, name, key_hash, prefix (UI 表示用先頭 8 文字), created_at, last_used_at, revoked_at |
| `email_logs` | id, api_key_id, from_addr, to_json, cc_json, bcc_json, reply_to, subject, html, text, headers_json, status (`pending`/`sent`/`failed`), resend_id, error_message, created_at, sent_at |
| `attachments` | id, email_log_id, filename, content_type, size_bytes, content_blob (≤2MB) or path |
| `admin_users` | id, username, password_hash, created_at |
| `settings` | key, value (Resend API キーは AES-GCM 暗号化、key は `RESEND_API_KEY` 等) |

## クライアント API 仕様

### `POST /api/v1/send`

- ヘッダ: `X-API-Key: <key>`、`Content-Type: application/json`
- ボディ (Zod で検証):
  ```json
  {
    "from": "noreply@example.com",
    "to": ["a@example.com"],
    "cc": [],
    "bcc": [],
    "reply_to": "support@example.com",
    "subject": "件名",
    "html": "<p>...</p>",
    "text": "...",
    "headers": {"X-Foo": "bar"},
    "attachments": [
      {"filename": "a.pdf", "content_base64": "..."}
    ]
  }
  ```
- 処理フロー:
  1. API キー検証 → `last_used_at` 更新
  2. Zod 検証
  3. `email_logs` に `status=pending` で挿入
  4. `services/resend.ts` で送信 (失敗時は最大 3 回・指数バックオフ)
  5. 成功: `status=sent`, `resend_id`, `sent_at` を更新
  6. 失敗: `status=failed`, `error_message` を更新
  7. レスポンス: `{ "id": <log_id>, "resend_id": "...", "status": "sent" }`

### `GET /api/v1/messages/:id`
- API キー認証付き、自分の送信のみ参照可

## 管理画面の機能

1. **ログイン画面** — username/password (初回起動時に `npm run create-admin` で作成)
2. **ダッシュボード** — 直近 24h/7d/30d の送信数・成功率・失敗内訳 (Recharts でグラフ)
3. **送信ログ** — 一覧 (ページング、ステータス/宛先/件名で検索)、詳細モーダルで HTML/Text プレビュー、添付一覧、ヘッダ表示
4. **再送 / テスト送信** — ログ詳細から「再送」ボタン (同内容で再 POST)、メニューから任意宛先への簡易テスト送信フォーム
5. **API キー管理** — 発行 (発行時のみ平文表示)、無効化、最終使用日時
6. **設定** — Resend API キー登録 (暗号化保存)、デフォルト From、再送リトライ回数、添付サイズ上限

## Rails 2 側の連携サンプル (`examples/rails2/resend_wrapper_mailer.rb`)

- `Net::HTTP` で平文 HTTP `POST` を行うシンプルな送信メソッド
- 既存 `ActionMailer` を `delivery_method = :resend_wrapper` 相当のカスタムデリバリで差替え可能なミニプラグイン
- 添付は base64 化して `attachments` 配列に詰める
- 注意: 平文経路となるため LAN 内 / VPN 内での運用が前提である旨を README に明記

## セキュリティ要点

- 平文 HTTP は信頼できる内部ネットワークでのみ使用 (README に明記)
- API キーは bcrypt ハッシュ保存、表示は発行直後の 1 回のみ
- 管理画面は別ポート + リバースプロキシでの TLS 終端を推奨
- Resend API キーは `settings` に AES-256-GCM で暗号化保存 (鍵は `MASTER_KEY` 環境変数)
- 送信レート制限 (express-rate-limit 相当を Hono で実装)
- 添付サイズ上限・MIME チェック
- ログイン試行のレートリミットとブルートフォース対策

## HTML マニュアル (`docs/manual.html`)

- **デザイン方針**: 背景白 (#ffffff)、アクセントは Resend ブランド近似のシック配色 (黒+1〜2色)、サンセリフ (Inter / system font)、最大幅 880px センタリング
- **単一ファイル**: 外部依存なしで開けるよう CSS/SVG/簡易 JS をすべてインライン化 (Tailwind 等は使わず手書き CSS)。クリックで章ジャンプする目次サイドバー付き
- **掲載章 (グラフィカル要素を多用)**:
  1. ヒーロー: ロゴ風ワードマーク + 「Rails 2 でも Resend」見出し + アーキテクチャ図 (SVG)
  2. しくみ: シーケンス図 (Rails → ラッパー → Resend) を SVG で描画
  3. 5 分セットアップ: Docker / docker-compose / Railway 各タブ風の手順カード
  4. Rails 2 連携: コードカード (シンタックスハイライトは Prism.js のインライン版か、もしくは静的に色付け済み HTML)
  5. API リファレンス: エンドポイント表 + リクエスト/レスポンスのサンプル
  6. 管理画面ガイド: ダッシュボード/ログ/APIキー/設定の各画面スクリーンショット + 矢印注釈
  7. トラブルシュート: よくあるエラーと対処
  8. セキュリティ注意事項: 平文 HTTP 利用時の運用ガイド
- **アクセシビリティ**: 見出し階層を厳守、ダーク背景なし、コントラスト比 AA 以上、図には alt/aria-label
- **プレビュー**: ローカルで `open docs/manual.html` で確認、GitHub Pages (`docs/` ディレクトリを公開設定) でも閲覧可能

## GitHub リポジトリ公開手順

1. リポジトリ名: `resend-rapper` (パブリック、ライセンス MIT)
2. 初回コミットに以下を含める:
   - 全ソースコード
   - `docs/manual.html` と `docs/plan.md` (本プランのコピー)
   - `README.md` (英日併記、バッジ、Railway "Deploy on Railway" ボタン)
3. `gh repo create at080552/resend-rapper --public --source=. --remote=origin --push` で作成・プッシュ
   - 実行前にユーザーへ確認 (公開アクションのため)
4. GitHub Pages を `docs/` ディレクトリ公開で有効化 → マニュアル URL を README に記載
5. Railway 連携用の "Deploy on Railway" バッジ URL を README に追加

## 重要ファイル (新規作成)

- `src/index.ts` — Hono 起動・ルーティング統合
- `src/db/schema.ts` — 全テーブル定義
- `src/services/resend.ts` — Resend SDK 呼び出し + リトライ
- `src/routes/clientApi.ts` — `POST /api/v1/send` 等
- `src/routes/adminApi.ts` — 管理 API
- `src/middleware/apiKeyAuth.ts`, `src/middleware/adminAuth.ts`
- `web/src/pages/Logs.tsx` — ログ閲覧画面
- `examples/rails2/resend_wrapper_mailer.rb` — Rails 2 用クライアント例
- `Dockerfile`, `docker-compose.yml`, `railway.json`, `README.md`
- `docs/manual.html` — グラフィカル HTML マニュアル (白基調・単一ファイル)
- `docs/plan.md` — 本プランをリポジトリに同梱 (共有用)

## 実装ステップ (順序)

1. プロジェクト雛形 (`npm init`, TS/Hono/Drizzle/Vite セットアップ、ESLint/Prettier、`.gitignore`)
2. DB スキーマ + マイグレーション + シード (admin 作成 CLI)
3. クライアント API (`POST /api/v1/send`) + Resend 連携 + ログ書込
4. API キー認証ミドルウェア + 管理 API (キー発行/失効、ログ検索、メトリクス、再送/テスト送信)
5. 管理画面 SPA (ログイン → ダッシュボード → ログ → API キー → 設定)
6. Rails 2 サンプルコード + `README.md` (起動方法、curl 例、Rails 2 連携手順)
7. `Dockerfile` / `docker-compose.yml` / `railway.json` / `.env.example`
8. `docs/manual.html` をグラフィカルに作成 (白基調、SVG 図版、章別構成)
9. ローカル動作検証 (下記)
10. **GitHub リポジトリ作成・公開** (ユーザー承認後): `gh repo create` → 初回 push → GitHub Pages 有効化 → README にリンク追記
11. Railway 上での実機デプロイ検証 (任意。最低でも `railway.json` の妥当性は検証)

## 検証方法

### 単体・結合テスト
- `npm test` — Vitest で `services/*` と `routes/*` のテスト (Resend SDK はモック)
- 主要ケース: API キー無効、ペイロード不正、Resend 5xx 時のリトライ、添付付き送信

### 手動エンドツーエンド
1. `.env` に Resend のテスト API キーをセット → `docker compose up`
2. `curl -X POST http://localhost:3000/api/v1/send -H 'X-API-Key: <key>' -d @sample.json` で送信 → 200 と `resend_id` が返る
3. 管理画面 `http://localhost:3000/admin` でログイン → 送信ログに反映されていることを確認
4. ダッシュボードのメトリクス・検索・本文プレビュー・再送ボタン・テスト送信フォームをすべて動作確認 (UI 確認はブラウザで実機チェック)
5. **Rails 2 側からの実機検証**: `examples/rails2/resend_wrapper_mailer.rb` を Rails 2 アプリに組み込み、平文 HTTP で送信できることを確認 (TLS スタックを使わずに完結することがゴール)
6. Resend ダッシュボードで実際にメールが送信されていることを確認

### 失敗系
- 不正 API キー → 401
- Resend 側 4xx → `status=failed` でログに `error_message` が残る
- Resend 側 5xx → 3 回リトライ後 failed、再送ボタンで復旧可能

### マニュアル / 配布物検証
- `docs/manual.html` をブラウザで直接開いて崩れ・リンク切れがないか確認 (Chrome / Safari)
- Lighthouse でアクセシビリティ・コントラストを確認
- `docker compose up --build` で空ディスクから起動できることを確認
- `railway.json` を Railway CLI でドライランチェック (`railway up --detach` のドライ相当)

### GitHub 公開後の確認
- リポジトリトップに README、`docs/manual.html`、`docs/plan.md` が見えていること
- GitHub Pages のマニュアル URL が 200 で開けること
- "Deploy on Railway" バッジ経由でデプロイフローに進めること
