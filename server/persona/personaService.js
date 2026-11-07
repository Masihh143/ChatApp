// Persona socket handlers + proactive fan-out (port of the socket logic in
// feature/Persona_chat/server/api/src/index.ts → this main Express stack).
//
// registerPersonaHandlers(io) is called once per socket connection from
// server/index.js, alongside the existing presence/RTC handlers. It listens for
// persona:message:send and streams a Gemini reply back over the SAME socket
// (the main app's token auth already runs in index.js via verifySocketToken,
// so socket.userId is populated).
//
// startPersonaWorkers() boots the BullMQ ingestion + proactive workers.
// subscribeProactiveFanout() wires proactive messages published by the worker
// to the connected socket (or Expo push if none).
import {
    streamPersonaReply,
    getEmbedding,
    extractMemoryFacts,
} from './lib/gemini.js';
import { searchVectors } from './lib/qdrant.js';
import { sendPush } from './lib/push.js';
import {
    SOCKET_EVENTS,
    RAG_TOP_K,
    MEMORY_TOP_N,
    PROACTIVE_REDIS_CHANNEL,
} from './constants.js';
import { createRedisConnection } from '../config/redis.js';
import Persona from './models/Persona.js';
import PersonaConversation from './models/PersonaConversation.js';
import PersonaMessage from './models/PersonaMessage.js';
import MemoryFact from './models/MemoryFact.js';
import User from '../models/User.js';
import { createIngestionWorker } from './workers/ingestion.js';
import { createProactiveWorker } from './workers/proactive.js';

/* ── One-time worker startup ─────────────────────────────────────────────── */
let workersStarted = false;
export function startPersonaWorkers() {
    if (workersStarted) return;
    workersStarted = true;
    const workerConnection = createRedisConnection();
    createIngestionWorker(workerConnection);
    createProactiveWorker(workerConnection).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[persona] proactive worker failed to start:', err?.message);
    });
}

/* ── Proactive fan-out: subscribe to the channel the worker publishes on ── */
let fanoutStarted = false;
export async function subscribeProactiveFanout(io) {
    if (fanoutStarted) return;
    fanoutStarted = true;

    // Track which sockets belong to which user so a proactive message reaches
    // the right device; if none, fall back to Expo push.
    const userSockets = new Map();
    io._personaUserSockets = userSockets;

    const deliverProactive = async (msg) => {
        const sockets = userSockets.get(msg.userId);
        if (sockets && sockets.size > 0) {
            const payload = { personaId: msg.personaId, message: msg.message };
            for (const socketId of sockets) {
                const target = io.sockets.sockets.get(socketId);
                target?.emit(SOCKET_EVENTS.PERSONA_MESSAGE_PROACTIVE, payload);
            }
            return;
        }
        const user = await User.findById(msg.userId).lean();
        if (user?.pushToken) {
            const result = await sendPush(user.pushToken, {
                user: 'New message',
                text: msg.message.text,
                deepLink: `/persona/chat/${msg.personaId}`,
            });
            // eslint-disable-next-line no-console
            console.log(`[persona:proactive] push to user ${msg.userId}: ${result}`);
        }
    };

    const pubSub = createRedisConnection();
    pubSub.subscribe(PROACTIVE_REDIS_CHANNEL, (err) => {
        if (err) console.warn('[persona:proactive] subscribe error:', err.message);
    });
    pubSub.on('message', (channel, raw) => {
        if (channel !== PROACTIVE_REDIS_CHANNEL) return;
        try {
            void deliverProactive(JSON.parse(raw));
        } catch (err) {
            console.warn('[persona:proactive] malformed channel message:', err.message);
        }
    });
}

/* ── Per-socket handlers ─────────────────────────────────────────────────── */
export function registerPersonaHandlers(io, socket) {
    const userId = String(socket.userId);

    // Register this socket for proactive delivery.
    const userSockets = io._personaUserSockets;
    if (userSockets) {
        let set = userSockets.get(userId);
        if (!set) {
            set = new Set();
            userSockets.set(userId, set);
        }
        set.add(socket.id);
    }

    socket.on(SOCKET_EVENTS.PERSONA_MESSAGE_SEND, async (payload) => {
        const personaId = payload?.personaId;
        const text = payload?.text;
        if (!personaId || !text) {
            socket.emit(SOCKET_EVENTS.PERSONA_MESSAGE_ERROR, { error: 'Invalid payload' });
            return;
        }

        try {
            const persona = await Persona.findOne({ _id: personaId, userId }).lean();
            if (!persona) {
                socket.emit(SOCKET_EVENTS.PERSONA_MESSAGE_ERROR, { error: 'Persona not found' });
                return;
            }

            const conversation = await PersonaConversation.findOneAndUpdate(
                { userId, personaId },
                { $setOnInsert: { userId, personaId } },
                { upsert: true, new: true, setDefaultsOnInsert: true },
            );

            await PersonaMessage.create({ conversationId: conversation._id, sender: 'user', text });

            // Recent history for Gemini context (exclude the message just created).
            const recentDocs = await PersonaMessage.find({ conversationId: conversation._id })
                .sort({ createdAt: -1 })
                .limit(21)
                .lean();
            const history = recentDocs
                .reverse()
                .slice(0, -1)
                .map((m) => ({ role: m.sender === 'user' ? 'user' : 'model', text: m.text }));

            // RAG: embed the user message, pull relevant past chunks + recent facts.
            let ctx = { voiceProfile: persona.voiceProfile, personProfile: persona.personProfile };
            try {
                const [queryVector, recentFacts] = await Promise.all([
                    getEmbedding(text),
                    MemoryFact.find({ personaId: persona._id })
                        .sort({ createdAt: -1 })
                        .limit(MEMORY_TOP_N)
                        .lean()
                        .then((docs) => docs.map((d) => d.fact)),
                ]);
                ctx = { ...ctx, memoryFacts: recentFacts };
                const retrieved = await searchVectors(personaId, queryVector, RAG_TOP_K);
                if (retrieved.length) ctx.retrieved = retrieved.map((r) => ({ text: r.text }));
            } catch (err) {
                // eslint-disable-next-line no-console
                console.warn('[persona] RAG retrieval skipped:', err.message);
            }

            socket.emit(SOCKET_EVENTS.PERSONA_TYPING_START);

            const fullText = await streamPersonaReply(
                persona.name,
                persona.relationship,
                history,
                text,
                (chunk) => socket.emit(SOCKET_EVENTS.PERSONA_MESSAGE_CHUNK, { chunk, personaId }),
                ctx,
            );

            const personaMsg = await PersonaMessage.create({
                conversationId: conversation._id,
                sender: 'persona',
                text: fullText,
            });

            // Background memory extraction — must never break the reply.
            void (async () => {
                try {
                    const recentWindow = [
                        ...history,
                        { role: 'user', text },
                        { role: 'model', text: fullText },
                    ];
                    const newFacts = await extractMemoryFacts(
                        persona.name,
                        ctx.memoryFacts ?? [],
                        recentWindow,
                    );
                    if (newFacts.length > 0) {
                        const writes = newFacts.map((fact) => ({
                            updateOne: {
                                filter: { personaId: persona._id, userId, fact },
                                update: { $setOnInsert: { personaId: persona._id, userId, fact, source: 'conversation' } },
                                upsert: true,
                            },
                        }));
                        await MemoryFact.bulkWrite(writes, { ordered: false });
                    }
                } catch (err) {
                    // eslint-disable-next-line no-console
                    console.warn('[persona] memory extraction skipped:', err.message);
                }
            })();

            await PersonaConversation.findByIdAndUpdate(conversation._id, { lastMessageAt: new Date() });

            socket.emit(SOCKET_EVENTS.PERSONA_MESSAGE_COMPLETE, {
                message: { _id: personaMsg._id.toString(), sender: 'persona', text: fullText, createdAt: personaMsg.createdAt },
            });
            socket.emit(SOCKET_EVENTS.PERSONA_TYPING_STOP);
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[persona] message:send error', err);
            socket.emit(SOCKET_EVENTS.PERSONA_MESSAGE_ERROR, { error: 'Failed to generate response' });
            socket.emit(SOCKET_EVENTS.PERSONA_TYPING_STOP);
        }
    });

    socket.on('disconnect', () => {
        userSockets?.get(userId)?.delete(socket.id);
        if (userSockets?.get(userId)?.size === 0) userSockets?.delete(userId);
    });
}
