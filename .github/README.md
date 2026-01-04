# KAeRU Log

[日本語で読む](README.ja.md)

---

KAeRU Log is a lightweight chat application built using Node.js.
- This application **must always be accessed via Cloudflare Workers**.

- The main application is hosted on Render or Koyeb.
- Cloudflare Workers act as a reverse proxy to relay requests.

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
├─ no-cf-server.js
├─ package.json
└─ LICENSE
```

---

## Deployment

### 1. Deploy the Main Application

Deploy the main application using Render or Koyeb.

#### For Render

1. In the Render dashboard, select **New → Web Service**.
2. Select `KAeRU-Log` as the GitHub repository.
3. Set the **Environment** to Node (v22+).
4. Set the **Build Command**.

```bash
npm install
```

5. Set the **Start Command**.

```bash
node server.js
```

6. Set environment variables.

```env
REDIS_URL=redis://<host>:<port>
ADMIN_PASS=<admin password>
SECRET_KEY=<secret key for tokens>
WORKER_SECRET=<secret key for reverse proxy>
```

7. After deployment is complete, note down the URL.

#### For Koyeb

1. In the Koyeb dashboard, select **Create App → Deploy from Git Repository**.
2. Select the repository and set the **Service Type** to Web Service.
3. Set the Build/Start Commands similar to Render.
4. Set environment variables.
5. After deployment is complete, note down the URL.

### 2. Configure Cloudflare Workers

1. Use `src/worker.js` as is.
2. Set Workers environment variables.

```env
TARGET_URL=<URL of the main application on Render/Koyeb>
WORKER_SECRET=<same secret key as the main application>
```

3. Deploy.

### 3. Access

Please access the application via the Cloudflare Workers URL.

---

## Demo

[https://kaeru-log.yosshy-123.workers.dev/](https://kaeru-log.yosshy-123.workers.dev/)

---

## Articles

[Introduction to KAeRU Log (Qiita)](https://qiita.com/Yosshy_123/items/fa7289905f2fca60e450)

---

## Bug Reports & Feedback

For bugs or feature requests, please create an **Issue** or contact us at *Yosshy_123@proton.me*.

---

## License

This project is provided under the **MIT License**.

---

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Yosshy-123/KAeRU-Log.git)

[![Deploy to Koyeb](https://www.koyeb.com/static/images/deploy/button.svg)](https://app.koyeb.com/deploy?type=git&repository=github.com/Yosshy-123/KAeRU-Log.git)
