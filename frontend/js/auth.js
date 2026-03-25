// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCz59P_aeCNbqnBmQYMpQDNOQh70JBr35o",
  authDomain: "iothealth-2335a.firebaseapp.com",
  databaseURL: "https://iothealth-2335a-default-rtdb.firebaseio.com",
  projectId: "iothealth-2335a",
  storageBucket: "iothealth-2335a.firebasestorage.app",
  messagingSenderId: "346846344297",
  appId: "1:346846344297:web:870d295b32646e58b25ef8",
  measurementId: "G-ZSL6D941JK"
};

// Initialize Firebase
let firebaseApp = null;
let auth = null;

function initializeFirebase() {
  if (!firebaseApp) {
    firebaseApp = firebase.initializeApp(firebaseConfig);
    auth = firebaseApp.auth();
  }
  return auth;
}

// Initialize Firebase on load
initializeFirebase();

const googleProvider = new firebase.auth.GoogleAuthProvider();
const githubProvider = new firebase.auth.GithubAuthProvider();
const microsoftProvider = new firebase.auth.OAuthProvider('microsoft.com');

// Auth functions
async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

async function signInWithGitHub() {
  const result = await signInWithPopup(auth, githubProvider);
  return result.user;
}

async function signInWithMicrosoft() {
  const result = await signInWithPopup(auth, microsoftProvider);
  return result.user;
}

async function registerWithEmail(email, password) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user;
}

async function loginWithEmail(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

async function logoutUser() {
  await signOut(auth);
}

// Auth state
let subscribers = [];

function subscribeToAuthState(callback) {
  if (!firebaseApp) {
    initializeFirebase();
  }

  const unsubscribe = auth.onAuthStateChanged((user) => {
    subscribers.forEach(cb => cb(user));
  });

  subscribers.push(callback);
  // Call immediately with current user
  callback(auth.currentUser);

  return () => {
    subscribers = subscribers.filter(cb => cb !== callback);
    if (subscribers.length === 0) {
      unsubscribe();
    }
  };
}

function getCurrentUser() {
  if (!firebaseApp) {
    initializeFirebase();
  }
  return auth.currentUser;
}

// Attach to window
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