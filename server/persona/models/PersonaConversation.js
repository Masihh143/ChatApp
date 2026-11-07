// PersonaConversation — one conversation between the user and a persona.
// Distinct collection from the main app's 'Conversation' (user-to-user).
import mongoose, { Schema } from 'mongoose';

const PersonaConversationSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        personaId: { type: Schema.Types.ObjectId, ref: 'Persona', required: true, index: true },
        lastMessageAt: { type: Date, default: () => new Date() },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

PersonaConversationSchema.index({ userId: 1, lastMessageAt: -1 });

const PersonaConversation = mongoose.model('PersonaConversation', PersonaConversationSchema);

export default PersonaConversation;
