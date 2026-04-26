/**
 * Medical IoT Backend Server
 * Main Express application entry point
 */

// Load environment variables early
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Express setup
const express = require('express');
const cors = require('cors');
const http = require('http');

// Database (now Firebase) - imported later to avoid startup crashes
const { getDbConnected } = require('./database');

// Logger
const logger = require('./utils/logger');

// Create Express app
const app = express();
const server = http.createServer(app);

  // ============================================
  // MIDDLEWARE SETUP
  // ============================================

  // CORS configuration
  app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true
  }));

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

// Request logging (simple)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path !== '/health' && req.path !== '/ready' && req.path !== '/ping') {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// Error handling will be at the end of the file

// ============================================
// STATIC FILES (for frontend in production)
// ============================================

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

// ============================================
// API ROUTES
// ============================================

// Health check endpoints - ALWAYS return 200 for Railway
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: getDbConnected() ? 'connected' : 'disconnected',
    memory: process.memoryUsage()
  });
});

app.get('/ready', (req, res) => {
  res.status(200).json({
    ready: true,
    service: 'ready'
  });
});

// Keep-alive ping endpoint (for uptime monitors)
app.get('/ping', (req, res) => {
  res.status(200).json({
    pong: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Direct health data from Firebase RTDB
app.get('/api/health', async (req, res) => {
  try {
    const { db, getDbConnected } = require('./database');
    if (!db || !getDbConnected()) {
      return res.status(200).json({ health: null, timestamp: new Date().toISOString() });
    }
    const snapshot = await db.ref('health').once('value');
    const healthData = snapshot.val();
    res.json({
      health: healthData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health API error:', error);
    res.status(200).json({ health: null, error: 'unavailable', timestamp: new Date().toISOString() });
  }
});

// Firebase config endpoint
app.get('/api/config/firebase', (req, res) => {
  console.log('GET /api/config/firebase called');
  try {
    const config = {
      databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://iothealth-2335a-default-rtdb.firebaseio.com',
      projectId: process.env.FIREBASE_PROJECT_ID || 'iothealth-2335a',
      authDomain: process.env.FIREBASE_PROJECT_ID ? `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com` : 'iothealth-2335a.firebaseapp.com'
    };

    console.log('Returning Firebase config');
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Firebase config error:', error);
    res.status(500).json({ success: false, error: 'Config unavailable' });
  }
});

// API Info
app.get('/api', (req, res) => {
  res.json({
    name: 'Medical IoT API',
    version: '1.0.0',
    status: 'operational',
    endpoints: {
      auth: '/api/auth',
      patients: '/api/patients',
      healthData: '/api/health-data',
      alerts: '/api/alerts',
      devices: '/api/devices'
    }
  });
});

// Test route for debugging body parsing
app.post('/api/test-body', (req, res) => {
  console.log('Request body:', req.body);
  console.log('Request headers:', req.headers);
  console.log('Raw body (if available):', req._rawBody || 'Not available');
  res.json({ received: req.body, headers: req.headers });
});

// Mount routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/patients', require('./routes/patients'));
app.use('/api/health-data', require('./routes/healthData'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/devices', require('./routes/devices'));
app.use('/api/analytics', require('./routes/analytics'));

// Legacy routes (redirect)
app.use('/api/login', require('./routes/auth'));
app.use('/api/signup', require('./routes/auth'));

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Simple AI response logic - replace with actual AI integration
    let response = 'I\'m sorry, I\'m still learning. Can you rephrase your question?';

    // Basic keyword matching for demo
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
      response = 'Hello! How can I help you with your health data today?';
    } else if (lowerMessage.includes('status') || lowerMessage.includes('health')) {
      response = 'Based on your recent readings, your overall health status looks good. Your heart rate is within normal range, and your temperature is stable. Is there anything specific you\'d like to know about?';
    } else if (lowerMessage.includes('alert') || lowerMessage.includes('concern')) {
      response = 'I don\'t see any concerning readings in your recent data. All your vital signs are within normal parameters. If you notice any symptoms, please let me know!';
    } else if (lowerMessage.includes('trend') || lowerMessage.includes('history')) {
      response = 'Your health trends show consistent patterns. Your heart rate has been stable around 72-78 BPM, and your temperature readings are normal. Would you like me to show you a detailed chart?';
    } else if (lowerMessage.includes('recommend') || lowerMessage.includes('advice')) {
      response = 'Based on your data, I recommend maintaining your current healthy lifestyle. Stay hydrated, get regular exercise, and continue monitoring your health metrics. Do you have any specific concerns?';
    }

    res.json({ response });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// DEBUG ROUTES (for testing)
// ============================================

// Test environment variables
app.get('/api/test-env', (req, res) => {
  res.json({
    success: true,
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? 'SET' : 'NOT SET',
      FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? 'SET' : 'NOT SET',
      FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ? 'SET (length: ' + process.env.FIREBASE_PRIVATE_KEY.length + ')' : 'NOT SET',
      FIREBASE_DATABASE_URL: process.env.FIREBASE_DATABASE_URL ? 'SET' : 'NOT SET',
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ? 'SET' : 'NOT SET'
    },
    timestamp: new Date().toISOString()
  });
});

// Test Firebase connection
app.get('/api/test-firebase', async (req, res) => {
  try {
    const { getDb, getDbConnected } = require('./database');
    const db = getDb();

    if (!getDbConnected()) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    // Test reading from patients
    const patientsSnap = await db.ref('patients').once('value');
    const patientsData = patientsSnap.val() || {};

    // Test reading from health
    const healthSnap = await db.ref('health').once('value');
    const healthData = healthSnap.val() || {};

    res.json({
      success: true,
      message: 'Firebase connection successful',
      data: {
        patientsCount: Object.keys(patientsData).length,
        healthData: !!healthData,
        dbConnected: getDbConnected()
      }
    });

  } catch (error) {
    console.error('Firebase test error:', error);
    res.status(500).json({
      success: false,
      error: 'Firebase connection failed',
      details: error.message
    });
  }
});

// ============================================
// FRONTEND ROUTES (SPA support)
// ============================================

  // Serve index.html for all non-API routes (SPA)
  app.get('*', (req, res) => {
    // Only serve HTML for non-API routes
    if (!req.path.startsWith('/api') && !req.path.startsWith('/health') && !req.path.startsWith('/ready') && !req.path.startsWith('/ping')) {
      // Serve appropriate HTML based on path
      let filePath = path.join(__dirname, '../frontend');

      if (req.path === '/' || req.path === '/index' || req.path === '/index.html') {
        filePath = path.join(filePath, 'index.html');
      } else if (req.path.startsWith('/dashboard')) {
        filePath = path.join(filePath, 'dashboard.html');
      } else if (req.path.startsWith('/patients')) {
        filePath = path.join(filePath, 'patients.html');
      } else if (req.path.startsWith('/alerts')) {
        filePath = path.join(filePath, 'alerts.html');
      } else if (req.path.startsWith('/devices')) {
        filePath = path.join(filePath, 'devices.html');
      } else if (req.path.startsWith('/analytics')) {
        filePath = path.join(filePath, 'analytics.html');
      } else if (req.path.startsWith('/settings')) {
        filePath = path.join(filePath, 'settings.html');
      } else if (req.path.startsWith('/login')) {
        filePath = path.join(filePath, 'login.html');
       } else if (req.path.startsWith('/signup')) {
         filePath = path.join(filePath, 'signup.html');
       } else if (req.path.startsWith('/dr-ai')) {
         filePath = path.join(filePath, 'dr-ai.html');
       } else {
         filePath = path.join(filePath, 'index.html');
       }

      res.sendFile(filePath, (err) => {
        if (err) {
          res.status(404).json({ error: 'Page not found' });
        }
      });
    } else {
      // For API routes that don't match any handler
      res.status(404).json({ error: 'API endpoint not found' });
    }
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler - MUST return JSON for all API endpoints
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);

  // Always return JSON for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(200).json({
      error: 'Service temporarily unavailable',
      message: err.message || 'Internal server error'
    });
  }

  // HTML error for non-API routes
  res.status(err.status || 500).send(`
    <html>
      <body>
        <h1>Server Error</h1>
        <p>An error occurred. Please try again later.</p>
        <p>Error: ${err.message}</p>
      </body>
    </html>
  `);
});

// ============================================
// SERVER STARTUP
// ============================================

// Check if running on Vercel (serverless)
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.LAMBDA_TASK_ROOT;

if (!isVercel) {
  // Only start server if NOT on Vercel
  const PORT = process.env.PORT || 8080;
  const HOST = '0.0.0.0';

  // Start server immediately (don't wait for database)
  server.listen(PORT, HOST, () => {
    console.log(`
╔════════════════════════════════════════════════════╗
║     Medical IoT Backend Server                    ║
╠════════════════════════════════════════════════════╣
║  Server running on: http://${HOST}:${PORT}                    ║
║  Environment: ${process.env.NODE_ENV || 'production'}                        ║
║  Health check: http://${HOST}:${PORT}/health               ║
║  Ping endpoint: http://${HOST}:${PORT}/ping                ║
╚════════════════════════════════════════════════════╝
  `);

    // Database connection is optional - routes handle missing DB gracefully
  });
} else {
  // On Vercel, database connection is handled by routes
  console.log('Running on Vercel serverless - database handled by routes');
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Prevent unhandled rejections from crashing server
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Export for testing
module.exports = { app, server };

// Export for Vercel serverless functions
module.exports.default = app;
