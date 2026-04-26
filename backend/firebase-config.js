const admin = require('firebase-admin');

if (!admin.apps.length) {
  console.log('Initializing Firebase...');

  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  // Handle different private key formats
  if (privateKey) {
    if (privateKey.includes('\\n')) {
      // Escaped newlines - convert to actual newlines
      privateKey = privateKey.replace(/\\n/g, '\n');
      console.log('Converted escaped newlines in private key');
    } else if (!privateKey.includes('\n')) {
      // No newlines at all - might be a single line, try to format it
      console.log('Private key appears to be single line, attempting to format...');
      // This is a fallback, but usually not needed
    }
  }

  console.log('Firebase Project ID:', process.env.FIREBASE_PROJECT_ID);
  console.log('Firebase Client Email:', process.env.FIREBASE_CLIENT_EMAIL ? 'Set' : 'Missing');
  console.log('Firebase Private Key:', privateKey ? 'Set (length: ' + privateKey.length + ')' : 'Missing');

  // Ensure we have all required environment variables
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
    console.error('Missing Firebase environment variables:', {
      projectId: !!process.env.FIREBASE_PROJECT_ID,
      clientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: !!privateKey
    });
    throw new Error('Firebase configuration incomplete');
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://iothealth-2335a-default-rtdb.firebaseio.com',
    });
    console.log('Firebase initialized successfully');
  } catch (error) {
    console.error('Firebase initialization failed:', error.message);
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