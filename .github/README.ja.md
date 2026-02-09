<div align="center">
  <img height="150px" src="logo.png" />
  <h1>KAeRU Log</h1>
  <h3>Node.js 軽量チャットアプリ</h3>
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

## ディレクトリ構成

```
├── .github/
│   ├── logo.png
│   ├── README.ja.md
│   └── README.md
├── lib/
│   ├── redisHelpers.js
│   └── redisKeys.js
├── lua/
│   ├── spamService.lua
│   └── tokenBucket.lua
├── public/
│   ├── css/
│   │   └── style.css
│   ├── images/
│   │   ├── favicon-16x16.png
│   │   ├── favicon-32x32.png
│   │   ├── favicon-96x96.png
│   │   └── logo.png
│   ├── js/
│   │   ├── api.js
│   │   ├── config.js
│   │   ├── dom.js
│   │   ├── index.js
│   │   ├── init.js
│   │   ├── modal.js
│   │   ├── render.js
│   │   ├── room.js
│   │   ├── services.js
│   │   ├── socket.io.min.js
│   │   ├── socket.js
│   │   ├── state.js
│   │   ├── toast.js
│   │   └── utils.js
│   └── index.html
├── routes/
│   ├── apiAdmin.js
│   ├── apiAuth.js
│   ├── apiMessages.js
│   └── apiUsername.js
├── services/
│   └── spamService.js
├── src/
│   ├── hop-check.js
│   └── render.gs
├── utils/
│   ├── logger.js
│   ├── redisUtils.js
│   ├── sanitize.js
│   ├── socketWrapper.js
│   ├── time.js
│   └── tokenBucket.js
├── app.js
├── auth.js
├── cron.js
├── LICENSE
├── package.json
├── redis.js
├── render.yaml
├── securityHeaders.js
├── server.js
└── socket.js
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
FRONTEND_URL=<フロントエンドの URL>
ADMIN_PASS=<管理者パスワード>
```

> [!IMPORTANT]
> FRONTEND_URL には `https://example.com` のように、末尾スラッシュなしのオリジンを指定してください。

---

## ライブデモ

[https://kaeru-log.onrender.com/](https://kaeru-log.onrender.com/)

---

## バグ報告・フィードバック

不具合の報告や改善のご提案は、 **Issue の作成** または *Yosshy_123@proton.me* までご連絡ください。

> [!NOTE]
> メールでのご連絡の場合、返信が遅れる可能性があります。
> 可能な場合は Issue をご利用いただけると助かります。

---

## ライセンス

このプロジェクトは **MIT ライセンス** に基づいて提供されています。
