# KAeRU Log

[日本語で読む](README.md)

---

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Yosshy-123/KAeRU-Log.git)

---

KAeRU Log is a lightweight chat application built using Node.js.
This application is typically accessed via **Cloudflare Workers**.

* The application itself is hosted on Render.
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

## Deployment

### 1. Configure Redis

KAeRU Log uses **Redis** for chat logs and state management.
Redis configuration is mandatory for the production environment and the `redis-only` variant.

Please prepare Redis using one of the following methods:

#### Using Render's Redis (Recommended)

1. In the Render dashboard, select **New** -> **Redis**.
2. Set any desired service name.
3. Select a region and choose a plan (Free / Paid).
4. After creation is complete, note down the Redis **Internal URL** or **Redis URL**.

#### Using an External Redis Service

You can also use external services such as:

* [Upstash](https://console.upstash.com/redis)
* [Redis Cloud](https://cloud.redis.io/#/databases)

In either case, obtain the **connection Redis URL**.

### 2. Deploy the Application

Deploy the application using Render.

1. In the Render dashboard, select **New** -> **Web Service**.
2. Select `KAeRU-Log` as the GitHub repository.
3. Set the **Environment** to Node (v22+).
4. Configure the **Build Command**.

```bash
npm install
```

5. Configure the **Start Command**.

```bash
npm start
```

6. Set environment variables.

```env
REDIS_URL=<Redis URL>
ADMIN_PASS=<Admin Password>
SECRET_KEY=<Secret key for tokens>
WORKER_SECRET=<Secret key to share with Cloudflare Workers>
```

7. After deployment is complete, note down the URL.

### 3. Configure Cloudflare Workers

1. Use `worker.js` in the `src` directory as is.
2. Set Workers environment variables.

```env
TARGET_URL=<Render's application URL>
WORKER_SECRET=<Same secret key as the application>
```

3. Deploy.

### 4. Access

Access the application via the Cloudflare Workers URL.

---

## About the `Variants` Directory

The `variants` directory contains multiple server implementations with different environments and dependencies.
Each variant has its own `server.js` and `package.json`, allowing for flexible usage based on needs.

### Characteristics of Each Variant

| Variant Name      | Cloudflare Workers | Redis | Description |
|-------------------|-----------------|-------|-------------|
| `standalone`      | ❌               | ❌     | A server that uses neither `Redis` nor `Cloudflare Workers`. |
| `redis-only`      | ❌               | ✅     | A server that uses `Redis` but not `Cloudflare Workers`. |

* The root `server.js` is used in the production environment, configured to utilize `Cloudflare Workers` and `Redis`.
* The `standalone` and `redis-only` variants are convenient for testing or debugging purposes with fewer dependencies.
* In all cases, execute from the root directory.

---

## Live Demo

[https://kaeru-log.yosshy-123.workers.dev/](https://kaeru-log.yosshy-123.workers.dev/)

---

## Articles

[Introduction to KAeRU Log (Qiita)](https://qiita.com/Yosshy_123/items/fa7289905f2fca60e450)

---

## Bug Reports & Feedback

For bugs or feature requests, please **create an issue** or contact us at *Yosshy_123@proton.me*.

---

## LICENSE

This project is provided under the **MIT LICENSE**.
