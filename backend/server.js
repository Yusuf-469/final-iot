/**
 * Medical IoT Backend Server
 * Main Express application entry point
 */

// Load environment variables early
require('dotenv').config();

// Express setup
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');

// Database (now Firebase)
const { connectDB, getDbConnected } = require('./database');

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

// Legacy routes (redirect)
app.use('/api/login', require('./routes/auth'));
app.use('/api/signup', require('./routes/auth'));

// ============================================
// FRONTEND ROUTES (SPA support)
// ============================================

// Serve index.html for all non-API routes (SPA)
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path.startsWith('/ready') || req.path.startsWith('/ping')) {
    return res.status(404).json({ error: 'Not found' });
  }
  
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
  } else {
    filePath = path.join(filePath, 'index.html');
  }
  
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).json({ error: 'Page not found' });
    }
  });
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// ============================================
// SERVER STARTUP
// ============================================

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
  
  // Connect to database (required for production)
  connectDB().then(dbReady => {
    if (!dbReady) {
      console.error('✗ Firebase connection failed - shutting down');
      process.exit(1);
    }
  });
});

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
