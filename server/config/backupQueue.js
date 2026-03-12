import Queue from 'better-queue';
import SqliteStore from 'better-queue-sql';
import path from 'path';
import { fileURLToPath } from 'url';
import { BackupUser, BackupConversation, BackupMessage } from './backupModels.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Persistent backup queue.
 * Uses SQLite file store so pending jobs survive server restarts.
 */

const MODEL_MAP = {
    User: BackupUser,
    Conversation: BackupConversation,
    Message: BackupMessage,
};

/**
 * Worker: processes one backup job at a time.
 * Job shape: { collection, operation, docData }
 */
async function processBackupJob(job, cb) {
    try {
        const Model = MODEL_MAP[job.collection];
        if (!Model) {
            // eslint-disable-next-line no-console
            console.warn(`[Backup] Unknown collection: ${job.collection}`);
            return cb(null); // don't retry unknown collections
        }

        if (job.operation === 'upsert') {
            const data = { ...job.docData };
            const id = data._id;
            delete data.__v; // strip Mongoose version key
            await Model.updateOne({ _id: id }, data, { upsert: true });
        } else if (job.operation === 'delete') {
            await Model.deleteOne({ _id: job.docData._id });
        } else {
            // eslint-disable-next-line no-console
            console.warn(`[Backup] Unknown operation: ${job.operation}`);
        }

        cb(null);
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[Backup] Job failed (will retry):`, err.message);
        cb(err); // triggers retry
    }
}

let queue = null;

// Only create queue if backup models exist
if (BackupUser) {
    const storePath = path.join(__dirname, '..', 'queue-store.db');

    queue = new Queue(processBackupJob, {
        store: {
            type: 'sql',
            dialect: 'sqlite',
            path: storePath,
        },
        maxRetries: 5,
        retryDelay: 3000,
        afterProcessDelay: 100, // avoid blocking event loop
        batchSize: 1,
    });

    queue.on('task_failed', (taskId, err) => {
        // eslint-disable-next-line no-console
        console.error(`[Backup] Task ${taskId} failed permanently:`, err?.message);
    });

    // eslint-disable-next-line no-console
    console.log('[Backup Queue] Initialized with SQLite store at', storePath);
}

/**
 * Enqueue a backup job. Fire-and-forget — does not block the caller.
 *
 * @param {'User'|'Conversation'|'Message'} collection
 * @param {'upsert'|'delete'} operation
 * @param {object} docData - Plain JS object (use .toObject() from Mongoose docs)
 */
export function enqueueBackup(collection, operation, docData) {
    if (!queue) return; // backup disabled

    // Use setImmediate to avoid blocking the current event loop tick
    setImmediate(() => {
        queue.push({ collection, operation, docData });
    });
}

export default queue;
