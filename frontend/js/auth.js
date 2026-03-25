import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, GithubAuthProvider, OAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

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
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();
const microsoftProvider = new OAuthProvider('microsoft.com');

// Auth functions
export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signInWithGitHub() {
  const result = await signInWithPopup(auth, githubProvider);
  return result.user;
}

export async function signInWithMicrosoft() {
  const result = await signInWithPopup(auth, microsoftProvider);
  return result.user;
}

export async function registerWithEmail(email, password) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function loginWithEmail(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function logoutUser() {
  await signOut(auth);
}

// Auth state
let subscribers = [];

export function subscribeToAuthState(callback) {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
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

export function getCurrentUser() {
  return auth.currentUser;
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