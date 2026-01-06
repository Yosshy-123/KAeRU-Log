# KAeRU Log

[日本語で読む](README.ja.md)

---

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Yosshy-123/KAeRU-Log.git)

> ## Attention: Regarding Redis Eviction Policy
>
> By default, Render does not allow modifying the Redis Maxmemory Policy via YAML.
> KAeRU Log requires all data to be stored in Redis. Therefore, after deployment, please ensure you set the following configuration from the Render dashboard:
>
> 1. Log in to the Render dashboard.
> 2. Open the `kaeru-log-redis` service.
> 3. Navigate to "Settings".
> 4. Set the `Maxmemory Policy` to `noeviction`.
> 5. Save the settings.
>
> If this setting is not applied, data may be deleted when Redis reaches its memory limit, potentially causing KAeRU Log to malfunction.

---

KAeRU Log is a lightweight chat application built with Node.js.
This application is **typically accessed via Cloudflare Workers**.

* The application itself is hosted on Render.
* Cloudflare Workers act as a reverse proxy, relaying requests.

---

## Directory Structure

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

### 1. Deploy the Main Application

Deploy the main application using Render.

1. In the Render dashboard, select **New** → **Web Service**.
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

6. Set the environment variables.

```env
REDIS_URL=<Redis URL>
ADMIN_PASS=<Administrator Password>
SECRET_KEY=<Secret key for tokens>
WORKER_SECRET=<Secret key for reverse proxy>
```

7. After deployment is complete, note down the URL.

### 2. Configure Cloudflare Workers

1. Use `worker.js` from the `src` directory as is.
2. Set the Workers environment variables.

```env
TARGET_URL=<Render Main Application URL>
WORKER_SECRET=<Same secret key as the main application>
```

3. Deploy.

### 3. Access

Access the application via the Cloudflare Workers URL.

---

## About the `Variants` Directory

The `variants` directory contains multiple server implementations with different environments and dependencies.
Each variant has its own `server.js` and `package.json`, allowing for use depending on the purpose.

### Features of Each Variant

| Variant Name | Cloudflare Workers | Redis | Description |
|--------------|-----------------|-------|-------------|
| `standalone` | ❌               | ❌     | A server that uses neither `Redis` nor `Cloudflare Workers`. |
| `redis-only` | ❌               | ✅     | A server that uses `Redis` but not `Cloudflare Workers`. |

* In production environments, the root `server.js` is used, with a configuration leveraging both `Cloudflare Workers` and `Redis`.
* The `standalone` and `redis-only` variants are useful for testing or debugging purposes where fewer dependencies are desired.

---

## Live Demo

[https://kaeru-log.yosshy-123.workers.dev/](https://kaeru-log.yosshy-123.workers.dev/)

---

## Article

[Introduction to KAeRU Log (Qiita)](https://qiita.com/Yosshy_123/items/fa7289905f2fca60e450)

---

## Bug Reports & Feedback

For bug reports or feature requests, please **create an issue** or contact us at *Yosshy_123@proton.me*.

---

## LICENSE

This project is provided under the **MIT LICENSE**.
