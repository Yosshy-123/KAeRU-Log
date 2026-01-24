<div align="center">
  <img height="150px" src="logo.png" />
  <h1>KAeRU Log</h1>
  <h3>Node.js Lightweight Chat App</h3>
  <a href="https://render.com/deploy?repo=https://github.com/Yosshy-123/KAeRU-Log.git"><img height="30px" src="https://render.com/images/deploy-to-render-button.svg" /></a>

  <table>
  	<thead>
  		<tr>
	  		<th><a>English</a></th>
		  	<th><a href="README.ja.md">日本語</a></th>
	  	</tr>
	  </thead>
  </table>

</div>

---

## Directory Structure

```
/
├─ .github/
│  ├─ README.md
│  ├─ README.ja.md
│  └─ logo.png
├─ public/
│  ├─ index.html
│  ├─ js/
│  │  ├─ main.js
│  │  └─ socket.io.min.js
│  ├─ css/
│  │  └─ style.css
│  └─ images/
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

## Deployment

### 1. Set up Redis

KAeRU Log uses **Redis** for chat logs and state management.

Set up Redis using one of the following methods.

#### Use Render's Redis (Recommended)

1. In the Render dashboard, select **New** → **Key Value**.
2. Set an arbitrary service name.
3. Set the **Maxmemory Policy** to **noeviction**.
4. Select a region and plan.
5. After creation, note the Redis **Internal Key Value URL**.

#### Using an External Redis Service

External services like the following are also available:

* [Upstash](https://console.upstash.com/redis)
* [Redis Cloud](https://cloud.redis.io/#/databases)

In either case, obtain the **Redis URL for connection**.

---

### 2. Deploy the App

1. In the Render dashboard, select **New** → **Web Service**.
2. Set the GitHub repository to `https://github.com/Yosshy-123/KAeRU-Log.git`.
3. Set an arbitrary service name.
4. Select the region and plan.
5. Set **Environment** to Node (v22+).
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
```

---

## Live Demo

[https://kaeru-log.onrender.com/](https://kaeru-log.onrender.com/)

---

## Bug Reports & Feedback

Please report bugs or suggest improvements by **creating an issue** or contacting us at *Yosshy_123@proton.me*.

> [!warning]
> If contacting us via email, replies may be delayed.
> We appreciate it if you can use Issues whenever possible.

---

## License

This project is provided under the **MIT License**.

Translated with DeepL.com (free version)
