import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Cap retries so an over-quota / unreachable Redis does not churn forever —
// after ~20 fast attempts we stop reconnecting (returning null stops retries).
// `maxRetriesPerRequest: null` is still required by BullMQ.
function baseOptions() {
    return {
        maxRetriesPerRequest: null, // required by BullMQ
        retryStrategy(times) {
            return times > 20 ? null : Math.min(times * 200, 5000);
        },
    };
}

/**
 * Attach a crash-safe error handler to a raw ioredis instance.
 *
 * Without this, the first unhandled 'error' event (e.g. Upstash's
 * "max requests limit exceeded" or a dropped connection) crashes the whole
 * Node process. We log but do NOT throw, and we throttle the message so a
 * saturated / over-quota Redis that re-raises the error on every retry does
 * not flood the console.
 */
function attachGuard(client, label) {
    let lastLog = 0;
    client.on('error', (err) => {
        const now = Date.now();
        if (now - lastLog > 15000) {
            // eslint-disable-next-line no-console
            console.warn(`[Redis:${label}] ${err.message}`);
            lastLog = now;
        }
    });
    client.on('end', () => {
        // eslint-disable-next-line no-console
        console.warn(`[Redis:${label}] connection ended — degraded to no-Redis mode`);
    });
    return client;
}

const redis = attachGuard(new Redis(REDIS_URL, baseOptions()), 'default');

redis.on('connect', () => {
    // eslint-disable-next-line no-console
    console.log('[Redis] Connected');
});

/**
 * Create a duplicate connection for BullMQ / pub-sub.
 * BullMQ requires separate connections for workers.
 *
 * Every caller in this app creates its own instance via this helper, so all of
 * them get a guarded (crash-safe) error handler. When Redis is unavailable the
 * dependent features degrade gracefully; the core chat app keeps running.
 */
export function createRedisConnection() {
    return attachGuard(new Redis(REDIS_URL, baseOptions()), 'pool');
}

export default redis;
