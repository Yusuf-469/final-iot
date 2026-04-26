const admin = require('firebase-admin');

if (!admin.apps.length) {
  // Handle private key: if it contains escaped newlines (\n), convert to actual newlines
  // If already formatted with newlines, use as-is
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (privateKey && privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
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