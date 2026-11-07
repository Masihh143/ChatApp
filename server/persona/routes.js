// Persona + persona-conversation REST routes (port of feature/Persona_chat's
// personas.ts + conversations.ts Fastify routes → Express). Mounted at /api/persona.
//
//   POST   /api/persona                        create a persona
//   GET    /api/persona                        list my personas
//   GET    /api/persona/:id                    single persona
//   DELETE /api/persona/:id                    delete a persona + everything under it (cascade)
//   PATCH  /api/persona/:id/proactivity        toggle / tune the proactive engine
//   GET    /api/persona/:id/proactive-events   recent proactive decisions
//   POST   /api/persona/:id/export             upload a chat export (multipart)
//   GET    /api/persona/:id/export/status      poll ingestion status
//   POST   /api/persona/conversations/:personaId          get-or-create conversation
//   GET    /api/persona/conversations/:personaId/messages history
//
// Auth: reuses the main app's JWT (verifyHttpToken sets req.userId).
import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import { verifyHttpToken } from '../config/token.js';
import Persona from './models/Persona.js';
import ChatExport from './models/ChatExport.js';
import PersonaConversation from './models/PersonaConversation.js';
import PersonaMessage from './models/PersonaMessage.js';
import MemoryFact from './models/MemoryFact.js';
import ProactiveEvent from './models/ProactiveEvent.js';
import { parseExport } from './lib/export-parser.js';
import { deleteVectorsForPersona } from './lib/qdrant.js';
import { PERSONA_INGESTION_QUEUE } from './constants.js';

const upload = multer({ dest: 'uploads/' });

// One ingestion Queue shared across requests (re-uses a single Redis connection).
const ingestionQueue = new Queue(PERSONA_INGESTION_QUEUE, {
    connection: createRedisConnection(),
});

/** Build a $set with only the keys the caller provided, so PATCHing one field
 *  never clobbers the others. */
function mapProactivityUpdate(input = {}) {
    const out = {};
    if (input.enabled !== undefined) out['proactivityConfig.enabled'] = input.enabled;
    if (input.cadenceHours !== undefined) out['proactivityConfig.cadenceHours'] = input.cadenceHours;
    if (input.maxMessagesPerDay !== undefined) out['proactivityConfig.maxMessagesPerDay'] = input.maxMessagesPerDay;
    if (input.quietHours !== undefined) out['proactivityConfig.quietHours'] = input.quietHours;
    return out;
}

export default function personaRouter() {
    const router = express.Router();
    router.use(verifyHttpToken);

    // ── POST /api/persona ──
    router.post('/', async (req, res) => {
        try {
            const { name, relationship, avatarUrl } = req.body;
            if (!name || !relationship) return res.status(400).json({ message: 'name and relationship required' });
            const persona = await Persona.create({
                userId: req.userId,
                name,
                relationship,
                avatarUrl: avatarUrl ?? null,
            });
            res.status(201).json(persona.toObject());
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // ── GET /api/persona ──
    router.get('/', async (req, res) => {
        try {
            const personas = await Persona.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
            res.json(personas);
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // ── GET /api/persona/:id ──
    router.get('/:id', async (req, res) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
            const persona = await Persona.findOne({ _id: req.params.id, userId: req.userId }).lean();
            if (!persona) return res.status(404).json({ message: 'Persona not found' });
            res.json(persona);
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // ── DELETE /api/persona/:id — cascade delete a persona + everything under it ──
    // Removes, in dependency order:
    //   PersonaConversation + PersonaMessage (its chat history)
    //   ChatExport records (its uploads)
    //   MemoryFact (durable facts learned about it)
    //   ProactiveEvent (its proactive engine's audit trail)
    //   Qdrant vectors (ingested chunks) — best-effort, never blocks the delete
    //   Persona doc (last)
    // Scoped to req.userId so a token can only delete its own personas.
    router.delete('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

            const persona = await Persona.findOne({ _id: id, userId: req.userId }).lean();
            if (!persona) return res.status(404).json({ message: 'Persona not found' });

            // 1. Find the persona's conversation(s) so we can wipe their messages too.
            const conversations = await PersonaConversation.find({ personaId: id, userId: req.userId }).select('_id').lean();
            const convIds = conversations.map((c) => c._id);

            // 2. Remove Mongo children. (Messages via conversation; everything else via personaId.)
            if (convIds.length > 0) {
                await PersonaMessage.deleteMany({ conversationId: { $in: convIds } });
            }
            await PersonaConversation.deleteMany({ _id: { $in: convIds } });
            await ChatExport.deleteMany({ personaId: id });
            await MemoryFact.deleteMany({ personaId: id });
            await ProactiveEvent.deleteMany({ personaId: id });

            // 3. Remove the persona doc itself.
            await Persona.deleteOne({ _id: id, userId: req.userId });

            // 4. Best-effort: drop this persona's Qdrant vectors. A vector-store
            //    hiccup must not make the whole delete fail (the Mongo rows are
            //    already gone); stale vectors just go unreferenced.
            let vectorsCleared = false;
            try {
                vectorsCleared = await deleteVectorsForPersona(id);
            } catch (err) {
                console.warn(`[persona] Qdrant vector delete skipped for ${id}:`, err.message);
            }

            res.json({
                deleted: true,
                persona: { id: String(persona._id), name: persona.name },
                cascaded: { conversations: convIds.length, qdrantVectorsCleared: vectorsCleared },
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // ── PATCH /api/persona/:id/proactivity ──
    router.patch('/:id/proactivity', async (req, res) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
            const persona = await Persona.findOneAndUpdate(
                { _id: req.params.id, userId: req.userId },
                { $set: mapProactivityUpdate(req.body) },
                { new: true, runValidators: true },
            );
            if (!persona) return res.status(404).json({ message: 'Persona not found' });
            res.json({ proactivityConfig: persona.proactivityConfig });
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // ── GET /api/persona/:id/proactive-events ──
    router.get('/:id/proactive-events', async (req, res) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
            const limit = Math.min(Number(req.query.limit ?? 20), 100);
            const persona = await Persona.findOne({ _id: req.params.id, userId: req.userId }).lean();
            if (!persona) return res.status(404).json({ message: 'Persona not found' });
            const events = await ProactiveEvent.find({ personaId: req.params.id })
                .sort({ scheduledFor: -1 })
                .limit(limit)
                .lean();
            res.json({ events });
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // ── POST /api/persona/:id/export (multipart) ──
    router.post('/:id/export', upload.single('file'), async (req, res) => {
        try {
            const personaId = req.params.id;
            if (!mongoose.Types.ObjectId.isValid(personaId)) return res.status(400).json({ message: 'Invalid personaId' });

            const persona = await Persona.findOne({ _id: personaId, userId: req.userId }).lean();
            if (!persona) return res.status(404).json({ message: 'Persona not found' });

            const inFlight = await ChatExport.findOne({ personaId, status: { $in: ['uploaded', 'parsing', 'embedding'] } }).lean();
            if (inFlight) {
                return res.status(409).json({ message: 'An ingestion is already in progress for this persona', exportId: inFlight._id });
            }

            // Read the uploaded file (multer wrote it to disk under uploads/).
            if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
            const { readFileSync, unlinkSync } = await import('fs');
            let fileContent;
            try {
                fileContent = readFileSync(req.file.path, 'utf-8');
            } finally {
                try { unlinkSync(req.file.path); } catch { /* ignore */ }
            }

            // Detect format from the explicit field or the filename extension.
            let rawFormat = req.body.format ?? '';
            if (!rawFormat) rawFormat = req.file.originalname?.toLowerCase().endsWith('.json') ? 'telegram' : 'whatsapp';
            if (!['whatsapp', 'telegram'].includes(rawFormat)) {
                return res.status(400).json({ message: 'Invalid format field. Must be "whatsapp" or "telegram".' });
            }

            let messages;
            try {
                messages = parseExport(req.file.originalname ?? 'export.txt', fileContent);
            } catch (err) {
                return res.status(422).json({ message: `Parse error: ${err.message}` });
            }
            if (messages.length === 0) return res.status(422).json({ message: 'No messages found in the export file' });

            const chatExport = await ChatExport.create({
                personaId,
                userId: req.userId,
                rawFormat,
                status: 'uploaded',
                messageCount: messages.length,
            });

            await ingestionQueue.add(
                'ingest-export',
                {
                    personaId,
                    exportId: chatExport._id.toString(),
                    messages,
                    personaOwnerName: persona.name,
                    userId: req.userId.toString(),
                },
                {
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 5000 },
                    removeOnComplete: { count: 20 },
                    removeOnFail: { count: 20 },
                },
            );

            res.status(202).json({ exportId: chatExport._id, status: chatExport.status, messageCount: messages.length });
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // ── GET /api/persona/:id/export/status ──
    router.get('/:id/export/status', async (req, res) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid personaId' });
            const persona = await Persona.findOne({ _id: req.params.id, userId: req.userId }).lean();
            if (!persona) return res.status(404).json({ message: 'Persona not found' });
            const chatExport = await ChatExport.findOne({ personaId: req.params.id, userId: req.userId })
                .sort({ createdAt: -1 })
                .lean();
            if (!chatExport) return res.status(404).json({ message: 'No export found for this persona' });
            res.json({
                exportId: chatExport._id,
                status: chatExport.status,
                messageCount: chatExport.messageCount,
                ingestedAt: chatExport.ingestedAt ?? null,
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // ── POST /api/persona/conversations/:personaId (get-or-create) ──
    router.post('/conversations/:personaId', async (req, res) => {
        try {
            const personaId = req.params.personaId;
            if (!mongoose.Types.ObjectId.isValid(personaId)) return res.status(400).json({ message: 'Invalid personaId' });
            const persona = await Persona.findOne({ _id: personaId, userId: req.userId }).lean();
            if (!persona) return res.status(404).json({ message: 'Persona not found' });

            const conversation = await PersonaConversation.findOneAndUpdate(
                { userId: req.userId, personaId },
                { $setOnInsert: { userId: req.userId, personaId } },
                { upsert: true, new: true, setDefaultsOnInsert: true },
            ).lean();

            res.json({
                conversationId: conversation._id.toString(),
                personaId,
                personaName: persona.name,
                relationship: persona.relationship,
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // ── GET /api/persona/conversations/:personaId/messages ──
    router.get('/conversations/:personaId/messages', async (req, res) => {
        try {
            const personaId = req.params.personaId;
            if (!mongoose.Types.ObjectId.isValid(personaId)) return res.status(400).json({ message: 'Invalid personaId' });

            const conversation = await PersonaConversation.findOne({ userId: req.userId, personaId }).lean();
            if (!conversation) return res.json({ conversationId: null, messages: [] });

            const limit = Math.min(Number(req.query.limit ?? 50), 100);
            const filter = { conversationId: conversation._id };
            if (req.query.before) filter.createdAt = { $lt: new Date(req.query.before) };

            const messages = await PersonaMessage.find(filter)
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean();
            res.json({ conversationId: conversation._id.toString(), messages: messages.reverse() });
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Server error' });
        }
    });

    return router;
}
