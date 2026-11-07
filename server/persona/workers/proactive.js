// Proactive engine (port of feature/Persona_chat/server/workers/proactive-worker.ts).
// A single BullMQ repeatable "tick" job every 15 minutes. Each tick evaluates
// every persona with proactivity enabled: quiet-hours / daily-limit / cadence
// gates, then a structured Gemini judgment. On send it persists a PersonaMessage
// and publishes to the proactive Redis channel (the API fans out to the socket
// or Expo push). Every cycle writes a ProactiveEvent row (sent or skipped).
import { Worker, Queue } from 'bullmq';
import { createRedisConnection } from '../../config/redis.js';
import { judgeProactive } from '../lib/gemini.js';
import {
    PROACTIVE_REDIS_CHANNEL,
    PROACTIVE_TICK_JOB_ID,
    PERSONA_PROACTIVE_QUEUE,
} from '../constants.js';
import Persona from '../models/Persona.js';
import PersonaConversation from '../models/PersonaConversation.js';
import PersonaMessage from '../models/PersonaMessage.js';
import ProactiveEvent from '../models/ProactiveEvent.js';

const TICK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const HISTORY_WINDOW = 10;

function parseHHMM(s) {
    const [h, m] = s.split(':').map(Number);
    return { h, m };
}

// Is "now" inside the quiet-hours window? Handles cross-midnight windows.
export function inQuietHours(quiet, now = new Date()) {
    const s = parseHHMM(quiet.start);
    const e = parseHHMM(quiet.end);
    const cur = now.getHours() * 60 + now.getMinutes();
    const start = s.h * 60 + s.m;
    const end = e.h * 60 + e.m;
    if (start <= end) return cur >= start && cur < end;
    return cur >= start || cur < end;
}

export function countSentToday(personaId, now = new Date()) {
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    return ProactiveEvent.countDocuments({
        personaId,
        status: 'sent',
        scheduledFor: { $gte: midnight, $lte: now },
    });
}

function currentStatusLabel(now = new Date()) {
    const d = now;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${days[d.getDay()]} ${hh}:${mm}`;
}

// Publisher — the worker's own Redis connection so it stays decoupled from the API.
let proactivePublisher = null;
function getPublisher() {
    if (!proactivePublisher) {
        proactivePublisher = createRedisConnection();
    }
    return proactivePublisher;
}

async function runPersonaCycle(persona, publisher) {
    const cfg = persona.proactivityConfig;
    const now = new Date();

    // Gate 1: quiet hours
    if (inQuietHours(cfg.quietHours, now)) {
        await ProactiveEvent.create({
            personaId: persona._id,
            userId: persona.userId,
            scheduledFor: now,
            status: 'skipped',
            reason: `inside quiet hours (${cfg.quietHours.start}–${cfg.quietHours.end})`,
        });
        return;
    }

    // Gate 2: daily limit
    const sentToday = await countSentToday(persona._id.toString(), now);
    if (sentToday >= cfg.maxMessagesPerDay) {
        await ProactiveEvent.create({
            personaId: persona._id,
            userId: persona.userId,
            scheduledFor: now,
            status: 'skipped',
            reason: `daily limit reached (${sentToday}/${cfg.maxMessagesPerDay} sent today)`,
        });
        return;
    }

    // Gate 3: cadence
    const last = cfg.lastProactiveAt ? new Date(cfg.lastProactiveAt) : null;
    const dueAt = last ? new Date(last.getTime() + cfg.cadenceHours * 3600000) : null;
    if (dueAt && now < dueAt) return; // not due yet — next tick after due time fires

    // Advance lastProactiveAt now so a repeat tick before the cadence window doesn't re-judge.
    await Persona.updateOne({ _id: persona._id }, { 'proactivityConfig.lastProactiveAt': now });

    const conversation = await PersonaConversation.findOne({ personaId: persona._id, userId: persona.userId }).lean();
    let recentHistory = [];
    if (conversation) {
        const docs = await PersonaMessage.find({ conversationId: conversation._id })
            .sort({ createdAt: -1 })
            .limit(HISTORY_WINDOW)
            .lean();
        recentHistory = docs.reverse().map((m) => ({
            role: m.sender === 'user' ? 'user' : 'model',
            text: m.text,
        }));
    }

    const hoursSinceContact = conversation?.lastMessageAt
        ? Math.max(0, (now.getTime() - new Date(conversation.lastMessageAt).getTime()) / 3600000)
        : cfg.cadenceHours;

    const judgment = await judgeProactive({
        personaName: persona.name,
        relationship: persona.relationship,
        voiceSummary: persona.voiceProfile?.summary ?? '',
        recentHistory,
        hoursSinceContact,
        currentTimeLabel: currentStatusLabel(now),
    });

    if (judgment.should_send && judgment.message) {
        const conv =
            conversation ??
            (await PersonaConversation.create({ userId: persona.userId, personaId: persona._id, lastMessageAt: now }));
        const msg = await PersonaMessage.create({
            conversationId: conv._id,
            sender: 'persona',
            text: judgment.message,
        });
        await PersonaConversation.findByIdAndUpdate(conv._id, { lastMessageAt: now });
        await ProactiveEvent.create({
            personaId: persona._id,
            userId: persona.userId,
            scheduledFor: now,
            status: 'sent',
            reason: judgment.reason,
            draftMessage: judgment.message,
        });
        await publisher.publish(
            PROACTIVE_REDIS_CHANNEL,
            JSON.stringify({
                userId: persona.userId.toString(),
                personaId: persona._id.toString(),
                message: { _id: msg._id.toString(), sender: 'persona', text: judgment.message, createdAt: msg.createdAt },
            }),
        );
        // eslint-disable-next-line no-console
        console.log(`[proactive] ${persona.name} sent a proactive message (${judgment.reason})`);
    } else {
        await ProactiveEvent.create({
            personaId: persona._id,
            userId: persona.userId,
            scheduledFor: now,
            status: 'skipped',
            reason: judgment.reason,
        });
        // eslint-disable-next-line no-console
        console.log(`[proactive] ${persona.name} skipped: ${judgment.reason}`);
    }
}

/** Evaluate every enabled persona once. Exported for on-demand / test runs. */
export async function runProactiveTick() {
    const enabled = await Persona.find({ 'proactivityConfig.enabled': true }).lean();
    if (enabled.length === 0) return { enabled: 0, sent: [], skipped: [] };

    const publisher = getPublisher();
    const sent = [];
    const skipped = [];

    for (const p of enabled) {
        try {
            const doc = await Persona.findById(p._id);
            if (!doc) continue;
            const before = await ProactiveEvent.countDocuments({ personaId: p._id });
            await runPersonaCycle(doc, publisher);
            const after = await ProactiveEvent.countDocuments({ personaId: p._id });
            if (after > before) {
                const lastEvent = await ProactiveEvent.findOne({ personaId: p._id }).sort({ scheduledFor: -1 }).lean();
                if (lastEvent?.status === 'sent') sent.push(p.name);
                else skipped.push(p.name);
            }
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error(`[proactive] cycle error for ${p.name}:`, err.message);
        }
    }
    return { enabled: enabled.length, sent, skipped };
}

/**
 * @param {import('ioredis')} connection — a Redis connection
 */
export async function createProactiveWorker(connection) {
    const worker = new Worker(
        PERSONA_PROACTIVE_QUEUE,
        async (job) => {
            try {
                await runProactiveTick();
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error(`[proactive] tick ${job?.id} failed:`, err.message);
            }
        },
        { connection, concurrency: 1, stalledInterval: 120000 },
    );

    const queue = new Queue(PERSONA_PROACTIVE_QUEUE, { connection });

    // Idempotent repeatable scheduler.
    await queue.add(PROACTIVE_TICK_JOB_ID, {}, {
        repeat: { every: TICK_INTERVAL_MS },
        removeOnComplete: true,
        removeOnFail: true,
    });
    // Fire an initial tick soon after boot.
    await queue.add(PROACTIVE_TICK_JOB_ID, {}, { jobId: `${PROACTIVE_TICK_JOB_ID}-boot`, removeOnComplete: true });

    worker.on('ready', () =>
        // eslint-disable-next-line no-console
        console.log(`[proactive] listening on "${PERSONA_PROACTIVE_QUEUE}" (tick every ${TICK_INTERVAL_MS / 60000}m)`),
    );

    const stop = async () => {
        await worker.close();
        await queue.close();
        await getPublisher().quit().catch(() => {});
    };

    return { worker, queue, stop };
}
