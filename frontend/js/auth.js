// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCz59P_aeCNbqnBmQYMpQDNOQh70JBr35o",
  authDomain: "final-iot-delta.vercel.app",
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
    // Check if Firebase app already exists to prevent duplicate app error
    try {
      app = firebase.app(); // Try to get existing app
      console.log('Using existing Firebase app');
    } catch (e) {
      // App doesn't exist, initialize new one
      app = firebase.initializeApp(firebaseConfig);
      console.log('Initialized new Firebase app');
    }

    auth = firebase.auth(app);

    googleProvider = new firebase.auth.GoogleAuthProvider();
    githubProvider = new firebase.auth.GithubAuthProvider();
    microsoftProvider = new firebase.auth.OAuthProvider('microsoft.com');
  } else {
    console.error('Firebase SDK not loaded');
  }
}

// Auth functions with fallback handling
async function signInWithGoogle() {
  if (!firebaseInitialized || !auth) {
    console.warn('Firebase not available, using demo login');
    // Fallback: simulate successful login for demo purposes
    const demoUser = { displayName: 'Demo User', email: 'demo@healthmonitor.io', uid: 'demo123' };
    handleSuccessfulLogin(demoUser);
    return demoUser;
  }

  try {
    const result = await auth.signInWithPopup(googleProvider);
    handleSuccessfulLogin(result.user);
    return result.user;
  } catch (error) {
    console.error('Google sign-in error:', error);
    // If popup fails, try redirect method
    if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
      try {
        console.log('Retrying with redirect method...');
        await auth.signInWithRedirect(googleProvider);
        return null; // Redirect will reload page
      } catch (redirectError) {
        console.error('Redirect method also failed:', redirectError);
        throw redirectError;
      }
    }
    throw error;
  }
}

async function signInWithGitHub() {
  if (!firebaseInitialized || !auth) {
    console.warn('Firebase not available, using demo login');
    const demoUser = { displayName: 'Demo User', email: 'demo@github.com', uid: 'demo-github' };
    handleSuccessfulLogin(demoUser);
    return demoUser;
  }

  try {
    const result = await auth.signInWithPopup(githubProvider);
    handleSuccessfulLogin(result.user);
    return result.user;
  } catch (error) {
    console.error('GitHub sign-in error:', error);
    if (error.code === 'auth/popup-blocked') {
      try {
        await auth.signInWithRedirect(githubProvider);
        return null;
      } catch (redirectError) {
        throw redirectError;
      }
    }
    throw error;
  }
}

async function signInWithMicrosoft() {
  if (!firebaseInitialized || !auth) {
    console.warn('Firebase not available, using demo login');
    const demoUser = { displayName: 'Demo User', email: 'demo@microsoft.com', uid: 'demo-microsoft' };
    handleSuccessfulLogin(demoUser);
    return demoUser;
  }

  try {
    const result = await auth.signInWithPopup(microsoftProvider);
    handleSuccessfulLogin(result.user);
    return result.user;
  } catch (error) {
    console.error('Microsoft sign-in error:', error);
    if (error.code === 'auth/popup-blocked') {
      try {
        await auth.signInWithRedirect(microsoftProvider);
        return null;
      } catch (redirectError) {
        throw redirectError;
      }
    }
    throw error;
  }
}

async function registerWithEmail(email, password) {
  console.log('📧 Attempting Firebase email registration for:', email);

  if (!firebaseInitialized || !auth) {
    console.warn('Firebase not available, using demo registration');
    // Fallback: simulate successful registration for demo purposes
    const demoUser = { displayName: email.split('@')[0], email: email, uid: 'demo-' + Date.now() };
    handleSuccessfulLogin(demoUser);
    return demoUser;
  }

  try {
    console.log('🔐 Calling Firebase createUserWithEmailAndPassword...');
    const result = await auth.createUserWithEmailAndPassword(email, password);
    console.log('✅ Firebase registration successful:', result.user.email);
    handleSuccessfulLogin(result.user);
    return result.user;
  } catch (error) {
    console.error('❌ Firebase email registration error:', error.code, error.message);
    throw error;
  }
}

async function loginWithEmail(email, password) {
  if (!firebaseInitialized || !auth) {
    console.warn('Firebase not available, using demo login');
    // Fallback: simulate successful login for demo purposes
    const demoUser = { displayName: email.split('@')[0], email: email, uid: 'demo-' + Date.now() };
    handleSuccessfulLogin(demoUser);
    return demoUser;
  }

  try {
    const result = await auth.signInWithEmailAndPassword(email, password);
    handleSuccessfulLogin(result.user);
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
  if (!firebaseInitialized || !auth) return null;
  return auth.currentUser;
}

// Helper function to handle successful login
function handleSuccessfulLogin(user) {
  console.log('✅ Auth successful:', user.displayName || user.email);

  // Store user data in localStorage
  localStorage.setItem('isLoggedIn', 'true');
  localStorage.setItem('userName', user.displayName || user.email.split('@')[0] || 'User');
  localStorage.setItem('userEmail', user.email || '');
  localStorage.setItem('userId', user.uid || 'demo');

  // Redirect to dashboard
  window.location.href = 'dashboard.html';
}

// Initialize Firebase immediately when script loads
console.log('🔥 Initializing Firebase auth...');
let firebaseInitialized = false;

try {
  initializeFirebase();
  firebaseInitialized = true;
  console.log('🔍 Firebase config used:', {
    apiKey: firebaseConfig.apiKey ? '***' + firebaseConfig.apiKey.slice(-10) : 'missing',
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId
  });
} catch (error) {
  console.error('❌ Firebase initialization failed:', error);
  firebaseInitialized = false;
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