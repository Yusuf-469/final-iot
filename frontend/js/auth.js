/**
 * Social sign-in (Google / GitHub / Microsoft) via Firebase Auth.
 *
 * Firebase only proves who the user is. The resulting ID token is exchanged at
 * POST /api/auth/firebase for the app's own session token, so every sign-in
 * method ends up with the same kind of session (see js/session.js).
 *
 * Requires the Firebase v8 SDK (firebase-app.js + firebase-auth.js) to be loaded first.
 */
(function () {
  const firebaseConfig = {
    apiKey: 'AIzaSyCz59P_aeCNbqnBmQYMpQDNOQh70JBr35o',
    authDomain: 'iothealth-2335a.firebaseapp.com',
    databaseURL: 'https://iothealth-2335a-default-rtdb.firebaseio.com',
    projectId: 'iothealth-2335a',
    storageBucket: 'iothealth-2335a.firebasestorage.app',
    messagingSenderId: '346846344297',
    appId: '1:346846344297:web:870d295b32646e58b25ef8',
    measurementId: 'G-ZSL6D941JK'
  };

  let auth = null;

  function init() {
    if (typeof firebase === 'undefined' || !firebase.auth) return null;
    if (auth) return auth;
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
    auth = firebase.auth(app);
    return auth;
  }

  function provider(name) {
    let p;
    if (name === 'google') p = new firebase.auth.GoogleAuthProvider();
    else if (name === 'github') p = new firebase.auth.GithubAuthProvider();
    else if (name === 'microsoft') p = new firebase.auth.OAuthProvider('microsoft.com');
    else throw new Error('Unsupported provider');
    if (name !== 'github') p.setCustomParameters({ prompt: 'select_account' });
    return p;
  }

  const FRIENDLY_ERRORS = {
    'auth/popup-closed-by-user': 'Sign-in window was closed before finishing.',
    'auth/cancelled-popup-request': 'Sign-in was cancelled.',
    'auth/popup-blocked': 'Your browser blocked the sign-in popup. Allow popups for this site and try again.',
    'auth/account-exists-with-different-credential': 'This email is already linked to a different sign-in method.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled yet. Please use email and password.',
    'auth/unauthorized-domain': 'Social sign-in is not enabled for this domain yet. Please use email and password.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.'
  };

  function friendly(error) {
    return FRIENDLY_ERRORS[error && error.code] || (error && error.message) || 'Sign-in failed. Please try again.';
  }

  /**
   * Opens the provider popup and returns { token, user } from our backend.
   * Throws an Error with a user-friendly message on failure.
   */
  async function signInWith(name) {
    const a = init();
    if (!a) throw new Error('Social sign-in is unavailable right now. Please use email and password.');

    let result;
    try {
      result = await a.signInWithPopup(provider(name));
    } catch (error) {
      throw new Error(friendly(error));
    }

    const idToken = await result.user.getIdToken();
    const res = await fetch('/api/auth/firebase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      a.signOut().catch(() => {});
      throw new Error(data.error || 'Sign-in failed. Please try again.');
    }

    if (window.session) window.session.save(data.token, data.user);
    return data;
  }

  window.auth = {
    signIn: signInWith,
    signInWithGoogle: () => signInWith('google'),
    signInWithGitHub: () => signInWith('github'),
    signInWithMicrosoft: () => signInWith('microsoft'),
    // Kept for pages that read the Firebase profile (e.g. settings)
    getCurrentUser: () => (init() ? auth.currentUser : null),
    logoutUser: () => (init() ? auth.signOut() : Promise.resolve())
  };
  // Older page scripts call initializeFirebase() directly
  window.initializeFirebase = init;

  init();
})();
