# KAeRU Log

[日本語で読む](README.ja.md)

---

KAeRU Log is a lightweight chat application built with Node.js.
This application **must be accessed through Cloudflare Workers**.

- The application itself is hosted on Render or Koyeb.
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
├─ package.json
└─ LICENSE
```

---

## Environment and Setup

This application runs in an environment with Node.js installed (v22 or later recommended).

### 1. Clone the Repository

```bash
git clone https://github.com/Yosshy-123/KAeRU-Log.git
cd KAeRU-Log
```

### 2. Install Dependency Packages

```bash
npm install
```

### 3. Set Environment Variables

Create a `.env` file in the project root and add the following:

```env
REDIS_URL=redis://<host>:<port>
ADMIN_PASS=<administrator password>
SECRET_KEY=<secret key for token>
WORKER_SECRET=<key identical to worker.js>
```

---

## 4. Deploy the Application

Deploy the application itself using Render or Koyeb.

### For Render

1. Select **New → Web Service** on the Render dashboard.
2. Select `KAeRU-Log` as the GitHub repository.
3. Set **Environment** to Node (v22+).
4. Set **Build Command** to `npm install`.
5. Set **Start Command** to `node server.js`.
6. Configure environment variables (same as the contents of `.env` above).
7. After deployment is complete, note down the URL.

### For Koyeb

1. Select **Create App → Deploy from Git Repository** on the Koyeb dashboard.
2. Select the repository and set **Service Type** to Web Service.
3. Configure Build/Start Commands similarly to Render.
4. Configure environment variables.
5. After deployment is complete, note down the URL.

---

## 5. Configure Cloudflare Workers

1. Use `src/worker.js` as is.
2. Set Workers environment variables:

```env
TARGET_URL=<application URL on Render/Koyeb>
WORKER_SECRET=<WORKER_SECRET identical to the application>
```

3. Deploy.

---

## 6. Access

Access the application via the Cloudflare Workers URL.

---

## 7. Demo

[https://kaeru-log.yosshy-123.workers.dev/](https://kaeru-log.yosshy-123.workers.dev/)

---

## 8. Articles

[Introduction to KAeRU Log (Qiita)](https://qiita.com/Yosshy_123/items/fa7289905f2fca60e450)

---

## 9. Bug Reports & Feedback

For bugs or feature requests, please create an **Issue** or contact *Yosshy_123@proton.me*.

---

## 10. License

This project is provided under the **MIT License**.

---

## Deploy

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Yosshy-123/KAeRU-Log.git)

[![Deploy to Koyeb](https://www.koyeb.com/static/images/deploy/button.svg)](https://app.koyeb.com/deploy?type=git&repository=github.com/Yosshy-123/KAeRU-Log.git)
