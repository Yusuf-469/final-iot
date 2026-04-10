/**
 * Firebase Configuration
 * Medical IoT Backend - Realtime Database
 */

const admin = require('firebase-admin');

// Check if Firebase is already initialized
if (!admin.apps.length) {
  // Initialize Firebase Admin SDK
  try {
  // Check for Firebase credentials - log environment status
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  const privateKey = privateKeyRaw?.replace(/\\n/g, '\n');
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const databaseURL = process.env.FIREBASE_DATABASE_URL;

  console.log('🔍 Firebase Environment Check:');
  console.log('  VERCEL_ENV:', process.env.VERCEL_ENV || 'not set');
  console.log('  NODE_ENV:', process.env.NODE_ENV || 'not set');
  console.log('  FIREBASE_PROJECT_ID:', projectId ? '(set)' : '(NOT SET)');
  console.log('  FIREBASE_PRIVATE_KEY:', privateKeyRaw ? '(set, length: ' + privateKeyRaw.length + ')' : '(NOT SET)');
  console.log('  FIREBASE_CLIENT_EMAIL:', clientEmail ? '(set)' : '(NOT SET)');
  console.log('  FIREBASE_DATABASE_URL:', databaseURL ? '(set)' : '(NOT SET)');

  if (projectId && privateKey && clientEmail) {
    console.log('🔧 Initializing Firebase Admin SDK with service account...');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        privateKey,
        clientEmail
      }),
      databaseURL: databaseURL || 'https://iothealth-2335a-default-rtdb.firebaseio.com'
    });

    console.log('✅ Firebase Admin SDK initialized successfully');
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log('🔧 Initializing Firebase Admin SDK with GOOGLE_APPLICATION_CREDENTIALS...');
    admin.initializeApp();
    console.log('✅ Firebase Admin SDK initialized with GOOGLE_APPLICATION_CREDENTIALS');
  } else {
    console.error('❌ CRITICAL: No Firebase credentials found!');
    console.error('   Required environment variables:');
    console.error('   - FIREBASE_PROJECT_ID');
    console.error('   - FIREBASE_PRIVATE_KEY');
    console.error('   - FIREBASE_CLIENT_EMAIL');
    console.error('   - FIREBASE_DATABASE_URL (optional, defaults to iothealth-2335a)');
    console.error('');
    console.error('   Please set these in your Vercel project environment variables.');
    console.error('   Server will continue but Firebase operations will fail.');
  }
  } catch (error) {
    console.error('❌ Firebase initialization FAILED:', error.message);
    console.error('   This will cause all API routes to return 500 errors.');
    console.error('   Check your Firebase credentials and environment variables.');
  }
}

// Export Realtime Database instance - handle case where app might not be properly initialized
let db = null;
let dbInitialized = false;

try {
  db = admin.database();
  dbInitialized = true;
  console.log('✅ Firebase Realtime Database initialized');
} catch (error) {
  console.warn('Could not initialize Realtime Database:', error.message);
}

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

module.exports = {
  admin,
  db,
  dbInitialized,
  COLLECTIONS,
  convertTimestamps
};