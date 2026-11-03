import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null, // required by BullMQ
    retryStrategy(times) {
        const delay = Math.min(times * 200, 5000);
        return delay;
    },
    lazyConnect: false,
});

redis.on('connect', () => {
    // eslint-disable-next-line no-console
    console.log('[Redis] Connected');
});

redis.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[Redis] Error:', err.message);
});

/**
 * Create a duplicate connection for BullMQ / pub-sub.
 * BullMQ requires separate connections for workers.
 */
export function createRedisConnection() {
    return new Redis(REDIS_URL, {
        maxRetriesPerRequest: null,
        retryStrategy(times) {
            return Math.min(times * 200, 5000);
        },
    });
}

export default redis;
