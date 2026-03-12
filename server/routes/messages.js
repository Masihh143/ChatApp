import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import cloudinary from '../config/cloudinary.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import { verifyHttpToken } from '../config/token.js';
import { enqueueBackup } from '../config/backupQueue.js';

const upload = multer({ dest: 'uploads/' });

const router = express.Router();

router.use(verifyHttpToken);

export default function messageRouter(io) {
  /**
   * Get messages for a conversation — cursor-based pagination.
   *
   * Query params:
   *   ?before=<messageId>  — fetch messages older than this ID
   *   ?limit=<number>      — max messages to return (default 30, max 100)
   *
   * Returns: { messages: [...], hasMore: boolean }
   */
  router.get('/:conversationId', async (req, res) => {
    try {
      const { conversationId } = req.params;
      const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
      const { before } = req.query;

      const filter = { conversation: conversationId };

      // Cursor: fetch messages older than the given ID
      if (before && mongoose.Types.ObjectId.isValid(before)) {
        filter._id = { $lt: new mongoose.Types.ObjectId(before) };
      }

      const messages = await Message.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit + 1) // fetch one extra to check if more exist
        .populate('sender', 'name email')
        .lean();

      const hasMore = messages.length > limit;
      if (hasMore) messages.pop(); // remove the extra

      // Reverse so messages are in chronological order (oldest first)
      messages.reverse();

      res.json({ messages, hasMore });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Send a message (text and optional media)
  router.post(
    '/:conversationId',
    upload.single('media'),
    async (req, res) => {
      try {
        const { conversationId } = req.params;
        const { text } = req.body;

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          return res.status(404).json({ message: 'Conversation not found' });
        }

        if (!conversation.participants.some((p) => String(p) === req.userId)) {
          return res.status(403).json({ message: 'Not in this conversation' });
        }

        let mediaUrl;
        let mediaType;

        if (req.file) {
          const uploadResult = await cloudinary.uploader.upload(req.file.path, {
            resource_type: 'auto'
          });
          mediaUrl = uploadResult.secure_url;
          mediaType = uploadResult.resource_type;
        }

        const message = await Message.create({
          conversation: conversationId,
          sender: req.userId,
          text,
          mediaUrl,
          mediaType
        });

        conversation.lastMessageAt = new Date();
        await conversation.save();

        const populated = await message.populate('sender', 'name email');

        // Fire-and-forget backup for both message and updated conversation
        enqueueBackup('Message', 'upsert', message.toObject());
        enqueueBackup('Conversation', 'upsert', conversation.toObject());

        io.to(`conversation:${conversationId}`).emit('message:new', populated);

        res.status(201).json(populated);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        res.status(500).json({ message: 'Server error' });
      }
    }
  );

  return router;
}
