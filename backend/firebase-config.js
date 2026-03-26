/**
 * Firebase Configuration
 * Medical IoT Backend - Realtime Database
 */

const admin = require('firebase-admin');

// Check if Firebase is already initialized
if (!admin.apps.length) {
  // Initialize Firebase Admin SDK
  try {
  // Check for Firebase credentials
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  const privateKey = privateKeyRaw?.replace(/\\n/g, '\n');
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  console.log('Firebase config check:');
  console.log('  projectId:', projectId ? '(set)' : '(not set)', projectId || '');
  console.log('  privateKeyRaw:', privateKeyRaw ? '(set)' : '(not set)', privateKeyRaw ? '(length: ' + privateKeyRaw.length + ')' : '(not set)');
  console.log('  privateKey:', privateKey ? '(set)' : '(not set)', privateKey ? '(length: ' + privateKey.length + ')' : '(not set)');
  console.log('  clientEmail:', clientEmail ? '(set)' : '(not set)', clientEmail || '');

  if (projectId && privateKey && clientEmail) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        privateKey,
        clientEmail
      })
    });
    console.log('✅ Firebase Admin SDK initialized with credentials');
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Use Google Application Credentials (from service account file path)
    admin.initializeApp();
    console.log('✅ Firebase Admin SDK initialized with GOOGLE_APPLICATION_CREDENTIALS');
  } else {
    // No credentials found - throw error to prevent demo mode
    throw new Error('Firebase credentials not found. Please set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL environment variables.');
  }
  } catch (error) {
    console.error('Firebase initialization error:', error.message);
    // Re-throw to prevent app from starting without proper database
    throw error;
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