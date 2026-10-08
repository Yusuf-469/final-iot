/**
 * Medical IoT Backend Server
 * Main Express application entry point (runs standalone or as a Vercel serverless function)
 */

// Load environment variables early
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');

const { getDb, getDbConnected } = require('./database');
const { requireAuth, requireUserOrDevice } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const FRONTEND_DIR = path.join(__dirname, '../frontend');

// ============================================
// MIDDLEWARE SETUP
// ============================================

// Behind Vercel / Railway proxies: needed for correct client IPs in rate limiting
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Security headers. CSP is off because pages use inline scripts and CDN libraries.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' } // required for Google/GitHub sign-in popups
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Device-Key'],
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// General API rate limit: 300 requests / minute / IP
app.use('/api/', rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please slow down.' }
}));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api')) {
      console.log(`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${Date.now() - start}ms`);
    }
  });
  next();
});

// ============================================
// STATIC FILES
// ============================================

app.use(express.static(FRONTEND_DIR, { extensions: ['html'] }));

// ============================================
// PUBLIC ENDPOINTS
// ============================================

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: getDbConnected() ? 'connected' : 'disconnected'
  });
});

app.get('/ready', (req, res) => res.status(200).json({ ready: true, service: 'ready' }));

app.get('/ping', (req, res) => {
  res.status(200).json({ pong: true, timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// Public Firebase web config (database URL / project id are not secrets)
app.get('/api/config/firebase', (req, res) => {
  const projectId = process.env.FIREBASE_PROJECT_ID || 'iothealth-2335a';
  res.json({
    success: true,
    data: {
      databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${projectId}-default-rtdb.firebaseio.com`,
      projectId,
      authDomain: `${projectId}.firebaseapp.com`
    }
  });
});

app.get('/api', (req, res) => {
  res.json({
    name: 'Medical IoT API',
    version: '2.0.0',
    status: 'operational',
    endpoints: {
      auth: '/api/auth',
      patients: '/api/patients',
      healthData: '/api/health-data',
      alerts: '/api/alerts',
      devices: '/api/devices',
      analytics: '/api/analytics',
      chat: '/api/chat'
    }
  });
});

app.use('/api/auth', require('./routes/auth'));

// ============================================
// PROTECTED ENDPOINTS
// ============================================

// Reads need a logged-in user; ESP32 devices may write readings, heartbeats and alerts.
const userReadsDeviceWrites = (req, res, next) =>
  (req.method === 'GET' ? requireAuth : requireUserOrDevice)(req, res, next);

const devicesAuth = (req, res, next) =>
  (req.method === 'POST' && req.path === '/heartbeat' ? requireUserOrDevice : requireAuth)(req, res, next);

// Live device node
app.get('/api/health', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    if (!db) return res.status(200).json({ health: null, timestamp: new Date().toISOString() });
    const snapshot = await db.ref('health').once('value');
    res.json({ health: snapshot.val(), timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Health API error:', error.message);
    res.status(503).json({ health: null, error: 'unavailable', timestamp: new Date().toISOString() });
  }
});

app.use('/api/patients', requireAuth, require('./routes/patients'));
app.use('/api/health-data', userReadsDeviceWrites, require('./routes/healthData'));
app.use('/api/alerts', userReadsDeviceWrites, require('./routes/alerts'));
app.use('/api/devices', devicesAuth, require('./routes/devices'));
app.use('/api/analytics', requireAuth, require('./routes/analytics'));
app.use('/api/chat', requireAuth, require('./routes/chat'));

// Diagnostics (signed-in users only)
app.get('/api/test-env', requireAuth, (req, res) => {
  res.json({
    success: true,
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? 'SET' : 'NOT SET',
      FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? 'SET' : 'NOT SET',
      FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ? 'SET' : 'NOT SET',
      FIREBASE_DATABASE_URL: process.env.FIREBASE_DATABASE_URL ? 'SET' : 'NOT SET',
      JWT_SECRET: process.env.JWT_SECRET ? 'SET' : 'NOT SET',
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ? 'SET' : 'NOT SET'
    },
    timestamp: new Date().toISOString()
  });
});

app.get('/api/test-firebase', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: 'Database not connected' });
    const patientsSnap = await db.ref('patients').once('value');
    const healthSnap = await db.ref('health').once('value');
    res.json({
      success: true,
      message: 'Firebase connection successful',
      data: {
        patientsCount: Object.keys(patientsSnap.val() || {}).length,
        healthData: healthSnap.exists(),
        dbConnected: getDbConnected()
      }
    });
  } catch (error) {
    console.error('Firebase test error:', error.message);
    res.status(500).json({ success: false, error: 'Firebase connection failed' });
  }
});

// Unknown API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'API endpoint not found' });
});

// ============================================
// FRONTEND ROUTES (clean URLs)
// ============================================

const PAGES = ['dashboard', 'patients', 'alerts', 'devices', 'analytics', 'settings', 'login', 'signup', 'dr-ai'];

app.get('*', (req, res) => {
  const page = PAGES.find(p => req.path === `/${p}` || req.path.startsWith(`/${p}/`));
  res.sendFile(path.join(FRONTEND_DIR, `${page || 'index'}.html`), (err) => {
    if (err) res.status(404).send('Page not found');
  });
});

// ============================================
// ERROR HANDLING
// ============================================

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);

  // Malformed JSON body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Invalid JSON body' });
  }

  const status = err.status || err.statusCode || 500;
  if (req.path.startsWith('/api/')) {
    return res.status(status).json({
      success: false,
      error: status >= 500 ? 'Internal server error' : err.message
    });
  }
  res.status(status).send('<h1>Something went wrong</h1><p>Please try again later.</p>');
});

// ============================================
// SERVER STARTUP
// ============================================

const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.LAMBDA_TASK_ROOT;

if (!isVercel && require.main === module) {
  const PORT = process.env.PORT || 8080;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Medical IoT server running on http://localhost:${PORT} (${process.env.NODE_ENV || 'production'})`);
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => process.exit(0));
  });
}

// Prevent unhandled rejections from crashing the process
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

module.exports = { app, server };
module.exports.default = app;
