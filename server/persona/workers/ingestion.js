// Ingestion worker (port of feature/Persona_chat/server/workers/ingestion-worker.ts).
// BullMQ worker on the "chat-ingestion" queue. One export at a time to respect
// Gemini free-tier rate limits.
//
// Steps: filter to persona-side messages → chunk by 30-min gaps → embed each
// chunk (Gemini) → upsert to Qdrant → generate voice + person profile → seed
// MemoryFacts → mark ChatExport "ready". Any error marks it "failed".
import { Worker } from 'bullmq';
import { randomUUID } from 'crypto';
import { getEmbedding, generateVoiceProfile, generatePersonProfile } from '../lib/gemini.js';
import { ensureCollectionExists, upsertVectors } from '../lib/qdrant.js';
import { PERSONA_INGESTION_QUEUE } from '../constants.js';
import ChatExport from '../models/ChatExport.js';
import Persona from '../models/Persona.js';
import MemoryFact from '../models/MemoryFact.js';

const GAP_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const VOICE_SAMPLE_MAX = 100;
const EMBED_INTER_CHUNK_DELAY_MS = 200;
// Bound a single chunk so one embedding input never exceeds the Gemini model's
// 8k-token input window (long WhatsApp groups can span hours in one gap-free run).
const MAX_CHUNK_MESSAGES = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Keep only persona-side messages: those whose speaker matches the persona name
// (case-insensitive). Fall back to excluding "you"/"me" if nothing matches.
function filterToPersonaSide(messages, personaName) {
    const nameLower = personaName.toLowerCase();
    const USER_LABELS = new Set(['you', 'me']);
    const byName = messages.filter((m) => m.speaker.toLowerCase() === nameLower);
    if (byName.length > 0) return byName;
    // eslint-disable-next-line no-console
    console.warn(
        `[ingestion] No messages matched persona "${personaName}". ` +
        `Falling back to excluding "you"/"me". Speakers: ${[...new Set(messages.map((m) => m.speaker))].join(', ')}`,
    );
    return messages.filter((m) => !USER_LABELS.has(m.speaker.toLowerCase()));
}

function chunkByTimeGap(messages) {
    if (messages.length === 0) return [];
    const sorted = [...messages].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const groups = [[sorted[0]]];
    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        if (curr.timestamp.getTime() - prev.timestamp.getTime() > GAP_THRESHOLD_MS) {
            groups.push([curr]);
        } else if (groups[groups.length - 1].length >= MAX_CHUNK_MESSAGES) {
            groups.push([curr]); // cap reached — start a new chunk even mid-run
        } else {
            groups[groups.length - 1].push(curr);
        }
    }
    return groups;
}

async function processIngestionJob(job) {
    const { personaId, exportId, personaOwnerName, userId } = job.data;

    // BullMQ JSON-serializes job data — rehydrate Date timestamps.
    const allMessages = job.data.messages.map((m) => ({
        ...m,
        timestamp: new Date(m.timestamp),
    }));

    const log = (msg) => console.log(`[ingestion] job=${job.id} ${msg}`);
    log(`Starting: persona=${personaId} export=${exportId} total=${allMessages.length}`);

    await ensureCollectionExists();

    await ChatExport.findByIdAndUpdate(exportId, { status: 'parsing' });
    await job.updateProgress(5);

    const personaMsgs = filterToPersonaSide(allMessages, personaOwnerName);
    log(`Filtered to ${personaMsgs.length}/${allMessages.length} persona-side messages`);
    if (personaMsgs.length === 0) {
        throw new Error(
            `No persona-side messages found. Persona name: "${personaOwnerName}". ` +
            `Speakers: ${[...new Set(allMessages.map((m) => m.speaker))].join(', ')}`,
        );
    }
    await job.updateProgress(10);

    const groups = chunkByTimeGap(personaMsgs);
    log(`Segmented into ${groups.length} chunks`);

    await ChatExport.findByIdAndUpdate(exportId, { status: 'embedding' });
    const points = [];
    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const chunkText = group.map((m) => m.text).join('\n');
        const vector = await getEmbedding(chunkText);
        points.push({
            id: randomUUID(),
            vector,
            payload: { personaId, text: chunkText, timestamp: group[0].timestamp.getTime() },
        });
        if (points.length >= 50 || i === groups.length - 1) {
            await upsertVectors(points.splice(0, points.length));
        }
        await job.updateProgress(10 + Math.round((i / groups.length) * 70));
        log(`Embedded chunk ${i + 1}/${groups.length}`);
        if (i < groups.length - 1) await sleep(EMBED_INTER_CHUNK_DELAY_MS);
    }
    await job.updateProgress(80);

    // Voice + person profile from an evenly-spread sample of persona messages.
    const step = Math.max(1, Math.floor(personaMsgs.length / VOICE_SAMPLE_MAX));
    const sample = personaMsgs
        .filter((_, idx) => idx % step === 0)
        .slice(0, VOICE_SAMPLE_MAX)
        .map((m) => m.text);

    log(`Generating voice + person profile from ${sample.length} sample messages`);
    const [voiceProfile, personProfile] = await Promise.all([
        generateVoiceProfile(personaOwnerName, sample),
        generatePersonProfile(personaOwnerName, sample),
    ]);

    await Persona.findByIdAndUpdate(personaId, {
        voiceProfile,
        personProfile,
        sourceExportId: exportId,
    });

    const seedFacts = [
        ...personProfile.keyFacts,
        ...personProfile.preferences,
        ...personProfile.habits,
        ...personProfile.relationships,
    ];
    if (seedFacts.length > 0 && userId) {
        const writes = seedFacts.map((fact) => ({
            updateOne: {
                filter: { personaId, userId, fact, source: 'export' },
                update: { $setOnInsert: { personaId, userId, fact, source: 'export' } },
                upsert: true,
            },
        }));
        await MemoryFact.bulkWrite(writes, { ordered: false });
        log(`Seeded ${seedFacts.length} MemoryFacts (source=export)`);
    }

    await ChatExport.findByIdAndUpdate(exportId, {
        status: 'ready',
        messageCount: allMessages.length,
        ingestedAt: new Date(),
    });
    await job.updateProgress(100);
    log(`Done — ${groups.length} chunks from ${personaMsgs.length} messages`);
}

/**
 * @param {import('ioredis')} connection — a Redis connection (from createRedisConnection)
 */
export function createIngestionWorker(connection) {
    return new Worker(
        PERSONA_INGESTION_QUEUE,
        async (job) => {
            try {
                await processIngestionJob(job);
            } catch (err) {
                console.error(`[ingestion] job=${job.id} FAILED`, err);
                try {
                    await ChatExport.findByIdAndUpdate(job.data.exportId, {
                        status: 'failed',
                        error: err instanceof Error ? err.message : String(err),
                    });
                } catch { /* swallow */ }
                throw err;
            }
        },
        { connection, concurrency: 1, stalledInterval: 120000 },
    );
}
