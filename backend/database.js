/**
 * Firebase Firestore Database Service
 * Medical IoT Backend - Firestore Database
 */

const { db, COLLECTIONS, convertTimestamps, dbInitialized } = require('./firebase-config');

/**
 * Initialize database connection
 * @returns {Promise<boolean>} - True if successful
 */
const connectDB = async () => {
  // If db is not initialized (no credentials), just log and return false
  if (!dbInitialized || !db) {
    console.warn('⚠️  Firebase not initialized. Database operations will return fallback data.');
    return false;
  }

  try {
    // Test Realtime Database connection
    const testRef = db.ref('test');
    await testRef.set({ test: true });
    await testRef.remove();
    console.log('✅ Firebase Realtime Database connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Firebase connection error:', error.message);
    return false;
  }
};

/**
 * Get database connection status
 * @returns {boolean} - True if connected
 */
const getDbConnected = () => {
  try {
    const connected = !!db && dbInitialized;
    console.log('🔍 Database connection status:', connected ? 'CONNECTED' : 'NOT CONNECTED');
    return connected;
  } catch (error) {
    console.error('❌ Error checking database connection:', error.message);
    return false;
  }
};

/**
 * Get Realtime Database instance
 * @returns {FirebaseDatabase|null} - Database instance or null
 */
const collection = (collectionName) => {
  console.log('🔍 Collection request for:', collectionName);
  console.log('  db exists:', !!db);
  console.log('  dbInitialized:', dbInitialized);

  if (!dbInitialized || !db) {
    console.warn('⚠️  Database not available, returning null for collection:', collectionName);
    return null;
  }

  try {
    const ref = db.ref(collectionName);
    console.log('✅ Created database reference for:', collectionName);
    return ref;
  } catch (error) {
    console.error('❌ Error creating database reference for', collectionName, ':', error.message);
    return null;
  }
};

/**
 * Get Realtime Database instance
 * @returns {FirebaseDatabase|null} - Database instance or null
 */
const getDb = () => dbInitialized ? db : null;

/**
 * Reference helper for collections (Realtime Database paths)
 * @param {string} collectionName - Name of the collection/path
 * @returns {FirebaseDatabase.Reference|null} - Database reference or null
 */
const collection = (collectionName) => {
  if (!dbInitialized || !db) return null;
  return db.ref(collectionName);
};

/**
 * Reference helper for documents (Realtime Database child paths)
 * @param {string} collectionName - Name of the collection/path
 * @param {string} itemId - Item ID/key
 * @returns {FirebaseDatabase.Reference|null} - Database reference or null
 */
const doc = (collectionName, itemId) => {
  if (!dbInitialized || !db) return null;
  return db.ref(`${collectionName}/${itemId}`);
};

module.exports = {
  db,
  COLLECTIONS,
  connectDB,
  getDbConnected,
  getDb,
  collection,
  doc,
  convertTimestamps
};
