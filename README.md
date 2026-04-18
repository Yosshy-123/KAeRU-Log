# KAeRU Log

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Yosshy-123/KAeRU-Log/blob/main/LICENSE)
[![Node.js >=22](https://img.shields.io/badge/Node.js-%3E%3D22-brightgreen)](https://nodejs.org/)
[![Redis](https://img.shields.io/badge/Redis-compatible-orange)](https://redis.io/)

洗練された軽量リアルタイムチャットサーバー。Redis をデータレイヤーに用い、Express と Socket.IO で API と WebSocket を提供する。トークンベース認証、メッセージ履歴の永続化、レート制御、管理 API を備え、単一コマンドで起動できるシンプルな構成で運用に適した設計を目指した。

## ハイライト

- ルーム単位リアルタイム配信と履歴保存
- トークンベース認証での HTTP API と WebSocket 保護
- Redis を利用したメッセージ永続化と定期クリーンアップ
- レート制御とスパム判定による運用耐性
- 管理 API による運用・メンテナンス機能
- セキュリティヘッダーと CORS 制御による堅牢な HTTP レイヤー
- 単一コマンドで起動、追加ビルド不要で導入が容易

## 主要技術

- Node.js 22 以上
- Express
- Socket.IO
- @socket.io/redis-adapter
- ioredis
- cors, dotenv, validator

## クイックスタート

1. 依存をインストール
   ```bash
   npm install
   ```

2. 必要な環境変数を設定
   ```bash
   export REDIS_URL=redis://localhost:6379
   export FRONTEND_URL=http://localhost:3000
   export ADMIN_PASS=change-me
   export PORT=3000
   export TRUST_PROXY=false
   ```

3. サーバーを起動
   ```bash
   npm start
   ```

起動後は指定した FRONTEND_URL から WebSocket と API が利用可能になる

## 環境変数

- REDIS_URL — Redis 接続 URL
- FRONTEND_URL — 許可するフロントエンドのオリジン
- ADMIN_PASS — 管理者用パスワード
- PORT — HTTP サーバーの待受ポート（既定 3000）
- TRUST_PROXY — プロキシ下で IP を信頼する場合は true

## HTTP API 概要

認証済み API は Authorization: Bearer <token> を要求する。トークンは POST /api/auth で発行する。

- POST /api/auth  
  リクエスト例
  ```json
  { "username": "taro" }
  ```
  username を省略すると自動的に guest-xxxxxx 形式が割り当てられる。発行トークンには有効期限がある

- GET /api/messages/:roomId  
  指定ルームのメッセージ履歴を取得する。roomId は 1〜32 文字で英数字と _ と - のみを受け付ける。タイムスタンプは ISO 8601 形式で返す

- POST /api/messages/:roomId  
  リクエスト例
  ```json
  { "message": "こんにちは" }
  ```
  message は最大 300 文字。履歴保持は general ルームで最大 300 件、それ以外で最大 100 件に設定

- POST /api/username  
  リクエスト例
  ```json
  { "username": "new-name" }
  ```
  username は 1〜20 文字。変更頻度はサーバー側で制限

- 管理系 API
  - POST /api/admin/login
  - GET /api/admin/status
  - POST /api/admin/logout
  管理用のクリアやログイン／ログアウト用エンドポイントを備える

## WebSocket 概要

- Socket.IO を使いルーム単位のイベント配信とリアルタイム同期を実現する
- WebSocket 接続には認証トークンを要求する
- スケール時は Redis アダプターで複数ノード間のイベント同期を行う

## データ設計と運用ルール

- メッセージと履歴は JSON として Redis に保存
- 古いルーム履歴は定期クリア処理で削除
- IP ベースの接続制御とトークンレート制限、スパム判定は Redis のキーで管理
- 履歴の永続化は運用方針に応じて寿命や取得数を調整すること

## セキュリティと運用注意点

- セキュリティヘッダーを適用しているためヘッダー設定を適切に運用すること
- CORS は FRONTEND_URL を基に制限しているためフロントエンド設定を正しく行うこと
- ADMIN_PASS は安全な値に設定して監査ログを残すこと
- Redis は適切な認証とネットワーク制御で保護すること

## プロジェクト構成

- `server.js` — エントリポイント、プロセスと Redis の管理、定期処理
- `app.js` — Express アプリ、ルーティング、静的配信、セキュリティヘッダー
- `socket.js` — Socket.IO の初期化、認証、ルーム管理
- `auth.js` — 認証ロジック
- `redis.js` — Redis 接続とユーティリティ
- `securityHeaders.js` — セキュリティヘッダー設定
- `routes/` — API ルート一式
- `services/` — スパム判定やビジネスロジック
- `lib/` — 汎用ユーティリティと Redis キー定義
- `public/` — 静的 UI
- `lua/` — Redis Lua スクリプト
- `utils/` — 補助ユーティリティ

## トラブルシューティング

- 接続できない場合は REDIS_URL とネットワーク、FRONTEND_URL を確認すること
- 認証に失敗する場合はトークン発行と期限設定、ADMIN_PASS を確認すること
- 予期しないメモリ増大がある場合は Redis キーのパターンや履歴保持数を見直すこと

## ライセンス

MIT
