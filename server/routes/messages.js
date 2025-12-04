import express from 'express';
import multer from 'multer';
import cloudinary from '../config/cloudinary.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import { verifyHttpToken } from '../config/token.js';

const upload = multer({ dest: 'uploads/' });

const router = express.Router();

router.use(verifyHttpToken);

export default function messageRouter(io) {
  // Get messages for a conversation
  router.get('/:conversationId', async (req, res) => {
    try {
      const { conversationId } = req.params;
      const messages = await Message.find({ conversation: conversationId })
        .sort({ createdAt: 1 })
        .populate('sender', 'name email');

      res.json(messages);
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


