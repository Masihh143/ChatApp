import { RateLimiterRedis } from 'rate-limiter-flexible';
import redis from '../config/redis.js';

/**
 * Rate limiters — Redis-backed sliding window.
 */

// Messages: 30 per minute per user
const messageLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rl:msg',
    points: 30,
    duration: 60,
});

// API requests: 100 per minute per IP
const apiLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rl:api',
    points: 100,
    duration: 60,
});

// Auth attempts: 5 per minute per IP
const authLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rl:auth',
    points: 5,
    duration: 60,
});

/**
 * Express middleware — rate limit per user (uses req.userId).
 */
export function rateLimitMessages(req, res, next) {
    const key = req.userId || req.ip;
    messageLimiter
        .consume(key)
        .then(() => next())
        .catch((rej) => {
            const retryAfter = Math.ceil(rej.msBeforeNext / 1000);
            res.set('Retry-After', String(retryAfter));
            res.status(429).json({
                message: 'Too many messages. Please slow down.',
                retryAfter,
            });
        });
}

/**
 * Express middleware — rate limit per IP for general API.
 */
export function rateLimitAPI(req, res, next) {
    apiLimiter
        .consume(req.ip)
        .then(() => next())
        .catch((rej) => {
            const retryAfter = Math.ceil(rej.msBeforeNext / 1000);
            res.set('Retry-After', String(retryAfter));
            res.status(429).json({
                message: 'Too many requests. Please try again later.',
                retryAfter,
            });
        });
}

/**
 * Express middleware — rate limit auth attempts per IP.
 */
export function rateLimitAuth(req, res, next) {
    authLimiter
        .consume(req.ip)
        .then(() => next())
        .catch((rej) => {
            const retryAfter = Math.ceil(rej.msBeforeNext / 1000);
            res.set('Retry-After', String(retryAfter));
            res.status(429).json({
                message: 'Too many attempts. Please wait before trying again.',
                retryAfter,
            });
        });
}
