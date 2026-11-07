// MemoryFact — durable facts about a persona extracted from live conversations
// or the historical export. Feeds the chat system prompt for long-term context.
import mongoose, { Schema } from 'mongoose';

const MemoryFactSchema = new Schema(
    {
        personaId: { type: Schema.Types.ObjectId, ref: 'Persona', required: true, index: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        fact: { type: String, required: true },
        source: { type: String, enum: ['conversation', 'export'], required: true },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

const MemoryFact = mongoose.model('MemoryFact', MemoryFactSchema);

export default MemoryFact;
