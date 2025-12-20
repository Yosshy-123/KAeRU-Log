import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

let messages = [];
let clients = {};

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin_1234";

app.get("/api/messages", (req, res) => {
  res.json(messages);
});

app.post("/api/setname", (req, res) => {
  const { clientId, name } = req.body;
  if (!clientId || !name || name.length < 1 || name.length > 24) return res.status(400).json({ error: "Invalid name" });
  if (!clients[clientId]) clients[clientId] = {};
  clients[clientId].name = name;
  res.json({ ok: true });
});

app.post("/api/admin/login", (req, res) => {
  const { password, clientId } = req.body;
  if (!clientId || !password) return res.status(400).json({ error: "Missing fields" });
  if (password === ADMIN_PASSWORD) {
    if (!clients[clientId]) clients[clientId] = {};
    clients[clientId].isAdmin = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: "Unauthorized" });
});

app.post("/api/messages", (req, res) => {
  const { clientId, message } = req.body;
  if (!clientId || !message || !clients[clientId]?.name) return res.status(400).json({ error: "Invalid" });
  const msg = {
    id: uuidv4(),
    username: clients[clientId].name,
    message,
    time: new Date().toISOString(),
    reactions: {}
  };
  messages.push(msg);
  io.emit("newMessage", msg);
  res.json({ ok: true });
});

app.post("/api/messages/delete", (req, res) => {
  const { clientId, messageId } = req.body;
  if (!clientId || !messageId) return res.status(400).json({ error: "Invalid" });
  if (!clients[clientId]?.isAdmin) return res.status(403).json({ error: "Unauthorized" });
  messages = messages.filter(m => m.id !== messageId);
  io.emit("deleteMessage", messageId);
  res.json({ ok: true });
});

app.post("/api/messages/clear", (req, res) => {
  const { clientId } = req.body;
  if (!clientId) return res.status(400).json({ error: "Invalid" });
  if (!clients[clientId]?.isAdmin) return res.status(403).json({ error: "Unauthorized" });
  messages = [];
  io.emit("clearMessages");
  res.json({ ok: true });
});

io.on("connection", socket => {
  const clientId = uuidv4();
  clients[clientId] = { socket };
  socket.emit("clientId", clientId);
  io.emit("userCount", Object.keys(clients).length);

  socket.on("disconnect", () => {
    delete clients[clientId];
    io.emit("userCount", Object.keys(clients).length);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
