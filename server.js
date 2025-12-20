import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import bodyParser from 'body-parser';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(bodyParser.json());

const messages = [];
const MAX_MESSAGE_LEN = 800;
const MAX_USERNAME_LEN = 24;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

function isValidMessage(msg) {
  return msg && typeof msg === 'string' && msg.trim().length > 0 && msg.length <= MAX_MESSAGE_LEN;
}

function isValidUsername(name) {
  return name && typeof name === 'string' && name.trim().length > 0 && name.length <= MAX_USERNAME_LEN;
}

app.post('/api/messages', (req, res) => {
  const { username, message } = req.body;
  if (!isValidUsername(username)) return res.status(400).json({ error: `ユーザー名は1〜${MAX_USERNAME_LEN}文字で入力してください` });
  if (!isValidMessage(message)) return res.status(400).json({ error: `メッセージは1〜${MAX_MESSAGE_LEN}文字で入力してください` });

  const msgObj = {
    id: messages.length,
    username: username.trim(),
    message: message.trim(),
    time: new Date().toISOString(),
    reactions: {}
  };

  messages.push(msgObj);
  io.emit('newMessage', msgObj);
  res.json({ success: true, message: msgObj });
});

app.get('/api/messages', (req, res) => {
  res.json(messages);
});

app.post('/api/clear', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: '管理者パスワードが間違っています' });
  messages.length = 0;
  io.emit('clearMessages');
  res.json({ success: true, message: '全メッセージを削除しました' });
});

io.on('connection', socket => {
  io.emit('userCount', { userCount: io.engine.clientsCount });

  socket.on('updateReaction', ({ messageId, reaction }) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    msg.reactions[reaction] = (msg.reactions[reaction] || 0) + 1;
    io.emit('updateReaction', { messageId, reactions: msg.reactions });
  });

  socket.on('disconnect', () => {
    io.emit('userCount', { userCount: io.engine.clientsCount });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT);
