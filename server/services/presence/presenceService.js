import redis from '../../config/redis.js';
import User from '../../models/User.js';

const PRESENCE_TTL = 300; // 5 minutes
const TYPING_TTL = 3; // 3 seconds

/**
 * Set user as online in Redis.
 */
export async function setOnline(userId) {
    await redis.set(`presence:${userId}`, 'online', 'EX', PRESENCE_TTL);
}

/**
 * Set user as offline + update lastSeen.
 */
export async function setOffline(userId) {
    const now = new Date().toISOString();
    await redis.del(`presence:${userId}`);
    await redis.set(`lastseen:${userId}`, now);
    // Fire-and-forget: persist to MongoDB
    User.updateOne({ _id: userId }, { lastSeen: new Date(now) }).catch(() => { });
}

/**
 * Refresh presence TTL (heartbeat).
 */
export async function refreshPresence(userId) {
    await redis.expire(`presence:${userId}`, PRESENCE_TTL);
}

/**
 * Check if user is online.
 */
export async function isOnline(userId) {
    const val = await redis.get(`presence:${userId}`);
    return val === 'online';
}

/**
 * Get last seen time for a user.
 */
export async function getLastSeen(userId) {
    const cached = await redis.get(`lastseen:${userId}`);
    if (cached) return cached;
    const user = await User.findById(userId).select('lastSeen').lean();
    return user?.lastSeen?.toISOString() || null;
}

/**
 * Set typing indicator.
 */
export async function setTyping(chatId, userId) {
    await redis.sadd(`typing:${chatId}`, userId);
    await redis.expire(`typing:${chatId}`, TYPING_TTL);
}

/**
 * Clear typing indicator.
 */
export async function clearTyping(chatId, userId) {
    await redis.srem(`typing:${chatId}`, userId);
}

/**
 * Get all users currently typing in a chat.
 */
export async function getTypingUsers(chatId) {
    return redis.smembers(`typing:${chatId}`);
}

/**
 * Register presence socket handlers.
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export function registerPresenceHandlers(io, socket) {
    const userId = String(socket.userId);

    // Set online on connect
    setOnline(userId);

    // Heartbeat — client should emit this every ~60s
    socket.on('presence:heartbeat', () => {
        refreshPresence(userId);
    });

    // Typing indicators
    socket.on('typing:start', ({ conversationId }) => {
        if (!conversationId) return;
        setTyping(conversationId, userId);
        socket.to(`conversation:${conversationId}`).emit('typing:update', {
            conversationId,
            userId,
            isTyping: true,
        });
    });

    socket.on('typing:stop', ({ conversationId }) => {
        if (!conversationId) return;
        clearTyping(conversationId, userId);
        socket.to(`conversation:${conversationId}`).emit('typing:update', {
            conversationId,
            userId,
            isTyping: false,
        });
    });
}
