// ChatExport — a raw WhatsApp/Telegram export uploaded for a persona, and its
// ingestion pipeline status. Ported from feature/Persona_chat.
import mongoose, { Schema } from 'mongoose';

const ChatExportSchema = new Schema(
    {
        personaId: { type: Schema.Types.ObjectId, ref: 'Persona', required: true, index: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        rawFormat: { type: String, enum: ['whatsapp', 'telegram'], required: true },
        status: {
            type: String,
            enum: ['uploaded', 'parsing', 'embedding', 'ready', 'failed'],
            default: 'uploaded',
        },
        messageCount: { type: Number, default: 0 },
        ingestedAt: { type: Date, default: null },
        error: { type: String, default: null },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

const ChatExport = mongoose.model('ChatExport', ChatExportSchema);

export default ChatExport;
