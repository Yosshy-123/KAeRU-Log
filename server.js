import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

let messages = [];
let nextId = 1;

io.on('connection', socket=>{
  socket.emit('messages', messages);

  socket.on('message', data=>{
    const msg = { id: nextId++, ...data };
    messages.push(msg);
    io.emit('message', msg);
  });

  socket.on('deleteMessage', id=>{
    messages = messages.filter(m=>m.id!==id);
    io.emit('deleteMessage', id);
  });
});

server.listen(process.env.PORT || 3000);
