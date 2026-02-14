<div align="center">
  <img height="150px" src="logo.png" />
  <h1>KAeRU Log</h1>
  <h3>軽量 Node.js ＆ WebSocket チャットアプリ</h3>
  <a href="https://render.com/deploy?repo=https://github.com/Yosshy-123/KAeRU-Log.git"><img height="30px" src="https://render.com/images/deploy-to-render-button.svg" /></a>

  <table>
    <thead>
      <tr>
        <th><a href="README.md">English</a></th>
        <th>日本語</th>
      </tr>
    </thead>
  </table>

</div>

---

## 概要

KAeRU Log は、Node.js と WebSocket 技術を使用した軽量で高性能なチャットアプリケーションです。Redis をベースとした状態管理、スパム対策、セキュアな管理者制御機能を備えています。

### ✨ 主な機能

- **リアルタイムチャット**: Socket.IO による即座のメッセージ送受信
- **マルチルーム対応**: 複数のチャットルームの作成と参加
- **ユーザー管理**: カスタムユーザー名とセッションベースの認証
- **管理者パネル**: パスワード保護されたメッセージ管理
- **スパム対策**: インテリジェントなスパム検知とレート制限
- **Redis 状態管理**: スケーラブルなチャット履歴とユーザーデータの永続化
- **セキュリティ強化**: 
  - nonce ベースの Content Security Policy (CSP)
  - セキュリティヘッダー (HSTS, X-Frame-Options など)
  - HTTPS/WSS サポート
  - 入力値サニタイズと検証
- **グレースフルシャットダウン**: 安全なサーバー停止とリソースクリーンアップ
- **ヘルスチェック**: 監視用 `/health` エンドポイント

---

## 技術スタック

| コンポーネント | 技術 | バージョン |
|-------------|------|---------|
| **バックエンド** | Node.js | 18.x |
| **サーバー** | Express.js | 4.18.2+ |
| **リアルタイム通信** | Socket.IO | 4.5.4+ |
| **キャッシュ/状態管理** | Redis | 4.6.5+ |
| **フロントエンド** | Vanilla JavaScript (ES6+) | - |

---

## ディレクトリ構成

```
├── .github/
│   ├── logo.png
│   ├── README.ja.md
│   └── README.md
├── lib/
│   ├── redisHelpers.js          # Redis ユーティリティ関数
│   └── redisKeys.js              # Redis キー定義
├── lua/
│   ├── spamService.lua           # スパム検知用 Lua スクリプト
│   └── tokenBucket.lua           # レート制限用 Lua スクリプト
├── public/
│   ├── css/
│   │   └── style.css             # アプリケーションスタイル
│   ├── images/
│   │   ├── favicon-16x16.png
│   │   ├── favicon-32x32.png
│   │   ├── favicon-96x96.png
│   │   └── logo.png
│   ├── js/
│   │   ├── api.js                # API クライアント関数
│   │   ├── config.js             # フロントエンド設定
│   │   ├── dom.js                # DOM 要素キャッシュ (Proxy ベース)
│   │   ├── index.js              # エントリーポイント
│   │   ├── init.js               # 初期化ロジック
│   │   ├── modal.js              # モーダル管理
│   │   ├── render.js             # メッセージレンダリング
│   │   ├── room.js               # ルーム管理
│   │   ├── services.js           # ビジネスロジック
│   │   ├── socket.io.min.js
│   │   ├── socket.js             # WebSocket クライアント
│   │   ├── state.js              # アプリケーション状態
│   │   ├── toast.js              # トースト通知
│   │   └── utils.js              # ユーティリティ関数
│   └── index.html
├── routes/
│   ├── apiAdmin.js               # 管理者エンドポイント
│   ├── apiAuth.js                # 認証エンドポイント
│   ├── apiMessages.js            # メッセージエンドポイント
│   └── apiUsername.js            # ユーザー名エンドポイント
├── services/
│   └── spamService.js            # スパム検知サービス
├── src/
│   └── render.gs                 # キープアライブ用 Google Apps Script
├── utils/
│   ├── logger.js                 # ロギング (Redis 永続化)
│   ├── redisUtils.js             # Redis ユーティリティ関数
│   ├── sanitize.js               # HTML/XSS サニタイズ
│   ├── socketWrapper.js          # Socket エラーラッパー
│   ├── time.js                   # タイムゾーンユーティリティ (JST フォーマット)
│   └── tokenBucket.js            # レート制限
├── app.js                         # Express アプリ設定
├── auth.js                        # 認証ロジック
├── LICENSE                        # MIT ライセンス
├── package.json                   # 依存関係
├── redis.js                       # Redis クライアント設定
├── render.yaml                    # Render.com デプロイ設定
├── securityHeaders.js             # セキュリティヘッダー middleware
├── server.js                      # サーバーエントリーポイント
└── socket.js                      # Socket.IO 設定
```

---

## インストール＆ローカル開発

### 前提条件

- Node.js 18.x 以上
- npm 8.0.0 以上
- Redis インスタンス

### セットアップ

1. **リポジトリをクローン**
   ```bash
   git clone https://github.com/Yosshy-123/KAeRU-Log.git
   cd KAeRU-Log
   ```

2. **依存関係をインストール**
   ```bash
   npm install
   ```

3. **`.env` ファイルを作成**
   ```env
   PORT=3000
   REDIS_URL=redis://localhost:6379
   ADMIN_PASS=your-secure-password
   FRONTEND_URL=http://localhost:3000
   ```

4. **開発サーバーを起動**
   ```bash
   npm run dev
   ```

5. **ブラウザで開く**
   ```
   http://localhost:3000
   ```

---

## Render.com へのデプロイ

### 1. Redis を設定する

KAeRU Log はチャット履歴と状態管理のために **Redis** インスタンスが必要です。

#### 方法 A: Render の Redis を使用（推奨）

1. [Render ダッシュボード](https://dashboard.render.com)にアクセス
2. **New** → **Key Value Store** をクリック
3. 名前を入力（例：`kaeru-log-redis`）
4. **Maxmemory Policy** を `noeviction` に設定
5. リージョンとプランを選択
6. 作成完了後、**Internal Redis URL** をコピー

#### 方法 B: 外部 Redis サービスを使用

人気のサービス：
- [Upstash Redis](https://console.upstash.com/redis)
- [Redis Cloud](https://cloud.redis.io/#/databases)
- [Amazon ElastiCache](https://aws.amazon.com/elasticache/redis/)

### 2. アプリケーションをデプロイ

1. [Render ダッシュボード](https://dashboard.render.com)にアクセス
2. **New** → **Web Service** をクリック
3. GitHub リポジトリを接続
4. `Yosshy-123/KAeRU-Log` リポジトリを選択
5. サービスを設定：
   - **Name**: `kaeru-log`（任意の名前）
   - **Region**: ユーザーに最も近いリージョンを選択
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

6. 環境変数を追加：
   ```
   REDIS_URL=<your-redis-url>
   ADMIN_PASS=<secure-password-for-admin>
   FRONTEND_URL=https://kaeru-log.onrender.com
   ```

7. **Create Web Service** をクリック

アプリケーションは自動的にデプロイされ、`https://kaeru-log.onrender.com` で利用可能になります。

> [!IMPORTANT]
> `FRONTEND_URL` は `https://your-service-name.onrender.com` の形式で指定してください（末尾にスラッシュなし）。

---

## API リファレンス

### 認証
- `POST /api/auth` - 認証トークンを取得

### メッセージ
- `GET /api/messages/:roomId` - チャット履歴を取得
- `POST /api/messages` - メッセージを送信

### ユーザー
- `POST /api/username` - ユーザー名を更新

### 管理者
- `POST /api/admin/login` - 管理者ログイン
- `GET /api/admin/status` - 管理者ステータスを確認
- `POST /api/admin/logout` - 管理者ログアウト
- `POST /api/admin/clear/:roomId` - メッセージをクリア

### ヘルスチェック
- `GET /health` - ヘルスチェックエンドポイント

---

## セキュリティ機能

### Content Security Policy (CSP)
- インラインスクリプトと eval() をブロック
- nonce ベースのインラインスタイルを使用
- リソード読み込みを信頼できるソースのみに制限
- クリックジャッキングと XSS 攻撃を防止

### セキュリティヘッダー
- **X-Content-Type-Options**: `nosniff` (MIME sniffing 対策)
- **X-Frame-Options**: `SAMEORIGIN` (クリックジャッキング対策)
- **X-XSS-Protection**: `1; mode=block` (従来 XSS 対策)
- **Strict-Transport-Security**: 1 年間の HSTS (preload 対応)
- **Referrer-Policy**: `strict-origin-when-cross-origin`
- **Permissions-Policy**: 機密 API へのアクセスを制限

### 追加セキュリティ
- XSS 対策付き入力値サニタイズ
- 認証とユーザー名変更のレート制限
- ミューティング機能付きスパム検知
- 管理者アクセスのセキュアパスワードハッシング
- Render.com での HTTPS/WSS 強制

---

## 設定

### 環境変数

| 変数 | 必須 | 説明 |
|------|------|------|
| `PORT` | いいえ | サーバーポート（デフォルト: 3000） |
| `REDIS_URL` | **はい** | Redis 接続 URL |
| `ADMIN_PASS` | **はい** | 管理者パスワード |
| `FRONTEND_URL` | **はい** | フロントエンドオリジン URL （例：https://example.com） |

### アプリケーション設定

レート制限とスパム設定は以下で設定可能：
- `routes/apiAuth.js` - 認証レート制限
- `routes/apiUsername.js` - ユーザー名変更レート制限
- `routes/apiMessages.js` - メッセージレート制限
- `services/spamService.js` - スパム検知ルール

---

## 監視とログ

### ヘルスチェック
```bash
curl https://kaeru-log.onrender.com/health
```

レスポンス例：
```json
{
  "status": "ok",
  "timestamp": "2026-02-14T12:34:56.789Z",
  "uptime": 3600.5
}
```

### サーバーログ
すべてのエラーと重要なイベントは以下に記録されます：
1. **コンソール** - リアルタイム出力
2. **Redis** - 永続ログ（キー：`logs:YYYY-MM-DD`）

---

## ライブデモ

[https://kaeru-log.onrender.com/](https://kaeru-log.onrender.com/)

---

## 開発ガイド

### コードスタイル
- `'use strict'` モードを使用
- Promise 処理には async/await を使用
- 関数には JSDoc コメントを付与

### テスト
```bash
npm test
```

### 開発サーバー
```bash
npm run dev
```

ファイル変更時に nodemon で自動リロード。

---

## バグ報告・フィードバック

問題を発見したり、提案がありましたら：

1. **GitHub Issue を作成（推奨）**
   - トラッキングと参照が容易
   - 長期的なドキュメントに適している

2. **メール（オプション）**
   - Yosshy_123@proton.me
   - ※メール返信に遅延が生じる可能性があります

報告時は以下を含めてください：
- 問題の説明
- 再現手順
- 期待される動作と実際の動作
- ブラウザ/環境情報

---

## コントリビューション

個人プロジェクトですが、提案やバグ報告は大歓迎です！

---

## ライセンス

このプロジェクトは **MIT ライセンス** に基づいて提供されています。

詳細は [LICENSE](LICENSE) ファイルを参照してください。

---

## 作者

**Yosshy** - [GitHub プロフィール](https://github.com/Yosshy-123)

お問い合わせ：Yosshy_123@proton.me
