const admin = require('firebase-admin');

// Initialize Firebase with environment variables for full functionality
console.log('🔄 Initializing Firebase...');
console.log('Environment check:', {
  hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
  hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
  hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
  hasDatabaseURL: !!process.env.FIREBASE_DATABASE_URL,
  privateKeyLength: process.env.FIREBASE_PRIVATE_KEY?.length,
  nodeEnv: process.env.NODE_ENV
});

if (!admin.apps.length) {
  // Check if we have credentials (production mode)
  if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    try {
      console.log('🔐 Initializing with Admin SDK credentials...');
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID || 'iothealth-2335a',
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://iothealth-2335a-default-rtdb.firebaseio.com',
      });
      console.log('✅ Firebase initialized with Admin SDK credentials');
    } catch (error) {
      console.error('❌ Firebase Admin SDK initialization failed:', error.message);
      console.error('Falling back to public access mode');
      // Fallback to public access
      admin.initializeApp({
        projectId: 'iothealth-2335a',
        databaseURL: 'https://iothealth-2335a-default-rtdb.firebaseio.com',
      });
      console.log('⚠️ Firebase initialized in public access mode (fallback)');
    }
  } else {
    console.log('⚠️ No Firebase credentials found, using public access mode');
    // Fallback to public access (development mode)
    admin.initializeApp({
      projectId: 'iothealth-2335a',
      databaseURL: 'https://iothealth-2335a-default-rtdb.firebaseio.com',
    });
    console.log('⚠️ Firebase initialized in public access mode (no auth)');
  }
}

const db = admin.database();

// Collection names
const COLLECTIONS = {
  USERS: 'users',
  PATIENTS: 'patients',
  DEVICES: 'devices',
  HEALTH_DATA: 'healthData',
  ALERTS: 'alerts'
};

// Helper to convert timestamps to ISO strings (for Realtime Database)
const convertTimestamps = (data) => {
  if (!data) return data;
  if (Array.isArray(data)) {
    return data.map(item => convertTimestamps(item));
  }
  if (typeof data === 'object') {
    const converted = {};
    for (const [key, value] of Object.entries(data)) {
      // Convert timestamp objects to ISO strings
      if (value && typeof value === 'object' && (value.seconds || value._seconds)) {
        converted[key] = new Date((value.seconds || value._seconds) * 1000).toISOString();
      } else {
        converted[key] = convertTimestamps(value);
      }
    }
    return converted;
  }
  return data;
};

const dbInitialized = !!db;

module.exports = {
  admin,
  db,
  dbInitialized,
  COLLECTIONS,
  convertTimestamps
};