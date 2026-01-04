# KAeRU Log

[Read in English](README.md)

---

KAeRU Log は、Node.js を使って構築した軽量チャットアプリです。  
このアプリは **必ず Cloudflare Workers を経由してアクセス** します。

- アプリ本体は Render や Koyeb でホスト
- Cloudflare Workers がリバースプロキシとしてリクエストを中継

---

## ディレクトリ構成

```
/
├─ .github
│  ├─ README.md
│  └─ README.ja.md
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
├─ server.js
├─ no-cf-server.js
├─ package.json
└─ LICENSE
```

---

## デプロイ

### 1. アプリ本体をデプロイ

Render または Koyeb を使用してアプリ本体をデプロイします。

#### Render の場合

1. Render ダッシュボードで **New → Web Service** を選択  
2. GitHub リポジトリとして `KAeRU-Log` を選択  
3. **Environment** を Node (v22+) に設定  
4. **Build Command** を設定

```bash
npm install
```

5. **Start Command** を設定

```bash
node server.js
```

6. 環境変数を設定

```env
REDIS_URL=redis://<ホスト>:<ポート>
ADMIN_PASS=<管理者パスワード>
SECRET_KEY=<トークン用シークレットキー>
WORKER_SECRET=<worker.js と同一のキー>
```

7. デプロイ完了後、URL を控えておく

#### Koyeb の場合

1. Koyeb ダッシュボードで **Create App → Deploy from Git Repository** を選択  
2. リポジトリを選択し、**Service Type** を Web Service に設定  
3. Build / Start Command を Render と同様に設定  
4. 環境変数を設定  
5. デプロイ完了後、URL を控えておく

### 2. Cloudflare Workers を設定

1. `src/worker.js` をそのまま使用  
2. Workers 環境変数を設定

```env
TARGET_URL=<Render/Koyeb のアプリ本体 URL>
WORKER_SECRET=<アプリ本体と同じ WORKER_SECRET>
```

3. デプロイ  

### 3. アクセス

Cloudflare Workers の URL からアクセスしてください。

---

## デモ

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

---

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Yosshy-123/KAeRU-Log.git)

[![Deploy to Koyeb](https://www.koyeb.com/static/images/deploy/button.svg)](https://app.koyeb.com/deploy?type=git&repository=github.com/Yosshy-123/KAeRU-Log.git)
