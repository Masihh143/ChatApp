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
import authRouter from './routes/auth.js';
import conversationRouter from './routes/conversations.js';
import messageRouter from './routes/messages.js';
import usersRouter from './routes/users.js';
import { verifySocketToken } from './config/token.js';

dotenv.config();

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

io.on('connection', (socket) => {
  const userId = socket.userId;

  socket.join(String(userId));

  socket.on('conversation:join', (conversationId) => {
    socket.join(`conversation:${conversationId}`);
  });

  socket.on('disconnect', () => {});
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${PORT}`);
});


