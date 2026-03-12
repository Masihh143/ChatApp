import mongoose from 'mongoose';
import { backupConnection } from './db.js';

/**
 * Backup models — identical schemas registered on the backup connection.
 * If backupConnection is null (MONGO_URI2 not set), models will be null.
 */

let BackupUser = null;
let BackupConversation = null;
let BackupMessage = null;

if (backupConnection) {
    /* ── User schema ── */
    const userSchema = new mongoose.Schema(
        {
            _id: mongoose.Schema.Types.ObjectId,
            name: { type: String, required: true },
            email: { type: String, required: true },
            passwordHash: { type: String, required: true },
        },
        { timestamps: true }
    );
    userSchema.index({ email: 1 }, { unique: true });
    BackupUser = backupConnection.model('User', userSchema);

    /* ── Conversation schema ── */
    const conversationSchema = new mongoose.Schema(
        {
            _id: mongoose.Schema.Types.ObjectId,
            participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
            lastMessageAt: { type: Date, default: Date.now },
        },
        { timestamps: true }
    );
    conversationSchema.index({ participants: 1, updatedAt: -1 });
    BackupConversation = backupConnection.model('Conversation', conversationSchema);

    /* ── Message schema ── */
    const messageSchema = new mongoose.Schema(
        {
            _id: mongoose.Schema.Types.ObjectId,
            conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
            sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            text: { type: String },
            mediaUrl: { type: String },
            mediaType: { type: String },
        },
        { timestamps: true }
    );
    messageSchema.index({ conversation: 1, createdAt: -1 });
    messageSchema.index({ sender: 1 });
    BackupMessage = backupConnection.model('Message', messageSchema);
}

export { BackupUser, BackupConversation, BackupMessage };
