import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
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

// Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/conversations', conversationRouter);
app.use('/api/messages', messageRouter(io));

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Chat server running' });
});

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


