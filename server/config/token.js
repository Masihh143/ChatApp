import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

export function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyHttpToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

export function verifySocketToken(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No token'));

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.userId = payload.userId;
    return next();
  } catch (err) {
    return next(new Error('Invalid token'));
  }
}


