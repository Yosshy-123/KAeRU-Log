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

## Overview

KAeRU Log is a lightweight, high-performance chat application built with Node.js and WebSocket technology. It features real-time messaging with Redis-backed state management, spam protection, and secure administrator controls.

### ✨ Key Features

- **Real-time Chat**: WebSocket-powered instant messaging with Socket.IO
- **Multi-room Support**: Create and join multiple chat rooms
- **User Management**: Custom usernames and session-based authentication
- **Admin Panel**: Secure message management with password protection
- **Spam Protection**: Intelligent spam detection and rate limiting
- **Redis State Management**: Scalable chat history and user data persistence
- **Security Hardened**: 
  - Content Security Policy (CSP) with nonce-based inline styles
  - Secure headers (HSTS, X-Frame-Options, X-XSS-Protection, etc.)
  - HTTPS/WSS support
  - Input sanitization and validation
- **Graceful Shutdown**: Safe server termination and resource cleanup
- **Health Check**: Built-in `/health` endpoint for monitoring

---

## Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| **Backend** | Node.js | 18.x |
| **Server** | Express.js | 4.18.2+ |
| **Real-time** | Socket.IO | 4.5.4+ |
| **Cache/State** | Redis | 4.6.5+ |
| **Frontend** | Vanilla JavaScript (ES6+) | - |

---

## Directory Structure

```
├── .github/
│   ├── logo.png
│   ├── README.ja.md
│   └── README.md
├── lib/
│   ├── redisHelpers.js          # Redis utility functions
│   └── redisKeys.js              # Redis key definitions
├── lua/
│   ├── spamService.lua           # Lua scripts for spam detection
│   └── tokenBucket.lua           # Lua scripts for rate limiting
├── public/
│   ├── css/
│   │   └── style.css             # Application styles
│   ├── images/
│   │   ├── favicon-16x16.png
│   │   ├── favicon-32x32.png
│   │   ├── favicon-96x96.png
│   │   └── logo.png
│   ├── js/
│   │   ├── api.js                # API client functions
│   │   ├── config.js             # Frontend configuration
│   │   ├── dom.js                # DOM element cache (Proxy-based)
│   │   ├── index.js              # Entry point
│   │   ├── init.js               # Initialization logic
│   │   ├── modal.js              # Modal management
│   │   ├── render.js             # Message rendering
│   │   ├── room.js               # Room management
│   │   ├── services.js           # Business logic
│   │   ├── socket.io.min.js
│   │   ├── socket.js             # WebSocket client
│   │   ├── state.js              # Application state
│   │   ├── toast.js              # Toast notifications
│   │   └── utils.js              # Utility functions
│   └── index.html
├── routes/
│   ├── apiAdmin.js               # Admin endpoints
│   ├── apiAuth.js                # Authentication endpoints
│   ├── apiMessages.js            # Message endpoints
│   └── apiUsername.js            # Username endpoints
├── services/
│   └── spamService.js            # Spam detection service
├── src/
│   └── render.gs                 # Google Apps Script for keep-alive
├── utils/
│   ├── logger.js                 # Logging with Redis persistence
│   ├── redisUtils.js             # Redis utility functions
│   ├── sanitize.js               # HTML/XSS sanitization
│   ├── socketWrapper.js          # Socket error wrapper
│   ├── time.js                   # Timezone utilities (JST formatting)
│   └── tokenBucket.js            # Rate limiting
├── app.js                         # Express app setup
├── auth.js                        # Authentication logic
├── LICENSE                        # MIT License
├── package.json                   # Dependencies
├── redis.js                       # Redis client setup
├── render.yaml                    # Render.com deployment config
├── securityHeaders.js             # Security headers middleware
├── server.js                      # Server entry point
└── socket.js                      # Socket.IO setup
```

---

## Installation & Local Development

### Prerequisites

- Node.js 18.x or higher
- npm 8.0.0 or higher
- Redis instance

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Yosshy-123/KAeRU-Log.git
   cd KAeRU-Log
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create `.env` file**
   ```env
   PORT=3000
   REDIS_URL=redis://localhost:6379
   ADMIN_PASS=your-secure-password
   FRONTEND_URL=http://localhost:3000
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open in browser**
   ```
   http://localhost:3000
   ```

---

## Deployment to Render.com

### 1. Configure Redis

KAeRU Log requires a **Redis** instance for chat history and state management.

#### Option A: Use Render's Redis (Recommended)

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New** → **Key Value Store**
3. Give it a name (e.g., `kaeru-log-redis`)
4. Set **Maxmemory Policy** to `noeviction`
5. Select region and plan
6. After creation, copy the **Internal Redis URL**

#### Option B: Use External Redis Service

Popular providers:
- [Upstash Redis](https://console.upstash.com/redis)
- [Redis Cloud](https://cloud.redis.io/#/databases)
- [Amazon ElastiCache](https://aws.amazon.com/elasticache/redis/)

### 2. Deploy Application

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New** → **Web Service**
3. Connect your GitHub repository
4. Select `Yosshy-123/KAeRU-Log` repository
5. Configure the service:
   - **Name**: `kaeru-log` (or your choice)
   - **Region**: Choose closest to your users
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

6. Add environment variables:
   ```
   REDIS_URL=<your-redis-url>
   ADMIN_PASS=<secure-password-for-admin>
   FRONTEND_URL=https://kaeru-log.onrender.com
   ```

7. Click **Create Web Service**

The app will automatically deploy and be available at `https://kaeru-log.onrender.com`.

> [!IMPORTANT]
> For `FRONTEND_URL`, use the format `https://your-service-name.onrender.com` (no trailing slash).

---

## API Reference

### Authentication
- `POST /api/auth` - Get authentication token

### Messages
- `GET /api/messages/:roomId` - Fetch chat history
- `POST /api/messages` - Send a message

### Users
- `POST /api/username` - Update username

### Admin
- `POST /api/admin/login` - Admin login
- `GET /api/admin/status` - Check admin status
- `POST /api/admin/logout` - Admin logout
- `POST /api/admin/clear/:roomId` - Clear messages

### Health
- `GET /health` - Health check endpoint

---

## Security Features

### Content Security Policy (CSP)
- Blocks inline scripts and eval()
- Uses nonce-based inline styles
- Restricts resource loading to trusted sources
- Prevents clickjacking and XSS attacks

### Security Headers
- **X-Content-Type-Options**: `nosniff` (MIME sniffing protection)
- **X-Frame-Options**: `SAMEORIGIN` (Clickjacking protection)
- **X-XSS-Protection**: `1; mode=block` (Legacy XSS protection)
- **Strict-Transport-Security**: 1-year HSTS with preload
- **Referrer-Policy**: `strict-origin-when-cross-origin`
- **Permissions-Policy**: Restricts sensitive APIs

### Additional Security
- Input sanitization with XSS protection
- Rate limiting on authentication and username changes
- Spam detection with muting
- Secure password hashing for admin access
- HTTPS/WSS enforcement on Render.com

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `REDIS_URL` | **Yes** | Redis connection URL |
| `ADMIN_PASS` | **Yes** | Administrator password |
| `FRONTEND_URL` | **Yes** | Frontend origin URL (e.g., https://example.com) |

### Application Settings

Rate limiting and spam settings are configured in:
- `routes/apiAuth.js` - Auth rate limits
- `routes/apiUsername.js` - Username change rate limits
- `routes/apiMessages.js` - Message rate limits
- `services/spamService.js` - Spam detection rules

---

## Monitoring & Logs

### Health Check
```bash
curl https://kaeru-log.onrender.com/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-14T12:34:56.789Z",
  "uptime": 3600.5
}
```

### Server Logs
All errors and important events are logged to:
1. **Console** - Real-time output
2. **Redis** - Persistent logs (key: `logs:YYYY-MM-DD`)

---

## Live Demo

[https://kaeru-log.onrender.com/](https://kaeru-log.onrender.com/)

---

## Development Guide

### Code Style
- Use `'use strict'` mode
- Async/await for promise handling
- JSDoc comments for functions

### Testing
```bash
npm test
```

### Development Server
```bash
npm run dev
```

Uses nodemon for auto-reload on file changes.

---

## Bug Reports & Feedback

Found an issue or have a suggestion? Please:

1. **Open an Issue** on GitHub (Recommended)
   - Easier to track and reference
   - Better for long-term documentation

2. **Email** (Optional)
   - Yosshy_123@proton.me
   - Note: Email responses may be delayed

Please include:
- Description of the issue
- Steps to reproduce
- Expected vs. actual behavior
- Browser/environment information

---

## Contributing

While this is a personal project, suggestions and bug reports are welcome!

---

## License

This project is provided under the **MIT License**.

See [LICENSE](LICENSE) file for details.

---

## Author

**Yosshy** - [GitHub Profile](https://github.com/Yosshy-123)

For inquiries: Yosshy_123@proton.me