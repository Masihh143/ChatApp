import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { Server as SocketIOServer } from 'socket.io';
import './config/db.js';
import './config/backupQueue.js'; // Initialize backup queue on startup
import authRouter from './routes/auth.js';
import conversationRouter from './routes/conversations.js';
import messageRouter from './routes/messages.js';
import usersRouter from './routes/users.js';
import { verifySocketToken } from './config/token.js';
import Conversation from './models/Conversation.js';

dotenv.config();

/* ─── Presence: "logged in = online". userId -> Set of socketIds; user is online while they have an active socket (app open, logged in). ─── */
const connectedUsers = new Map();

const app = express();
const server = http.createServer(app);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistDir = path.join(__dirname, '../client/vite-project/dist');

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

const io = new SocketIOServer(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/conversations', conversationRouter);
app.use('/api/messages', messageRouter(io));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Chat server running' });
});

// Serve frontend build in production if it exists
if (existsSync(clientDistDir)) {
  app.use(express.static(clientDistDir));

  // For any non-API route, return index.html (SPA)
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDistDir, 'index.html'));
  });
} else {
  // In dev (no build), simple root message
  app.get('/', (req, res) => {
    res.json({
      message:
        'Chat API running. In development, run Vite dev server at http://localhost:5173',
      api: '/api'
    });
  });
}

// Socket.io
io.use(verifySocketToken);

// Online = user has at least one active socket (logged in, app open). No need for them to be in any conversation.
function isUserOnline(userId) {
  const set = connectedUsers.get(String(userId));
  return set != null && set.size > 0;
}

io.on('connection', (socket) => {
  const userId = String(socket.userId);
  socket.join(userId);
  if (!connectedUsers.has(userId)) connectedUsers.set(userId, new Set());
  connectedUsers.get(userId).add(socket.id);
  // User is now "logged in" (online). Notify their conversation rooms so others see them online.
  Conversation.find({ participants: userId }, '_id participants')
    .then((convos) => {
      socket.conversationIds = convos.map((c) => c._id.toString());
      convos.forEach((c) => socket.join(`conversation:${c._id}`));
      convos.forEach((c) => {
        io.to(`conversation:${c._id}`).emit('presence:update', { userId, online: true });
      });
    })
    .catch(() => {});

  socket.on('conversation:join', (conversationId) => {
    const cid = String(conversationId);
    socket.join(`conversation:${cid}`);
    // Send who is online in this conversation: anyone logged in (has socket), regardless of whether they have this chat open.
    Conversation.findById(cid)
      .select('participants')
      .then((convo) => {
        if (!convo) return;
        const participantIds = convo.participants.map((p) => p.toString());
        const onlineUserIds = participantIds.filter((id) => isUserOnline(id));
        socket.emit('presence', { conversationId: cid, onlineUserIds });
      })
      .catch(() => {});
  });

  socket.on('disconnect', () => {
    connectedUsers.get(userId)?.delete(socket.id);
    if (connectedUsers.get(userId)?.size === 0) {
      connectedUsers.delete(userId);
      // User is now offline (logged out or closed app). Notify their conversation rooms.
      const cids = socket.conversationIds || [];
      cids.forEach((cid) => {
        io.to(`conversation:${cid}`).emit('presence:update', { userId, online: false });
      });
    }
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${PORT}`);
});


