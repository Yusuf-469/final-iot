// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCz59P_aeCNbqnBmQYMpQDNOQh70JBr35o",
  authDomain: "healthmonitor-zeta.vercel.app",
  databaseURL: "https://iothealth-2335a-default-rtdb.firebaseio.com",
  projectId: "iothealth-2335a",
  storageBucket: "iothealth-2335a.firebasestorage.app",
  messagingSenderId: "346846344297",
  appId: "1:346846344297:web:870d295b32646e58b25ef8",
  measurementId: "G-ZSL6D941JK"
};

// Initialize Firebase (assuming Firebase scripts are loaded globally)
let app, auth, googleProvider, githubProvider, microsoftProvider;

// Firebase v8 compatibility
function initializeFirebase() {
  if (typeof firebase !== 'undefined') {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth(app);

    googleProvider = new firebase.auth.GoogleAuthProvider();
    githubProvider = new firebase.auth.GithubAuthProvider();
    microsoftProvider = new firebase.auth.OAuthProvider('microsoft.com');
  } else {
    console.error('Firebase SDK not loaded');
  }
}

// Auth functions
async function signInWithGoogle() {
  if (!auth) throw new Error('Firebase not initialized');
  try {
    const result = await auth.signInWithPopup(googleProvider);
    return result.user;
  } catch (error) {
    console.error('Google sign-in error:', error);
    throw error;
  }
}

async function signInWithGitHub() {
  if (!auth) throw new Error('Firebase not initialized');
  try {
    const result = await auth.signInWithPopup(githubProvider);
    return result.user;
  } catch (error) {
    console.error('GitHub sign-in error:', error);
    throw error;
  }
}

async function signInWithMicrosoft() {
  if (!auth) throw new Error('Firebase not initialized');
  try {
    const result = await auth.signInWithPopup(microsoftProvider);
    return result.user;
  } catch (error) {
    console.error('Microsoft sign-in error:', error);
    throw error;
  }
}

async function registerWithEmail(email, password) {
  console.log('📧 Attempting Firebase email registration for:', email);
  if (!auth) {
    console.error('❌ Firebase auth not available');
    throw new Error('Firebase not initialized');
  }
  try {
    console.log('🔐 Calling Firebase createUserWithEmailAndPassword...');
    const result = await auth.createUserWithEmailAndPassword(email, password);
    console.log('✅ Firebase registration successful:', result.user.email);
    return result.user;
  } catch (error) {
    console.error('❌ Firebase email registration error:', error.code, error.message);
    throw error;
  }
}

async function loginWithEmail(email, password) {
  if (!auth) throw new Error('Firebase not initialized');
  try {
    const result = await auth.signInWithEmailAndPassword(email, password);
    return result.user;
  } catch (error) {
    console.error('Email login error:', error);
    throw error;
  }
}

async function logoutUser() {
  if (!auth) throw new Error('Firebase not initialized');
  try {
    await firebase.auth().signOut();
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
}

// Auth state
let subscribers = [];
let unsubscribeFunction = null;

function subscribeToAuthState(callback) {
  if (!unsubscribeFunction) {
    unsubscribeFunction = auth.onAuthStateChanged((user) => {
      subscribers.forEach(cb => cb(user));
    });
  }

  subscribers.push(callback);
  // Call immediately with current user
  auth.onAuthStateChanged(callback);

  return () => {
    subscribers = subscribers.filter(cb => cb !== callback);
    if (subscribers.length === 0 && unsubscribeFunction) {
      unsubscribeFunction();
      unsubscribeFunction = null;
    }
  };
}

function getCurrentUser() {
  return auth.currentUser;
}

// Initialize Firebase immediately when script loads
console.log('🔥 Initializing Firebase auth...');
try {
  initializeFirebase();
  console.log('🔍 Firebase config used:', {
    apiKey: firebaseConfig.apiKey ? '***' + firebaseConfig.apiKey.slice(-10) : 'missing',
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId
  });
} catch (error) {
  console.error('❌ Firebase initialization failed:', error);
}

// Attach to window for use in other files
window.auth = {
  signInWithGoogle,
  signInWithGitHub,
  signInWithMicrosoft,
  registerWithEmail,
  loginWithEmail,
  logoutUser,
  subscribeToAuthState,
  getCurrentUser
};
console.log('✅ Firebase auth initialized, window.auth available:', !!window.auth);
console.log('🚀 window.auth object created with methods:', Object.keys(window.auth));