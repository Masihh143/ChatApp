import express from 'express';
import Conversation from '../models/Conversation.js';
import User from '../models/User.js';
import { verifyHttpToken } from '../config/token.js';

const router = express.Router();

router.use(verifyHttpToken);

// Get all conversations for current user
router.get('/', async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.userId
    })
      .sort({ updatedAt: -1 })
      .populate('participants', 'name email');

    res.json(conversations);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create or get one-to-one conversation with another user
router.post('/', async (req, res) => {
  try {
    const { otherUserId } = req.body;
    if (!otherUserId) {
      return res.status(400).json({ message: 'otherUserId required' });
    }

    const other = await User.findById(otherUserId);
    if (!other) {
      return res.status(404).json({ message: 'User not found' });
    }

    let convo = await Conversation.findOne({
      participants: { $all: [req.userId, otherUserId], $size: 2 }
    }).populate('participants', 'name email');

    if (!convo) {
      convo = await Conversation.create({
        participants: [req.userId, otherUserId]
      });
      convo = await convo.populate('participants', 'name email');
    }

    res.json(convo);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;


