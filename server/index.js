import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import './config/db.js';
import './config/backupQueue.js';
import redis, { createRedisConnection } from './config/redis.js';
import authRouter from './routes/auth.js';
import conversationRouter from './routes/conversations.js';
import messageRouter from './routes/messages.js';
import usersRouter from './routes/users.js';
import { verifySocketToken } from './config/token.js';
import { rateLimitAPI } from './middleware/rateLimiter.js';
import { startEventWorkers } from './events/eventBus.js';
import {
  registerPresenceHandlers,
  setOnline,
  setOffline,
  isOnline,
  getLastSeen,
} from './services/presence/presenceService.js';
import { registerRTCHandlers } from './services/rtc/rtcService.js';
import Conversation from './models/Conversation.js';
import personaRouter from './persona/routes.js';
import {
  registerPersonaHandlers,
  startPersonaWorkers,
  subscribeProactiveFanout,
} from './persona/personaService.js';

dotenv.config();

/* ── Process-level safety nets ─────────────────────────────────────────────
   Redis (and other external services) are an *optional* accelerator for this
   chat app. When they misbehave — an Upstash free-tier DB past its request
   cap, a dropped connection, a missing Qdrant/Gemini key — they throw
   unhandled promise rejections (e.g. BullMQ's internal `auth`) that would
   otherwise take the whole Node process down. The core chat app should keep
   running without them, so log-and-continue instead of crashing. */
process.on('unhandledRejection', (err) => {
  // eslint-disable-next-line no-console
  console.error('[unhandledRejection]', err && err.stack ? err.stack : err);
});
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[uncaughtException]', err && err.stack ? err.stack : err);
});

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

/* ── Socket.IO Redis Adapter for horizontal scaling ── */
try {
  const pubClient = createRedisConnection();
  const subClient = pubClient.duplicate();
  // duplicate() drops event listeners — guard the sub client too so a dead /
  // over-quota Redis can't crash the process through an unhandled 'error'.
  subClient.on('error', () => {});
  io.adapter(createAdapter(pubClient, subClient));
  // eslint-disable-next-line no-console
  console.log('[Socket.IO] Redis adapter attached');
} catch (err) {
  // eslint-disable-next-line no-console
  console.warn('[Socket.IO] Redis adapter failed, using in-memory:', err.message);
}

/* ── Start BullMQ event workers ── */
startEventWorkers(io);

/* ── Start persona-bot workers (ingestion + proactive) ── */
// Guarded: a missing persona dependency (Redis/Qdrant/Gemini) must not take
// down the core chat app.
try {
  startPersonaWorkers();
} catch (err) {
  // eslint-disable-next-line no-console
  console.warn('[Persona] workers not started:', err.message);
}
subscribeProactiveFanout(io).catch((err) => {
  // eslint-disable-next-line no-console
  console.warn('[Persona] proactive fan-out not started:', err.message);
});

// Middleware
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(rateLimitAPI);

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/conversations', conversationRouter);
app.use('/api/messages', messageRouter(io));
app.use('/api/persona', personaRouter());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Chat server running', services: ['auth', 'messaging', 'media', 'presence', 'notification', 'rtc'] });
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

io.on('connection', (socket) => {
  const userId = String(socket.userId);
  socket.join(userId);

  // Register presence handlers (online, heartbeat, typing)
  registerPresenceHandlers(io, socket);

  // Register WebRTC signaling handlers
  registerRTCHandlers(io, socket);

  // Register persona-bot handlers (streaming Gemini replies + proactive fan-out)
  registerPersonaHandlers(io, socket);

  // Join all user's conversation rooms + notify others
  Conversation.find({ participants: userId }, '_id participants')
    .then((convos) => {
      socket.conversationIds = convos.map((c) => c._id.toString());
      convos.forEach((c) => socket.join(`conversation:${c._id}`));
      convos.forEach((c) => {
        io.to(`conversation:${c._id}`).emit('presence:update', { userId, online: true });
      });
    })
    .catch(() => { });

  socket.on('conversation:join', async (conversationId) => {
    const cid = String(conversationId);
    socket.join(`conversation:${cid}`);
    // Send who is online in this conversation
    try {
      const convo = await Conversation.findById(cid).select('participants').lean();
      if (!convo) return;
      const participantIds = convo.participants.map((p) => p.toString());
      const onlineChecks = await Promise.all(
        participantIds.map(async (id) => ({
          id,
          online: await isOnline(id),
        }))
      );
      const onlineUserIds = onlineChecks.filter((u) => u.online).map((u) => u.id);

      // Also get lastSeen for offline users
      const lastSeenData = {};
      for (const p of onlineChecks) {
        if (!p.online) {
          lastSeenData[p.id] = await getLastSeen(p.id);
        }
      }

      socket.emit('presence', { conversationId: cid, onlineUserIds, lastSeenData });
    } catch (err) {
      // ignore
    }
  });

  socket.on('disconnect', () => {
    setOffline(userId);
    const cids = socket.conversationIds || [];
    cids.forEach((cid) => {
      io.to(`conversation:${cid}`).emit('presence:update', { userId, online: false });
    });
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${PORT}`);
});
