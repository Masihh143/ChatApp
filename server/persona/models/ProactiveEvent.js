// ProactiveEvent — one row per proactive-engine cycle (sent or skipped).
// The debugging trail for why a persona did / didn't reach out at a given time.
import mongoose, { Schema } from 'mongoose';

const ProactiveEventSchema = new Schema(
    {
        personaId: { type: Schema.Types.ObjectId, ref: 'Persona', required: true, index: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        scheduledFor: { type: Date, required: true },
        status: {
            type: String,
            enum: ['pending', 'sent', 'skipped'],
            default: 'pending',
        },
        reason: { type: String, required: true },
        draftMessage: { type: String, default: null },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

ProactiveEventSchema.index({ status: 1, scheduledFor: 1 });

const ProactiveEvent = mongoose.model('ProactiveEvent', ProactiveEventSchema);

export default ProactiveEvent;
