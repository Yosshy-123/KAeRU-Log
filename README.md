# KAeRU Log

> Redis ベースの軽量リアルタイムチャット。ルーム管理、認証、スパム対策、管理機能をまとめて提供します。

## 概要

KAeRU Log は、Node.js / Express / Socket.IO / Redis で構成されたセルフホスト型チャットアプリケーションです。

ルーム単位のリアルタイム会話、短命なセッション、集中管理されたモデレーション、少ない依存関係での運用に最適化しています。

### 主な用途

- コミュニティ向けチャットルーム
- イベント運営用の連絡ボード
- 社内向けの軽量メッセージング
- Redis を使ったセッション管理と履歴保存
- 安全な WebSocket 実装の参考基盤

## 特徴

- Socket.IO によるリアルタイム配信
- Redis による認証トークン、ユーザー名、履歴の保存
- `general` とその他ルームで異なる保持件数
- 管理者ログイン、状態確認、ログアウト、ルーム全削除
- スパム対策、送信制御、ミュート、IP 単位の同時接続制限
- CSP / HSTS / X-Content-Type-Options などのセキュリティヘッダー

## アーキテクチャ

### 主要コンポーネント

- `server.js`  
  起動処理、HTTP サーバー、Redis 接続、定期クリーンアップ

- `app.js`  
  Express アプリ、API ルーティング、CORS、静的配信、セキュリティヘッダー

- `socket.js`  
  Socket.IO サーバー、認証、ルーム参加、参加人数配信

- `routes/`  
  認証、メッセージ、ユーザー名、管理 API

- `services/`  
  スパム判定などのドメインロジック

- `lib/`  
  Redis キー、リスト整形、ルーム保守、IP セッション管理

- `public/`  
  ブラウザ UI

- `lua/`  
  Redis Lua スクリプト

### 概要図

```text
[Browser / Web Client]
        |
        | HTTP (REST) + WebSocket (Socket.IO)
        v
[Express App]
  ├─ /api/auth
  ├─ /api/messages
  ├─ /api/username
  ├─ /api/admin
  ├─ Security headers / CORS
  └─ Static assets
        |
        v
[Redis]
  ├─ auth tokens / usernames / admin sessions
  ├─ room message lists
  ├─ rate limits / spam counters
  └─ Socket.IO Redis adapter pub/sub
```

## 要件

- OS: Linux / macOS / Windows
- 言語: JavaScript (Node.js), HTML, CSS
- ランタイム: Node.js `>=22.0.0`
- データストア: Redis 互換サーバー
- ブラウザ: ES Modules と WebSocket をサポートする最新ブラウザ

## クイックスタート

### インストール

```bash
git clone https://github.com/Yosshy-123/KAeRU-Log.git
cd KAeRU-Log
npm install
```

### 環境変数を設定して起動

```bash
export REDIS_URL=redis://localhost:6379
export FRONTEND_URL=http://localhost:3000
export ADMIN_PASS=[ADMIN_PASS]
export TRUST_PROXY=false
export PORT=3000
npm start
```

## API リファレンス

> すべての API は、認証トークンを `Authorization: Bearer <token>` で送信します。  
> トークンは `/api/auth` で取得します。

### 認証

#### `POST /api/auth`

匿名または指定ユーザー名でセッションを作成します。

**Request Body**

```json
{
  "username": "taro"
}
```

**Response**

```json
{
  "token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "username": "taro"
}
```

**補足**

- `username` 省略時は `guest-xxxxxx` 形式の名前が割り当てられます
- トークン有効期限は 24 時間です
- 認証リクエストは IP 単位でレート制限されます

### メッセージ取得

#### `GET /api/messages/:roomId`

指定ルームのメッセージ履歴を取得します。

**例**

```bash
GET /api/messages/general
```

**Response**

```json
[
  {
    "username": "taro",
    "message": "hello",
    "time": "2026/04/04 12:34"
  }
]
```

### メッセージ送信

#### `POST /api/messages/:roomId`

メッセージを送信します。

**例**

```bash
POST /api/messages/general
```

**Request Body**

```json
{
  "message": "こんにちは"
}
```

**制約**

- `roomId`: 1〜32 文字、英数字・`_`・`-` のみ
- `message`: 最大 300 文字
- `general` の保持件数: 300 件
- その他ルームの保持件数: 100 件

### ユーザー名変更

#### `POST /api/username`

ログイン中ユーザーの表示名を変更します。

**Request Body**

```json
{
  "username": "new-name"
}
```

**制約**

- 最大 20 文字
- 変更は 30 秒ごとに 1 回まで

**Response**

```json
{
  "ok": true
}
```

### 管理機能

#### `POST /api/admin/login`

管理者パスワードでログインします。

**Request Body**

```json
{
  "password": "your-admin-password"
}
```

#### `GET /api/admin/status`

管理者権限の有無を確認します。

**Response**

```json
{
  "admin": true
}
```

#### `POST /api/admin/logout`

管理者セッションを解除します。

#### `POST /api/admin/clear/:roomId`

指定ルームのメッセージを全削除します。

**例**

```bash
POST /api/admin/clear/general
```

**補足**

- 管理操作には 30 秒のレート制限があります
- ルーム削除後はクライアントへ `clearMessages` が通知されます

## Socket.IO リファレンス

### 接続条件

- 有効な認証トークンが必要です
- 同一 IP からの同時接続数は 5 に制限されます

### 送信イベント

#### `joinRoom`

ルームに参加します。

```js
socket.emit("joinRoom", { roomId: "general" });
```

### 受信イベント

#### `newMessage`

新しいメッセージを受信します。

```js
socket.on("newMessage", (message) => {
  console.log(message);
});
```

#### `roomUserCount`

ルームの接続人数を受信します。

```js
socket.on("roomUserCount", (count) => {
  console.log(count);
});
```

#### `clearMessages`

ルームのメッセージが削除されたときに受信します。

```js
socket.on("clearMessages", () => {
  console.log("room cleared");
});
```

#### `authRequired`

認証が必要な場合に受信します。

```js
socket.on("authRequired", () => {
  console.log("token required");
});
```

## 設定

### 環境変数

```bash
REDIS_URL=redis://localhost:6379
FRONTEND_URL=http://localhost:3000
ADMIN_PASS=[ADMIN_PASS]
TRUST_PROXY=false
PORT=3000
```

### `.env` サンプル

```env
REDIS_URL=redis://localhost:6379
FRONTEND_URL=http://localhost:3000
ADMIN_PASS=[ADMIN_PASS]
TRUST_PROXY=false
PORT=3000
```

### シークレットの扱い

- `ADMIN_PASS` と `REDIS_URL` はコミットしない
- 本番ではリポジトリ外の secret manager を使う
- 定期的に認証情報をローテーションする
- 認証トークンは長期秘密情報ではなく、Redis 管理の TTL セッションとして扱う

### 運用上の制約

- 認証トークン TTL: 24 時間
- ユーザー名 TTL: 24 時間
- 認証レート制限: IP 単位で 24 時間あたり 3 回
- ユーザー名変更の待機時間: 30 秒
- 管理者ログインの待機時間: 30 秒
- ルーム削除の待機時間: 30 秒
- メッセージ長: 300 文字
- ルーム ID: 1〜32 文字、英数字と `_` `-`
- Socket.IO 同時接続数: IP ごとに 5
- メッセージ保持件数: `general` は 300、その他は 100
- 非アクティブルームの自動整理: 30 日

## セキュリティ

- セキュリティヘッダーを標準適用しています
- 認証トークンと管理者セッションは Redis 上で TTL 管理されます
- Socket 接続は認証完了後のみルーム参加できます
- IP 単位の同時接続上限で乱用を抑制します
- スパム検知とミュート処理を送信時に適用します
- 脆弱性報告は Issue を使用してください

## ライセンス

MIT License.