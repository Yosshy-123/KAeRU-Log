# KAeRU Log

[Read in English](README.en.md)

---

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Yosshy-123/KAeRU-Log.git)

---

KAeRU Log は、Node.js を使って構築した軽量チャットアプリです。  
このアプリは通常、 **Cloudflare Workers を経由してアクセス** されます。

* アプリ本体は Render でホストします。
* Cloudflare Workers がリバースプロキシとしてリクエストを中継します。

---

## ディレクトリ構成

```
/
├─ .github
│  ├─ README.md
│  └─ README.en.md
├─ public
│  ├─ index.html
│  ├─ main.js
│  ├─ socket.io.min.js
│  ├─ style.css
│  ├─ logo.png
│  ├─ favicon-16x16.png
│  ├─ favicon-32x32.png
│  └─ favicon-96x96.png
├─ src
│  └─ worker.js
├─ variants
│  ├─ standalone
│  │  ├─ server.js
│  │  └─ package.json
│  └─ redis-only
│     ├─ server.js
│     └─ package.json
├─ server.js
├─ package.json
├─ LICENSE
└─ render.yaml
```

---

## デプロイ

### 1. Redis を設定する

KAeRU Log では、チャットログや状態管理のために **Redis** を使用します。
本番環境および `redis-only` バリアントでは Redis の設定が必須です。

以下のいずれかの方法で Redis を用意してください。

#### Render の Redis を使う（推奨）

1. Render ダッシュボードで **New** → **Redis** を選択します。
2. 任意のサービス名を設定します。
3. リージョンを選択し、プランを選択します（Free / Paid）。
4. 作成完了後、Redis の **Internal URL** または **Redis URL** を控えます。

#### 外部 Redis サービスを使う

以下のような外部サービスなども利用できます。

* [Upstash](https://console.upstash.com/redis)
* [Redis Cloud](https://cloud.redis.io/#/databases)

いずれの場合も、**接続用の Redis URL** を取得してください。

### 2. アプリ本体をデプロイ

Render を使用してアプリ本体をデプロイします。

1. Render ダッシュボードで **New** → **Web Service** を選択します。
2. GitHub リポジトリとして `KAeRU-Log` を選択します。
3. **Environment** を Node (v22+) に設定します。
4. **Build Command** を設定します。

```bash
npm install
```

5. **Start Command** を設定します。

```bash
npm start
```

6. 環境変数を設定します。

```env
REDIS_URL=<Redis の URL>
ADMIN_PASS=<管理者パスワード>
SECRET_KEY=<トークン用シークレットキー>
WORKER_SECRET=<Cloudflare Workers と共有するシークレットキー>
```

7. デプロイ完了後、URL を控えておきます。

### 3. Cloudflare Workers を設定

1. `src`ディレクトリの`worker.js` をそのまま使用します。
2. Workers 環境変数を設定します。

```env
TARGET_URL=<Render のアプリ本体 URL>
WORKER_SECRET=<アプリ本体と同じシークレットキー>
```

3. デプロイします。

### 4. アクセス

Cloudflare Workers の URL からアクセスしてください。

---

## `Variants` ディレクトリについて

`variants` ディレクトリには、環境や依存関係が異なる複数のサーバー実装が格納されています。  
各バリアントには独自の `server.js` と `package.json` があり、用途に応じて使い分けます。

### 各バリアントの特徴

| バリアント名      | Cloudflare Workers | Redis | 説明 |
|------------------|-----------------|-------|------|
| `standalone`      | ❌               | ❌     | `Redis` も `Cloudflare Workers` も使用しないサーバーです。 |
| `redis-only`      | ❌               | ✅     | `Redis` を使用するが `Cloudflare Workers` は使用しないサーバーです。 |

* 本番環境ではルートの `server.js` を使用し、`Cloudflare Workers` と `Redis` を利用する構成が標準です。
* 依存関係の少ないテストやデバッグ用途では `standalone` や `redis-only` を利用すると便利です。
* いずれの場合も、ルートディレクトリで実行してください。

---

## ライブデモ

[https://kaeru-log.yosshy-123.workers.dev/](https://kaeru-log.yosshy-123.workers.dev/)

---

## 記事

[KAeRU Log 紹介記事 (Qiita)](https://qiita.com/Yosshy_123/items/fa7289905f2fca60e450)

---

## バグ報告・フィードバック

不具合や改善リクエストは **Issue の作成** または *Yosshy_123@proton.me* までご連絡ください。

---

## ライセンス

このプロジェクトは **MIT ライセンス** に基づいて提供されています。
