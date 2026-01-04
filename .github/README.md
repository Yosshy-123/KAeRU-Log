# KAeRU Log

[日本語で読む](README.ja.md)

---

KAeRU Log is a lightweight chat application built with Node.js.  
This app **must be accessed via Cloudflare Workers**.  
The actual server runs on Render, Koyeb, or a similar hosting service, while Workers acts as a reverse proxy.

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
├─ server.js
├─ package.json
└─ LICENSE
```

---

## Environment and Setup

Node.js (v22 or higher recommended) is required for dependency management.  

The app runs in the following setup:

1. **App server**: Hosted on Render, Koyeb, or similar Node.js hosting  
2. **Cloudflare Workers**: `src/worker.js` is used to proxy all requests  

### 1. Deploy the App Server

Deploy the repository to Render or Koyeb.  
Set the environment variables in `.env`:

```.env
REDIS_URL=redis://<host>:<port>

# Optional (recommended)
ADMIN_PASS=<admin password>
SECRET_KEY=<token secret key>
WORKER_SECRET=<must match the key in worker.js>
```

- `REDIS_URL` is **required**  
- `WORKER_SECRET` is used for authentication with Cloudflare Workers  

The app server URL will later be set as `TARGET_URL` in Workers.

---

### 2. Configure Cloudflare Workers

1. Use the `src/worker.js` file.  
2. Set the following environment variables in Cloudflare:

```.env
TARGET_URL=<URL of the app server on Render/Koyeb>
WORKER_SECRET=<same as .env key>
```

3. Deploy the Worker using `wrangler`:

```bash
wrangler publish
```

All app requests will now go through the Workers proxy.

---

## Access

Use the Cloudflare Workers URL to access the app:

[https://kaeru-log.yosshy-123.workers.dev/](https://kaeru-log.yosshy-123.workers.dev/)

---

## Articles

Read the introduction article about KAeRU Log:

[https://qiita.com/Yosshy_123/items/fa7289905f2fca60e450](https://qiita.com/Yosshy_123/items/fa7289905f2fca60e450)

---

## Bug Reports & Feedback

Report issues via **GitHub Issues** or contact *Yosshy_123@proton.me*.

---

## License

This project is licensed under the **MIT License**.

---

## Deployment

Deploy the app server easily with the following buttons:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Yosshy-123/KAeRU-Log.git)

[![Deploy to Koyeb](https://www.koyeb.com/static/images/deploy/button.svg)](https://app.koyeb.com/deploy?type=git&repository=github.com/Yosshy-123/KAeRU-Log.git)
