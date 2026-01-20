<div align="center">
  <img height="150px" src="logo.png" />
  <h1>KAeRU Log</h1>
  <h3>A lightweight chat application built with Node.js</h3>
  <a href="https://render.com/deploy?repo=https://github.com/Yosshy-123/KAeRU-Log.git"><img height="30px" src="https://render.com/images/deploy-to-render-button.svg" /></a>
</div>

---

[日本語で読む](README.md)

---

KAeRU Log is a lightweight chat application built with Node.js.
This application is typically **accessed via Cloudflare Workers**.

* The main application is hosted on Render.
* Cloudflare Workers acts as a reverse proxy to relay requests.

---

## Directory Structure

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
├─ src
│  └─ worker.js
├─ server.js
├─ package.json
├─ LICENSE
└─ render.yaml
```

---

## Deployment

### 1. Configure Redis

KAeRU Log uses **Redis** for chat logs and state management.

Please prepare Redis using one of the following methods:

#### Using Render's Redis (Recommended)

1. On the Render dashboard, select **New** -> **Key Value**.
2. Set any service name.
3. Set **Maxmemory Policy** to **noeviction**.
4. Select a region and a plan.
5. After creation, note down the Redis **Internal Key Value URL**.

#### Using an External Redis Service

You can also use external services such as:

* [Upstash](https://console.upstash.com/redis)
* [Redis Cloud](https://cloud.redis.io/#/databases)

In either case, obtain the **Redis connection URL**.

### 2. Deploy the Main Application

Deploy the main application using Render.

1. On the Render dashboard, select **New** -> **Web Service**.
2. Set the GitHub repository to `https://github.com/Yosshy-123/KAeRU-Log.git`.
3. Set any service name.
4. Select a region and a plan.
5. Set the **Environment** to Node (v22+).
6. Configure the **Build Command**.

```bash
npm install
```

7. Configure the **Start Command**.

```bash
npm start
```

8. Set environment variables.

```env
REDIS_URL=<Redis URL>
ADMIN_PASS=<Administrator Password>
SECRET_KEY=<Secret key used to generate and sign tokens>
TOKEN_KEY=<Token secret key>
```

9. After deployment is complete, note down the URL.

### 3. Configure Cloudflare Workers

1. Use `worker.js` in the `src` directory as is.
2. Set the Workers environment variables.

```env
TARGET_URL=<Render application URL>
TOKEN_KEY=<Same token key as the main application>
```

3. Deploy.

### 4. Access

Please access through the Cloudflare Workers URL.

---

## Live Demo

[https://kaeru-log.yosshy-123.workers.dev/](https://kaeru-log.yosshy-123.workers.dev/)

---

## Articles

[Introduction to KAeRU Log (Qiita)](https://qiita.com/Yosshy_123/items/fa7289905f2fca60e450)

---

## Bug Reports & Feedback

For bugs or improvement requests, please create an **Issue** or contact us at *Yosshy_123@proton.me*.

---

## LICENSE

This project is provided under the **MIT LICENSE**.
