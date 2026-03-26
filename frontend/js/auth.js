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

function initializeFirebase() {
  if (typeof firebase !== 'undefined') {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();

    googleProvider = new firebase.auth.GoogleAuthProvider();
    githubProvider = new firebase.auth.GithubAuthProvider();
    microsoftProvider = new firebase.auth.OAuthProvider('microsoft.com');
  } else {
    console.error('Firebase SDK not loaded');
  }
}

// Auth functions
async function signInWithGoogle() {
  try {
    const result = await auth.signInWithPopup(googleProvider);
    return result.user;
  } catch (error) {
    console.error('Google sign-in error:', error);
    throw error;
  }
}

async function signInWithGitHub() {
  try {
    const result = await auth.signInWithPopup(githubProvider);
    return result.user;
  } catch (error) {
    console.error('GitHub sign-in error:', error);
    throw error;
  }
}

async function signInWithMicrosoft() {
  try {
    const result = await auth.signInWithPopup(microsoftProvider);
    return result.user;
  } catch (error) {
    console.error('Microsoft sign-in error:', error);
    throw error;
  }
}

async function registerWithEmail(email, password) {
  try {
    const result = await auth.createUserWithEmailAndPassword(email, password);
    return result.user;
  } catch (error) {
    console.error('Email registration error:', error);
    throw error;
  }
}

async function loginWithEmail(email, password) {
  try {
    const result = await auth.signInWithEmailAndPassword(email, password);
    return result.user;
  } catch (error) {
    console.error('Email login error:', error);
    throw error;
  }
}

async function logoutUser() {
  try {
    await auth.signOut();
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
  callback(auth.currentUser);

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

// Initialize Firebase when DOM is ready
document.addEventListener('DOMContentLoaded', initializeFirebase);

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