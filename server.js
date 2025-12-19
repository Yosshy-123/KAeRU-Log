import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234';

let messages = [];
let users = new Map(); // seed -> { username }
let onlineUsers = new Set();

// ----------------- サニタイズ -----------------
function sanitize(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ----------------- ミドルウェア -----------------
app.use(express.json());
app.use(express.static('public'));

// ----------------- API -----------------

// 新規ユーザーシード発行
app.post('/api/register', (req, res) => {
  const seed = uuidv4();
  users.set(seed, { username: '' });
  res.json({ seed });
});

// ユーザー名更新
app.post('/api/username', (req, res) => {
  const { seed, username } = req.body;
  if (!seed || !username || username.length > 24) return res.status(400).json({ error: 'invalid' });
  if (!users.has(seed)) return res.status(400).json({ error: 'unknown seed' });

  users.get(seed).username = sanitize(username);
  res.json({ ok: true });
});

// メッセージ取得
app.get('/api/messages', (req, res) => {
  res.json(messages);
});

// メッセージ送信
app.post('/api/messages', (req, res) => {
  const { seed, message, time } = req.body;
  if (!seed || !message || !time) return res.status(400).json({ error: 'invalid' });
  if (!users.has(seed)) return res.status(400).json({ error: 'unknown user' });

  const username = users.get(seed).username || '未設定';
  const cleanMessage = sanitize(message).slice(0, 800);

  const msg = { username, message: cleanMessage, time, seed, reactions: {} };
  messages.push(msg);
  const id = messages.length - 1;

  io.emit('newMessage', msg);
  res.json({ ok: true, id });
});

// リアクション更新
app.post('/api/reaction', (req, res) => {
  const { seed, messageId, reaction } = req.body;
  if (!seed || !reaction || typeof messageId !== 'number') return res.status(400).json({ error: 'invalid' });
  if (!users.has(seed)) return res.status(400).json({ error: 'unknown user' });
  if (!messages[messageId]) return res.status(400).json({ error: 'unknown message' });

  const r = messages[messageId].reactions;
  r[reaction] = (r[reaction] || 0) + 1;
  io.emit('updateReaction', { messageId, reactions: r });
  res.json({ ok: true });
});

// 管理者削除
app.post('/api/pass', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ message: 'パスワード違い' });

  messages = [];
  io.emit('clearMessages');
  res.json({ message: '削除しました' });
});

// ユーザー数
app.get('/user', (req, res) => {
  res.json({ userCount: onlineUsers.size });
});

// ----------------- Socket.IO -----------------
io.on('connection', socket => {
  onlineUsers.add(socket.id);
  io.emit('userCount', onlineUsers.size);

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    io.emit('userCount', onlineUsers.size);
  });
});

// ----------------- Render無料枠キープ -----------------
setInterval(() => {
  fetch(`http://localhost:${PORT}/`).catch(() => {});
}, 4 * 60 * 1000);

httpServer.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
