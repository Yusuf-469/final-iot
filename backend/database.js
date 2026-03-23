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
  // If db is not initialized (no credentials), throw error to prevent demo mode
  if (!dbInitialized || !db) {
    throw new Error('Firebase not initialized. Please set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL environment variables.');
  }
  
  try {
    // Test Firestore connection by attempting to read from a collection
    const testDoc = await db.collection(COLLECTIONS.PATIENTS).limit(1).get();
    console.log('✅ Firebase Firestore connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Firebase connection error:', error.message);
    throw error;
  }
};

/**
 * Get database connection status
 * @returns {boolean} - True if connected
 */
const getDbConnected = () => {
  try {
    // Simple check - if db exists and is initialized, we assume connected
    return !!db && dbInitialized;
  } catch (error) {
    return false;
  }
};

/**
 * Get Firestore instance
 * @returns {FirebaseFirestore.Firestore|null} - Firestore instance or null
 */
const getDb = () => dbInitialized ? db : null;

/**
 * Collection reference helper
 * @param {string} collectionName - Name of the collection
 * @returns {FirebaseFirestore.CollectionReference|null} - Collection reference or null
 */
const collection = (collectionName) => {
  if (!dbInitialized || !db) return null;
  return db.collection(collectionName);
};

/**
 * Document reference helper
 * @param {string} collectionName - Name of the collection
 * @param {string} docId - Document ID
 * @returns {FirebaseFirestore.DocumentReference|null} - Document reference or null
 */
const doc = (collectionName, docId) => {
  if (!dbInitialized || !db) return null;
  return db.collection(collectionName).doc(docId);
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
