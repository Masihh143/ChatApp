// Persona — an AI persona of a real person, built from a chat export.
// Ported from feature/Persona_chat/server/api/src/models/Persona.ts into the
// main Express stack (JS). userId references the main app's 'User' model.
import mongoose, { Schema } from 'mongoose';

const PersonaSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        relationship: { type: String, required: true, trim: true },
        avatarUrl: { type: String, default: null },

        // Distilled tone/style, generated once from the export corpus.
        voiceProfile: {
            summary: { type: String, default: '' },
            commonPhrases: { type: [String], default: [] },
            topics: { type: [String], default: [] },
        },

        // Factual knowledge about the person, distilled from the export.
        personProfile: {
            type: {
                keyFacts: { type: [String], default: [] },
                preferences: { type: [String], default: [] },
                habits: { type: [String], default: [] },
                relationships: { type: [String], default: [] },
            },
            default: () => ({}),
        },

        // Simulated typing speed (chars/sec) the client uses to pace reply reveal.
        typingSpeed: { type: Number, default: 28 },

        // Proactive engine config. Default materialises the full sub-doc.
        proactivityConfig: {
            type: {
                enabled: { type: Boolean, default: false },
                cadenceHours: { type: Number, default: 24 },
                quietHours: {
                    start: { type: String, default: '23:00' },
                    end: { type: String, default: '08:00' },
                },
                maxMessagesPerDay: { type: Number, default: 3 },
                lastProactiveAt: { type: Date, default: null },
            },
            default: () => ({}),
        },

        sourceExportId: { type: Schema.Types.ObjectId, ref: 'ChatExport', default: null },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

const Persona = mongoose.model('Persona', PersonaSchema);

export default Persona;
