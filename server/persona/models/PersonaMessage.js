// PersonaMessage — a message in a persona conversation (sender 'user' | 'persona').
// Distinct collection from the main app's 'Message'.
import mongoose, { Schema } from 'mongoose';

const PersonaMessageSchema = new Schema(
    {
        conversationId: { type: Schema.Types.ObjectId, ref: 'PersonaConversation', required: true, index: true },
        sender: { type: String, enum: ['user', 'persona'], required: true },
        text: { type: String, required: true },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

PersonaMessageSchema.index({ conversationId: 1, createdAt: 1 });

const PersonaMessage = mongoose.model('PersonaMessage', PersonaMessageSchema);

export default PersonaMessage;
