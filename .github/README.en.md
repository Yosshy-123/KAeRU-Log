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
* Cloudflare Workers act as a reverse proxy to relay requests.

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

## Deployment

### 1. Set up Redis

KAeRU Log uses **Redis** for chat logs and state management.
Redis setup is mandatory for the production environment and the `redis-only` variant.

Prepare Redis using one of the following methods:

#### Using Render's Redis (Recommended)

1. In the Render dashboard, select **New** -> **Key Value**.
2. Set any service name.
3. Set **Maxmemory Policy** to **noeviction**.
4. Select a region and then a plan.
5. After creation, note down the Redis **Internal Key Value URL**.

#### Using an External Redis Service

External services such as the following can also be used:

* [Upstash](https://console.upstash.com/redis)
* [Redis Cloud](https://cloud.redis.io/#/databases)

In either case, obtain the **Redis connection URL**.

### 2. Deploy the Main Application

Deploy the main application using Render.

1. In the Render dashboard, select **New** -> **Web Service**.
2. Set `https://github.com/Yosshy-123/KAeRU-Log.git` as the GitHub repository.
3. Set any service name.
4. Select a region and then a plan.
5. Set the **Environment** to Node (v22+).
6. Set the **Build Command**.

```bash
npm install
```

7. Set the **Start Command**.

```bash
npm start
```

8. Set environment variables.

```env
REDIS_URL=<Redis URL>
ADMIN_PASS=<Administrator Password>
SECRET_KEY=<Secret key for tokens>
WORKER_SECRET=<Secret key shared with Cloudflare Workers>
```

9. After deployment is complete, note down the URL.

### 3. Set up Cloudflare Workers

1. Use `worker.js` in the `src` directory as is.
2. Set Worker environment variables.

```env
TARGET_URL=<Render application URL>
WORKER_SECRET=<Secret key same as the application>
```

3. Deploy.

### 4. Access

Access the application from the Cloudflare Workers URL.

---

## About the `Variants` Directory

The `variants` directory contains multiple server implementations with different environments and dependencies.
Each variant has its own `server.js` and `package.json` and can be used according to its purpose.

### Characteristics of Each Variant

| Variant Name | Cloudflare Workers | Redis | Description |
|--------------|-----------------|-------|-------------|
| `standalone` | ❌ | ❌ | A server that uses neither `Redis` nor `Cloudflare Workers`. |
| `redis-only` | ❌ | ✅ | A server that uses `Redis` but not `Cloudflare Workers`. |

* The production environment uses the root `server.js` and the configuration utilizes `Cloudflare Workers` and `Redis` as standard.
* For testing or debugging purposes with fewer dependencies, using `standalone` or `redis-only` is convenient.
* In all cases, execute from the root directory.

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
