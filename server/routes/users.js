import express from 'express';
import User from '../models/User.js';
import { verifyHttpToken } from '../config/token.js';

const router = express.Router();

router.use(verifyHttpToken);

// Get all users except the current one
router.get('/', async (req, res) => {
  try {
    const users = await User.find(
      { _id: { $ne: req.userId } },
      { name: 1, email: 1 }
    ).sort({ name: 1 });

    res.json(users);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;


