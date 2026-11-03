import { Queue, Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';

/**
 * Event Bus — BullMQ queues for async event processing.
 * Each event type gets its own queue for independent scaling.
 */

const connection = createRedisConnection();

/* ── Queues ── */
export const messageQueue = new Queue('message-events', { connection });
export const notificationQueue = new Queue('notification-events', { connection });
export const presenceQueue = new Queue('presence-events', { connection });

/**
 * Emit an event to the appropriate queue.
 * @param {'message.sent'|'message.delivered'|'message.read'|'notification.push'|'user.online'|'user.offline'} event
 * @param {object} data
 */
export async function emitEvent(event, data) {
    const queueMap = {
        'message.sent': messageQueue,
        'message.delivered': messageQueue,
        'message.read': messageQueue,
        'notification.push': notificationQueue,
        'user.online': presenceQueue,
        'user.offline': presenceQueue,
    };

    const queue = queueMap[event];
    if (!queue) {
        // eslint-disable-next-line no-console
        console.warn(`[EventBus] Unknown event: ${event}`);
        return;
    }

    await queue.add(event, { event, ...data }, {
        removeOnComplete: 100,
        removeOnFail: 50,
    });
}

/**
 * Start workers that process events. Call this on server startup.
 * @param {import('socket.io').Server} io — Socket.IO server instance
 */
export function startEventWorkers(io) {
    const workerConnection = createRedisConnection();

    /* ── Message events worker ── */
    const messageWorker = new Worker(
        'message-events',
        async (job) => {
            const { event, messageId, conversationId, senderId, recipientIds } = job.data;

            switch (event) {
                case 'message.sent': {
                    // Notify recipients who are online
                    if (recipientIds) {
                        for (const rid of recipientIds) {
                            io.to(rid).emit('notification:new', {
                                type: 'new_message',
                                conversationId,
                                senderId,
                                messageId,
                            });
                        }
                    }
                    break;
                }
                case 'message.delivered': {
                    // Notify the sender
                    if (senderId) {
                        io.to(senderId).emit('message:status', {
                            messageId,
                            conversationId,
                            status: 'delivered',
                        });
                    }
                    break;
                }
                case 'message.read': {
                    if (senderId) {
                        io.to(senderId).emit('message:status', {
                            messageId,
                            conversationId,
                            status: 'read',
                        });
                    }
                    break;
                }
            }
        },
        { connection: workerConnection }
    );

    /* ── Notification events worker ── */
    const notificationWorker = new Worker(
        'notification-events',
        async (job) => {
            const { event, userId, data } = job.data;
            // Push notification stub — in production, integrate with Firebase/APNs
            if (event === 'notification.push') {
                io.to(userId).emit('notification:new', data);
            }
        },
        { connection: createRedisConnection() }
    );

    /* ── Presence events worker ── */
    const presenceWorker = new Worker(
        'presence-events',
        async (job) => {
            // Presence events are handled directly via socket — this is for logging/analytics
        },
        { connection: createRedisConnection() }
    );

    messageWorker.on('failed', (job, err) => {
        // eslint-disable-next-line no-console
        console.error(`[EventBus] message-events job failed:`, err.message);
    });

    notificationWorker.on('failed', (job, err) => {
        // eslint-disable-next-line no-console
        console.error(`[EventBus] notification-events job failed:`, err.message);
    });

    // eslint-disable-next-line no-console
    console.log('[EventBus] Workers started');

    return { messageWorker, notificationWorker, presenceWorker };
}
