const admin = require('firebase-admin');

if (!admin.apps.length) {
  // Decode base64 encoded private key from Vercel environment variable
  const encodedPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
  let privateKey;

  if (encodedPrivateKey) {
    try {
      // Decode from base64
      privateKey = Buffer.from(encodedPrivateKey, 'base64').toString('ascii');
      // If still contains escaped newlines (for local compatibility), convert them
      if (privateKey.includes('\\n')) {
        privateKey = privateKey.replace(/\\n/g, '\n');
      }
    } catch (error) {
      console.error('Failed to decode Firebase private key:', error);
      throw new Error('Invalid FIREBASE_PRIVATE_KEY format');
    }
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
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