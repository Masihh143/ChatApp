import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

/* ── Primary database (MONGO_URI1) ── */
const MONGO_URI1 = process.env.MONGO_URI1 || 'mongodb://127.0.0.1:27017/chat_app';

mongoose
  .connect(MONGO_URI1)
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('[Primary DB] Connected');
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[Primary DB] Connection error:', err.message);
  });

mongoose.connection.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[Primary DB] Runtime error:', err.message);
});

/* ── Backup database (MONGO_URI2) ── */
const MONGO_URI2 = process.env.MONGO_URI2;

let backupConnection = null;

if (MONGO_URI2) {
  backupConnection = mongoose.createConnection(MONGO_URI2);

  backupConnection.on('connected', () => {
    // eslint-disable-next-line no-console
    console.log('[Backup DB] Connected');
  });

  backupConnection.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[Backup DB] Connection error:', err.message);
  });

  backupConnection.on('disconnected', () => {
    // eslint-disable-next-line no-console
    console.log('[Backup DB] Disconnected — queue will retry pending jobs');
  });
} else {
  // eslint-disable-next-line no-console
  console.warn('[Backup DB] MONGO_URI2 not set — backup disabled');
}

export { backupConnection };
