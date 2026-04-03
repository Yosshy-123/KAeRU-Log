# KAeRU Log

軽量な Node.js + WebSocket ベースのチャットアプリケーション。Redis を利用して、ログ保存・認証・管理機能・スパム対策をまとめて提供します。

## 概要

KAeRU Log は、シンプルな構成でリアルタイムチャットを構築したいプロジェクト向けの OSS です。バックエンドは Express と Socket.IO、永続化とセッション管理には Redis を採用しています。

### 目的

* 軽量で分かりやすいチャット基盤を提供する
* WebSocket によるリアルタイム送受信を実現する
* Redis を使ってログ、認証、レート制御、管理操作を一元化する

### 背景

一般的なチャットアプリでは、認証・セッション・履歴・スパム対策・管理者操作が個別実装になりがちです。KAeRU Log は、これらを最小限の依存関係でまとめ、少ない設定で動かせる構成を目指しています。

### 主なユースケース

* 小規模コミュニティのリアルタイムチャット
* イベント会場の簡易コミュニケーションボード
* 社内の軽量な雑談・通知用チャット
* Redis を含む Node.js / WebSocket 構成の参考実装

## 特徴

* WebSocket によるリアルタイムメッセージ配信
* Redis によるメッセージ履歴とセッション管理
* ルーム単位の会話
* 管理者ログインと全メッセージ削除
* スパム検知とミュート
* IP ごとの同時接続制御
* ルームの自動クリーンアップ

## クイックスタート

### インストール

```bash
git clone https://github.com/Yosshy-123/KAeRU-Log.git
cd KAeRU-Log
npm install
```

### 必要環境

* Node.js 22 以上
* Redis

### 環境変数

```env
REDIS_URL=redis://localhost:6379
FRONTEND_URL=http://localhost:3000
ADMIN_PASS=your-admin-password
TRUST_PROXY=false
PORT=3000
```

### 起動

```bash
npm start
```

ブラウザで `http://localhost:3000` を開くと、チャット画面が表示されます。

### 最小実行例

```bash
export REDIS_URL=redis://localhost:6379
export FRONTEND_URL=http://localhost:3000
export ADMIN_PASS=change-me
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

* `username` 省略時は `guest-xxxxxx` 形式の名前が割り当てられます
* トークン有効期限は 24 時間です
* 認証リクエストは IP 単位でレート制限されます

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

#### `POST /api/messages`

メッセージを送信します。

**Request Body**

```json
{
  "roomId": "general",
  "message": "こんにちは"
}
```

**制約**

* `roomId`: 1〜32 文字、英数字・`_`・`-` のみ
* `message`: 最大 300 文字
* 一般ルームの保持件数: 300 件
* その他ルームの保持件数: 100 件

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

* 最大 20 文字
* 変更は 30 秒ごとに 1 回まで

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

* 管理操作には 30 秒のレート制限があります
* ルーム削除後はクライアントへ `clearMessages` が通知されます

## Socket.IO リファレンス

### 接続条件

* 有効な認証トークンが必要です
* 同一 IP からの同時接続数は 5 に制限されます

### 送信イベント

#### `joinRoom`

ルームに参加します。

```js
socket.emit('joinRoom', { roomId: 'general' });
```

### 受信イベント

#### `newMessage`

新しいメッセージを受信します。

```js
socket.on('newMessage', (message) => {
  console.log(message);
});
```

#### `roomUserCount`

ルームの接続人数を受信します。

```js
socket.on('roomUserCount', (count) => {
  console.log(count);
});
```

#### `clearMessages`

ルームのメッセージが削除されたときに受信します。

```js
socket.on('clearMessages', () => {
  console.log('room cleared');
});
```

#### `authRequired`

認証が必要な場合に受信します。

```js
socket.on('authRequired', () => {
  console.log('token required');
});
```

## 設定オプションとデフォルト値

### 環境変数

| 変数名            | 必須 |   デフォルト | 説明                       |
| -------------- | -: | ------: | ------------------------ |
| `REDIS_URL`    | 必須 |      なし | Redis 接続 URL             |
| `FRONTEND_URL` | 必須 |      なし | CORS と Socket.IO の許可オリジン |
| `ADMIN_PASS`   | 必須 |      なし | 管理者パスワード                 |
| `TRUST_PROXY`  | 任意 | `false` | リバースプロキシ配下で `true`       |
| `PORT`         | 任意 |  `3000` | HTTP サーバーポート             |

### 内部デフォルト

| 項目            |                   デフォルト | 説明                         |
| ------------- | ----------------------: | -------------------------- |
| 認証トークン TTL    |                   24 時間 | `/api/auth` で発行したトークンの有効期限 |
| ユーザー名 TTL     |                   24 時間 | ユーザー名の保存期限                 |
| 認証レート制限       |             3 回 / 24 時間 | IP 単位                      |
| ユーザー名変更間隔     |                    30 秒 | 同一ユーザー単位                   |
| 管理者ログイン間隔     |                    30 秒 | 同一ユーザー単位                   |
| メッセージ長        |                  300 文字 | 投稿上限                       |
| ルームメッセージ保持数   | general: 300 / その他: 100 | Redis 上の保持件数               |
| ルーム自動削除       |                    30 日 | 非アクティブルーム削除                |
| 同時接続上限        |               5 接続 / IP | Socket.IO 接続制御             |
| クライアント認証再試行冷却 |                    10 秒 | フロントエンド側                   |

## ライセンス

このプロジェクトは [MIT License](LICENSE) のもとで公開されています。

## サポート / 連絡手段

* Issue: バグ報告、機能要望、改善提案
* Email: `Yosshy_123@proton.me`

返信が必要な連絡は、Issue のほうが追跡しやすくおすすめです。
