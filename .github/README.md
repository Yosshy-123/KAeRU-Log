<div align="center">
  <img height="150px" src="logo.png" />
  <h1>KAeRU Log</h1>
  <h3>Lightweight Node.js and WebSocket Chat App</h3>
  <a href="https://render.com/deploy?repo=https://github.com/Yosshy-123/KAeRU-Log.git"><img height="30px" src="https://render.com/images/deploy-to-render-button.svg" /></a>

  <table>
  	<thead>
  		<tr>
	  		<th>English</th>
		  	<th><a href="README.ja.md">日本語</a></th>
	  	</tr>
	  </thead>
  </table>

</div>

---

## Directory structure

```
├── .github/
│   ├── logo.png
│   ├── README.ja.md
│   └── README.md
├── lib/
│   ├── cleanupRooms.js
│   ├── ipSessionStore.js
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
├── utils/
│   ├── rateLimitUtils.js
│   ├── socketWrapper.js
│   ├── time.js
│   ├── tokenBucket.js
│   └── trustProxy.js
├── app.js
├── auth.js
├── LICENSE
├── package.json
├── redis.js
├── render.yaml
├── securityHeaders.js
├── server.js
└── socket.js
```

---

## Deployment

### 1. Configure Redis

KAeRU Log uses **Redis** for chat logs and state management.

Prepare a Redis instance by one of the following methods.

#### Use Render's Redis (recommended)

1. In the Render dashboard choose **New** → **Key Value**.
2. Give the service a name of your choice.
3. Set **Maxmemory Policy** to **noeviction**.
4. Select region and plan.
5. After creation, save the Redis **Internal Key Value URL**.

#### Use an external Redis service

You may also use an external provider such as:

* [Upstash](https://console.upstash.com/redis)
* [Redis Cloud](https://cloud.redis.io/#/databases)

In any case, obtain the **Redis connection URL**.

### 2. Deploy the application

1. In the Render dashboard choose **New** → **Web Service**.
2. Set the GitHub repository to `https://github.com/Yosshy-123/KAeRU-Log.git`.
3. Give the service a name.
4. Select region and plan.
5. Set **Environment** to Node (v22+).
6. Set the **Build Command**:

```bash
npm install
```

7. Set the **Start Command**:

```bash
npm start
```

8. Configure environment variables:

```env
REDIS_URL=<Redis connection URL>
FRONTEND_URL=<Frontend origin URL>
ADMIN_PASS=<Administrator password>
TRUST_PROXY=<Set to true when running behind a reverse proxy (e.g., Render)>
```

> [!IMPORTANT]
> For `FRONTEND_URL`, specify an origin without a trailing slash, e.g. `https://example.com`.

---

## Live demo

* [https://kaeru-log.yosshy.f5.si/](https://kaeru-log.yosshy.f5.si/)

---

## Bug reports & feedback

For bug reports or suggestions for improvement, please **open an Issue** or contact *Yosshy_123@proton.me*.

> [!NOTE]
> If you contact by email, replies may be delayed.
> If possible, prefer creating an Issue as it is easier to track.

---

## License

This project is provided under the **MIT License**.
