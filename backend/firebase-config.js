const admin = require('firebase-admin');

if (!admin.apps.length) {
  console.log('🔥 Initializing Firebase Admin...');

  // Handle private key: if it contains escaped newlines (\n), convert to actual newlines
  // If already formatted with newlines, use as-is
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (privateKey && privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
    console.log('🔑 Converted escaped newlines in private key');
  }

  console.log('📋 Firebase Config:', {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL ? 'Set' : 'Missing',
    privateKey: privateKey ? `Set (${privateKey.length} chars)` : 'Missing',
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://iothealth-2335a-default-rtdb.firebaseio.com',
    });
    console.log('✅ Firebase Admin initialized successfully');
  } catch (error) {
    console.error('❌ Firebase Admin initialization failed:', error.message);
    console.error('Stack:', error.stack);
    throw error;
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