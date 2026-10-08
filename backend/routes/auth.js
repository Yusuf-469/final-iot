/**
 * Authentication Routes - Realtime Database Version
 * Medical IoT Backend - Login, signup, social sign-in and session endpoints
 *
 * Users live at /users/{id} in the Realtime Database.
 * Every successful auth returns { success, token, user } where token is our own JWT.
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { COLLECTIONS, getDb } = require('../database');
const { admin } = require('../firebase-config');
const { signToken, requireAuth } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEMO_USER = {
  id: 'demo',
  email: 'demo@healthmonitor.io',
  firstName: 'Demo',
  lastName: 'Clinician',
  role: 'viewer',
  isDemo: true
};

// Slow down credential stuffing: 20 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many attempts. Please wait a few minutes and try again.' }
});

// Never send the password hash to the client
const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName || '',
  lastName: user.lastName || '',
  role: user.role || 'viewer',
  isDemo: !!user.isDemo,
  provider: user.provider || 'password',
  createdAt: user.createdAt || null
});

const sendSession = (res, user, status = 200) => {
  res.status(status).json({ success: true, token: signToken(user), user: publicUser(user) });
};

const requireDb = () => {
  const db = getDb();
  if (!db) {
    const error = new Error('Database not connected');
    error.status = 503;
    throw error;
  }
  return db;
};

const getUserByEmail = async (email) => {
  const snapshot = await requireDb().ref(COLLECTIONS.USERS)
    .orderByChild('email').equalTo(email.toLowerCase()).limitToFirst(1).once('value');

  if (!snapshot.exists()) return null;
  const [id, user] = Object.entries(snapshot.val())[0];
  return { id, ...user };
};

const createUser = async ({ email, password, firstName, lastName, provider }) => {
  const now = new Date().toISOString();
  const userDoc = {
    email: email.toLowerCase(),
    firstName: firstName.trim(),
    lastName: (lastName || '').trim(),
    role: 'viewer',
    status: 'active',
    isDemo: false,
    provider: provider || 'password',
    createdAt: now,
    updatedAt: now
  };
  if (password) {
    userDoc.password = await bcrypt.hash(password, 10);
  }

  const ref = requireDb().ref(COLLECTIONS.USERS).push();
  await ref.set(userDoc);
  return { id: ref.key, ...userDoc };
};

const handleError = (res, label, error) => {
  logger.error(`${label} error: ${error.message}`);
  const status = error.status || 500;
  res.status(status).json({
    success: false,
    error: status === 503 ? 'Service temporarily unavailable. Please try again shortly.' : `${label} failed. Please try again.`
  });
};

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const user = await getUserByEmail(email);

    // Same message for unknown email and wrong password to avoid account enumeration
    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    if (user.status && user.status !== 'active') {
      return res.status(403).json({ success: false, error: 'This account is disabled. Please contact support.' });
    }

    requireDb().ref(`${COLLECTIONS.USERS}/${user.id}/lastLoginAt`).set(new Date().toISOString()).catch(() => {});
    logger.info(`User logged in: ${user.email}`);
    sendSession(res, user);
  } catch (error) {
    handleError(res, 'Login', error);
  }
});

// POST /api/auth/signup
router.post('/signup', authLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim();
    const password = String(req.body.password || '');
    const firstName = String(req.body.firstName || '').trim();
    const lastName = String(req.body.lastName || '').trim();

    if (!email || !password || !firstName) {
      return res.status(400).json({ success: false, error: 'Name, email and password are required' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }

    if (await getUserByEmail(email)) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists' });
    }

    const user = await createUser({ email, password, firstName, lastName });
    logger.info(`New user registered: ${user.email}`);
    sendSession(res, user, 201);
  } catch (error) {
    handleError(res, 'Registration', error);
  }
});

// POST /api/auth/firebase - exchange a Firebase ID token (Google/GitHub/Microsoft) for our session
router.post('/firebase', authLimiter, async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ success: false, error: 'idToken is required' });
    }

    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      logger.warn(`Firebase token rejected: ${error.message}`);
      return res.status(401).json({ success: false, error: 'Social sign-in could not be verified' });
    }

    if (!decoded.email) {
      return res.status(400).json({ success: false, error: 'Your social account has no email address' });
    }

    let user = await getUserByEmail(decoded.email);
    if (!user) {
      const [firstName, ...rest] = (decoded.name || decoded.email.split('@')[0]).split(' ');
      user = await createUser({
        email: decoded.email,
        firstName,
        lastName: rest.join(' '),
        provider: decoded.firebase?.sign_in_provider || 'social'
      });
      logger.info(`New social user registered: ${user.email}`);
    } else if (user.status && user.status !== 'active') {
      return res.status(403).json({ success: false, error: 'This account is disabled. Please contact support.' });
    }

    sendSession(res, user);
  } catch (error) {
    handleError(res, 'Social sign-in', error);
  }
});

// POST /api/auth/demo - read-only demo session, no account required
router.post('/demo', authLimiter, (req, res) => {
  logger.info('Demo session started');
  sendSession(res, DEMO_USER);
});

// GET /api/auth/me - current user from token
router.get('/me', requireAuth, async (req, res) => {
  try {
    if (req.user.isDemo) {
      return res.json({ success: true, user: publicUser(DEMO_USER) });
    }
    const user = await getUserByEmail(req.user.email);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Account no longer exists' });
    }
    res.json({ success: true, user: publicUser(user) });
  } catch (error) {
    handleError(res, 'Session check', error);
  }
});

// POST /api/auth/logout - JWTs are stateless; the client discards the token
router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;
