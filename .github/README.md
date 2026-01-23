<div align="center">
  <img height="150px" src="logo.png" />
  <h1>KAeRU Log</h1>
  <h3>Node.js 軽量チャットアプリ</h3>
  <a href="https://render.com/deploy?repo=https://github.com/Yosshy-123/KAeRU-Log.git"><img height="30px" src="https://render.com/images/deploy-to-render-button.svg" /></a>
</div>

---

## ディレクトリ構成

```
/
├─ .github
│  ├─ README.md
│  └─ README.en.md
├─ public
│  ├─ index.html
│  ├─ js
│  │  ├─ main.js
│  │  └─ socket.io.min.js
│  ├─ css
│  │  └─ style.css
│  └─ images
│     ├─ logo.png
│     ├─ favicon-16x16.png
│     ├─ favicon-32x32.png
│     └─ favicon-96x96.png
├─ server.js
├─ package.json
├─ LICENSE
└─ render.yaml
```

---

## デプロイ

### 1. Redis を設定する

KAeRU Log では、チャットログや状態管理のために **Redis** を使用します。

以下のいずれかの方法で Redis を用意してください。

#### Render の Redis を使う（推奨）

1. Render ダッシュボードで **New** → **Key Value** を選択します。
2. 任意のサービス名を設定します。
3. **Maxmemory Policy** を **noeviction** に設定します。
4. リージョンとプランを選択します。
5. 作成完了後、Redis の **Internal Key Value URL** を控えておきます。

#### 外部 Redis サービスを使う

以下のような外部サービスも利用可能です。

* [Upstash](https://console.upstash.com/redis)
* [Redis Cloud](https://cloud.redis.io/#/databases)

いずれの場合も、**接続用の Redis URL** を取得してください。

---

### 2. アプリ本体をデプロイ

1. Render ダッシュボードで **New** → **Web Service** を選択します。
2. GitHub リポジトリとして `https://github.com/Yosshy-123/KAeRU-Log.git` を設定します。
3. 任意のサービス名を設定します。
4. リージョンとプランを選択します。
5. **Environment** を Node (v22+) に設定します。
6. **Build Command** を設定します。

```bash
npm install
```

7. **Start Command** を設定します。

```bash
npm start
```

8. 環境変数を設定します。

```env
REDIS_URL=<Redis の URL>
ADMIN_PASS=<管理者パスワード>
SECRET_KEY=<クライアント ID 生成用シークレットキー>
```

---

## ライブデモ

[https://kaeru-log.onrender.com/](https://kaeru-log.onrender.com/)

---

## 記事

[KAeRU Log 紹介記事 (Qiita)](https://qiita.com/Yosshy_123/items/fa7289905f2fca60e450)

---

## バグ報告・フィードバック

不具合や改善リクエストは **Issue の作成** または *Yosshy_123@proton.me* までご連絡ください。

---

## ライセンス

このプロジェクトは **MIT ライセンス** に基づいて提供されています。
