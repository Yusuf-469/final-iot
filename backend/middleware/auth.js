/**
 * Authentication Middleware
 * Verifies the JWT issued by /api/auth and attaches the user to req.user
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET is not set — using an insecure default. Set it in your environment.');
}

const signToken = (user) => jwt.sign(
  { id: user.id, email: user.email, role: user.role, isDemo: !!user.isDemo },
  JWT_SECRET,
  { expiresIn: JWT_EXPIRES_IN }
);

const readToken = (req) => {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
};

const requireAuth = (req, res, next) => {
  const token = readToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch (error) {
    const expired = error.name === 'TokenExpiredError';
    return res.status(401).json({ success: false, error: expired ? 'Session expired' : 'Invalid token' });
  }

  // Demo sessions can look around and chat, but not change data
  if (req.user.isDemo && req.method !== 'GET' && !req.originalUrl.startsWith('/api/chat')) {
    return res.status(403).json({ success: false, error: 'The demo account is read-only. Create a free account to make changes.' });
  }
  next();
};

/**
 * Accepts either a logged-in user (JWT) or an IoT device presenting
 * X-Device-Key that matches DEVICE_API_KEY. If DEVICE_API_KEY is not
 * configured, device requests are allowed so existing hardware keeps working.
 */
const requireUserOrDevice = (req, res, next) => {
  if (readToken(req)) return requireAuth(req, res, next);

  const deviceKey = process.env.DEVICE_API_KEY;
  if (!deviceKey || req.headers['x-device-key'] === deviceKey) {
    req.device = true;
    return next();
  }
  res.status(401).json({ success: false, error: 'Invalid device key' });
};

module.exports = { signToken, requireAuth, requireUserOrDevice, JWT_SECRET };
