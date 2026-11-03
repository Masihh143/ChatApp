import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import cloudinary from '../config/cloudinary.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import { verifyHttpToken } from '../config/token.js';
import { enqueueBackup } from '../config/backupQueue.js';
import { emitEvent } from '../events/eventBus.js';
import { rateLimitMessages } from '../middleware/rateLimiter.js';

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
        .populate('replyTo', 'text sender mediaType mediaUrl messageType')
        .lean();

      const hasMore = messages.length > limit;
      if (hasMore) messages.pop(); // remove the extra

      // Reverse so messages are in chronological order (oldest first)
      messages.reverse();

      // Populate replyTo sender names
      if (messages.some((m) => m.replyTo?.sender)) {
        const senderIds = [...new Set(messages.filter((m) => m.replyTo?.sender).map((m) => m.replyTo.sender.toString()))];
        const User = mongoose.model('User');
        const senders = await User.find({ _id: { $in: senderIds } }).select('name').lean();
        const senderMap = Object.fromEntries(senders.map((s) => [s._id.toString(), s]));
        messages.forEach((m) => {
          if (m.replyTo?.sender) {
            m.replyTo.senderInfo = senderMap[m.replyTo.sender.toString()] || null;
          }
        });
      }

      res.json({ messages, hasMore });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  /**
   * Send a message (text and optional media).
   * Body (multipart or JSON):
   *   text — message text
   *   replyTo — optional messageId to reply to
   *   messageType — optional ('text'|'image'|'video'|'audio'|'voice_note')
   */
  router.post(
    '/:conversationId',
    rateLimitMessages,
    upload.single('media'),
    async (req, res) => {
      try {
        const { conversationId } = req.params;
        const { text, replyTo } = req.body;

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          return res.status(404).json({ message: 'Conversation not found' });
        }

        if (!conversation.participants.some((p) => String(p) === req.userId)) {
          return res.status(403).json({ message: 'Not in this conversation' });
        }

        let mediaUrl;
        let mediaType;
        let messageType = req.body.messageType || 'text';

        if (req.file) {
          const uploadResult = await cloudinary.uploader.upload(req.file.path, {
            resource_type: 'auto'
          });
          mediaUrl = uploadResult.secure_url;
          mediaType = uploadResult.resource_type;

          // Auto-detect messageType from upload
          if (!req.body.messageType) {
            if (mediaType === 'video') messageType = 'video';
            else if (mediaType === 'image') messageType = 'image';
            else if (req.file.mimetype?.startsWith('audio/')) messageType = 'audio';
          }
        }

        const messageData = {
          conversation: conversationId,
          sender: req.userId,
          text,
          mediaUrl,
          mediaType,
          messageType,
          status: 'sent',
        };

        // Validate and set replyTo reference
        if (replyTo && mongoose.Types.ObjectId.isValid(replyTo)) {
          messageData.replyTo = replyTo;
        }

        const message = await Message.create(messageData);

        // Update conversation
        conversation.lastMessageAt = new Date();
        conversation.lastMessage = {
          text: text || (mediaUrl ? `📎 ${messageType}` : ''),
          sender: req.userId,
          messageType,
          createdAt: message.createdAt,
        };
        await conversation.save();

        const populated = await message.populate('sender', 'name email');

        // Also populate replyTo if present
        if (message.replyTo) {
          await populated.populate('replyTo', 'text sender mediaType mediaUrl messageType');
          if (populated.replyTo?.sender) {
            const User = mongoose.model('User');
            const replyUser = await User.findById(populated.replyTo.sender).select('name').lean();
            const pop = populated.toObject();
            pop.replyTo.senderInfo = replyUser;
            // Emit the fully populated version
            io.to(`conversation:${conversationId}`).emit('message:new', pop);
            // Fire-and-forget backups
            enqueueBackup('Message', 'upsert', message.toObject());
            enqueueBackup('Conversation', 'upsert', conversation.toObject());
            // Emit event for async processing
            const recipientIds = conversation.participants
              .map((p) => String(p))
              .filter((p) => p !== req.userId);
            emitEvent('message.sent', {
              messageId: message._id.toString(),
              conversationId,
              senderId: req.userId,
              recipientIds,
            }).catch(() => { });
            return res.status(201).json(pop);
          }
        }

        // Fire-and-forget backups
        enqueueBackup('Message', 'upsert', message.toObject());
        enqueueBackup('Conversation', 'upsert', conversation.toObject());

        // Emit event for async processing
        const recipientIds = conversation.participants
          .map((p) => String(p))
          .filter((p) => p !== req.userId);

        emitEvent('message.sent', {
          messageId: message._id.toString(),
          conversationId,
          senderId: req.userId,
          recipientIds,
        }).catch(() => { });

        io.to(`conversation:${conversationId}`).emit('message:new', populated);

        res.status(201).json(populated);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        res.status(500).json({ message: 'Server error' });
      }
    }
  );

  /**
   * Forward a message to another conversation.
   * POST /api/messages/:conversationId/forward
   * Body: { messageId, targetConversationId }
   */
  router.post('/:conversationId/forward', rateLimitMessages, async (req, res) => {
    try {
      const { messageId, targetConversationId } = req.body;
      if (!messageId || !targetConversationId) {
        return res.status(400).json({ message: 'messageId and targetConversationId required' });
      }

      const originalMsg = await Message.findById(messageId).lean();
      if (!originalMsg) {
        return res.status(404).json({ message: 'Original message not found' });
      }

      const targetConvo = await Conversation.findById(targetConversationId);
      if (!targetConvo) {
        return res.status(404).json({ message: 'Target conversation not found' });
      }

      if (!targetConvo.participants.some((p) => String(p) === req.userId)) {
        return res.status(403).json({ message: 'Not in target conversation' });
      }

      const forwardedMsg = await Message.create({
        conversation: targetConversationId,
        sender: req.userId,
        text: originalMsg.text,
        mediaUrl: originalMsg.mediaUrl,
        mediaType: originalMsg.mediaType,
        messageType: originalMsg.messageType || 'text',
        forwardedFrom: messageId,
        status: 'sent',
      });

      targetConvo.lastMessageAt = new Date();
      targetConvo.lastMessage = {
        text: originalMsg.text || `📎 ${originalMsg.messageType || 'media'}`,
        sender: req.userId,
        messageType: originalMsg.messageType || 'text',
        createdAt: forwardedMsg.createdAt,
      };
      await targetConvo.save();

      const populated = await forwardedMsg.populate('sender', 'name email');

      enqueueBackup('Message', 'upsert', forwardedMsg.toObject());
      enqueueBackup('Conversation', 'upsert', targetConvo.toObject());

      const recipientIds = targetConvo.participants
        .map((p) => String(p))
        .filter((p) => p !== req.userId);

      emitEvent('message.sent', {
        messageId: forwardedMsg._id.toString(),
        conversationId: targetConversationId,
        senderId: req.userId,
        recipientIds,
      }).catch(() => { });

      io.to(`conversation:${targetConversationId}`).emit('message:new', populated);

      res.status(201).json(populated);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  /**
   * Update message status (delivered / read).
   * PATCH /api/messages/:conversationId/status
   * Body: { messageIds: string[], status: 'delivered' | 'read' }
   */
  router.patch('/:conversationId/status', async (req, res) => {
    try {
      const { messageIds, status } = req.body;
      if (!messageIds?.length || !['delivered', 'read'].includes(status)) {
        return res.status(400).json({ message: 'messageIds and valid status required' });
      }

      const updateData = { status };
      if (status === 'delivered') updateData.deliveredAt = new Date();
      if (status === 'read') updateData.readAt = new Date();

      await Message.updateMany(
        {
          _id: { $in: messageIds },
          conversation: req.params.conversationId,
          sender: { $ne: req.userId }, // Only update messages NOT sent by current user
        },
        { $set: updateData }
      );

      // Find the original sender(s) and notify them
      const msgs = await Message.find({ _id: { $in: messageIds } }).select('sender').lean();
      const senderIds = [...new Set(msgs.map((m) => m.sender.toString()))];

      for (const sid of senderIds) {
        for (const mid of messageIds) {
          emitEvent(`message.${status}`, {
            messageId: mid,
            conversationId: req.params.conversationId,
            senderId: sid,
          }).catch(() => { });
        }
      }

      // Also emit via socket immediately for responsiveness
      for (const sid of senderIds) {
        io.to(sid).emit('message:status', {
          messageIds,
          conversationId: req.params.conversationId,
          status,
        });
      }

      res.json({ updated: messageIds.length });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
}
