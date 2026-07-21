# KAeRU Log

Redis をデータ層に使う、Express + Socket.IO ベースのリアルタイムチャットサーバーです。HTTP API と WebSocket は同じセッションを使って認証され、メッセージ履歴、ユーザー名、トークン、管理者セッション、レート制限状態、Socket の接続所有権を Redis に保存します。

## 主な機能

- Socket.IO によるルーム単位のリアルタイム配信
- clientId ごとの Socket 接続所有権管理
- HttpOnly Cookie を使ったセッション認証
- Redis へのメッセージ履歴保存
- ルームごとのメッセージ上限管理
- ユーザー名変更のレート制限
- 管理者ログイン、ルームクリア、状態確認
- 管理者ログイン試行のロックアウト
- スパム判定と送信制限
- セキュリティヘッダーと同一オリジン前提の接続制御
- 静的フロントエンドの配信

## 要件

- Node.js 22 以上
- Redis に接続できること

## セットアップ

```bash
npm install
```

### 環境変数

起動前に以下を設定します。

```bash
export REDIS_URL=redis://localhost:6379
export ADMIN_PASS=change-me
export PORT=3000
export TRUST_PROXY=false
export HTTPS=false
```

- `REDIS_URL`: Redis 接続 URL
- `ADMIN_PASS`: 管理者ログイン用パスワード
- `PORT`: HTTP サーバーの待受ポート。既定は `3000`
- `TRUST_PROXY`: プロキシ配下で `req.ip` を信頼する場合は `true`
- `HTTPS`: Cookie の `Secure` 属性と HSTS を有効化する場合は `true`

## 起動

```bash
npm start
```

## データと制約

- 認証セッションの有効期間は 24 時間です。
- 認証時にユーザー名を省略すると `guest-xxxxxx` 形式が割り当てられます。
- ユーザー名は 1〜20 文字です。
- メッセージは 1〜300 文字です。
- ルーム ID は 1〜32 文字で、英数字・`_`・`-` のみ使用できます。
- メッセージ履歴は `general` ルームで最大 300 件、それ以外のルームで最大 100 件です。
- `general` 以外のルームは、最終更新から 30 日を超えると定期クリーンアップの対象になります。
- WebSocket 接続は `clientId` ごとに 1 つのアクティブ接続を維持します。既存接続が無応答または切断済みなら、新しい接続が所有権を引き継ぎます。

## HTTP API

認証が必要な API はブラウザの Cookie セッションを使います。`POST /api/auth` でセッションを確立します。

### `POST /api/auth`

認証セッションを確立します。既存の有効なセッションがあれば、それを使います。

リクエスト例:

```json
{ "username": "taro" }
```

`username` を省略すると、自動生成された guest 名が使われます。

### `GET /api/messages/:roomId`

指定ルームのメッセージ履歴を返します。

### `POST /api/messages/:roomId`

メッセージを保存して、そのルームに `newMessage` を配信します。

リクエスト例:

```json
{ "message": "こんにちは" }
```

### `POST /api/username`

現在のユーザー名を更新します。  
同一クライアントには 30 秒の変更間隔制限があります。

リクエスト例:

```json
{ "username": "new-name" }
```

### 管理 API

- `POST /api/admin/login`
- `GET /api/admin/status`
- `POST /api/admin/logout`
- `POST /api/admin/clear/:roomId`

`/login` は認証済みセッションと `ADMIN_PASS` を使って管理者セッションを作成します。  
失敗が続くと一時的にロックされます。  
`/status` は現在のセッションが管理者セッションかどうかを返します。  
`/logout` は管理者セッションを削除します。  
`/clear/:roomId` は指定ルームのメッセージ履歴を削除し、`clearMessages` を配信します。

## WebSocket

### 接続認証

接続時は Cookie セッションを使って認証します。  
クライアントは `withCredentials` を有効にして接続します。  
同一 `clientId` で既存接続がアクティブな場合、新しい接続は拒否されます。既存接続が切断済みなら、新しい接続が Redis 上の所有権を引き継ぎます。

### イベント

- `joinRoom` — `{ roomId }` を送るとルームに参加します
- `joinedRoom` — ルーム参加成功時に返ります
- `newMessage` — 新規メッセージ配信
- `clearMessages` — ルーム履歴の削除通知
- `roomUserCount` — ルームの接続人数通知
- `toast` — ユーザーまたはルーム向け通知
- `authRequired` — 認証が必要な操作で返ります

## 実装メモ

- Redis はメッセージ履歴、トークン、ユーザー名、管理者セッション、レート制限、スパム判定に使われます。
- `@socket.io/redis-adapter` を使って複数ノード間のイベントを同期できます。
- `public/` に静的 UI が含まれています。
- `server.js` が起動処理、Redis 接続、クリーンアップスケジュール、シグナル終了処理を担当します。

## プロジェクト構成

- `server.js` — エントリポイント
- `app.js` — Express アプリの構築
- `socket.js` — Socket.IO サーバー
- `auth.js` — トークン生成と検証
- `redis.js` — Redis 接続
- `routes/` — HTTP API
- `services/` — スパム判定などのサービス
- `lib/` — Redis キー、Cookie、メッセージ処理、バリデーション
- `utils/` — 補助ユーティリティ
- `public/` — 静的ファイル
- `lua/` — Redis Lua スクリプト

## ライセンス

MIT
