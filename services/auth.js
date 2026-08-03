import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCredential,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendEmailVerification,
  GoogleAuthProvider,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { auth, googleProvider, db } from './firebase';

/** Creates the Firestore profile the first time this uid is seen. */
const ensureUserDoc = async (user) => {
  const userDoc = await getDoc(doc(db, 'users', user.uid));
  if (!userDoc.exists()) {
    await setDoc(doc(db, 'users', user.uid), {
      email: user.email,
      displayName: user.displayName || user.email.split('@')[0],
      photoURL: user.photoURL || null,
      createdAt: new Date(),
      onboardingCompleted: false,
    });
  }
};

/**
 * Register a new user with email and password
 * @param {string} email
 * @param {string} password
 * @param {string} displayName
 * @returns {Promise<Object>} User object
 */
export const signUp = async (email, password, displayName) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Create user profile in Firestore
    await setDoc(doc(db, 'users', user.uid), {
      email: user.email,
      displayName: displayName || email.split('@')[0],
      createdAt: new Date(),
      onboardingCompleted: false,
    });

    // Password accounts start unverified; Google accounts skip this
    // entirely because Google already verified the address.
    await sendEmailVerification(user);

    return user;
  } catch (error) {
    console.error('Error signing up:', error);
    throw error;
  }
};

/**
 * Re-sends the verification email to the currently signed-in user.
 */
export const resendVerificationEmail = async () => {
  if (!auth.currentUser) throw new Error('No hay ninguna sesión activa.');
  await sendEmailVerification(auth.currentUser);
};

/**
 * Pulls the latest `emailVerified` flag from Firebase — the SDK's cached user
 * object doesn't update on its own after the student clicks the email link,
 * it has to be asked to reload.
 */
export const refreshEmailVerified = async () => {
  if (!auth.currentUser) return false;
  await auth.currentUser.reload();
  return auth.currentUser.emailVerified;
};

/**
 * Sign in with email and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<Object>} User object
 */
export const signIn = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    console.error('[AuthService] Error signing in:', error.code, error.message);
    // Enrich error for UI
    if (error.code === 'auth/network-request-failed') {
      error.userMessage =
        'Error de red: No se pudo contactar con Firebase. Verifica tu conexión o dominios autorizados.';
    }
    throw error;
  }
};

/**
 * Sign in with Google.
 *
 * Web: Firebase's own popup/redirect flow — needs a browser window to attach
 * to, so it only works in Expo web.
 * Native (Android/iOS): there is no window for popup/redirect to use, so this
 * goes through the device's native Google account picker instead
 * (`@react-native-google-signin/google-signin`) and hands the resulting ID
 * token to Firebase as a credential.
 * @returns {Promise<Object|null>} User object, or null while a web redirect is in flight
 */
export const signInWithGoogle = async () => {
  if (Platform.OS === 'web') {
    try {
      const { signInWithRedirect, signInWithPopup } = await import('firebase/auth');

      // Use popup on web first; if it fails (blocked), fall back to redirect
      try {
        const result = await signInWithPopup(auth, googleProvider);
        await ensureUserDoc(result.user);
        return result.user;
      } catch (popupError) {
        const isBlockedOrCancelled =
          popupError.code === 'auth/popup-blocked' ||
          popupError.code === 'auth/cancelled-popup-request' ||
          popupError.code === 'auth/popup-closed-by-user';

        if (isBlockedOrCancelled) {
          console.log('Popup blocked, falling back to redirect...');
          await signInWithRedirect(auth, googleProvider);
          // Page will redirect — result handled on next load
          return null;
        }

        throw popupError;
      }
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  }

  try {
    const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC__GOOGLE_WEB_CLIENT_ID,
    });
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices();
    }

    const signInResult = await GoogleSignin.signIn();
    // v13+ nests the payload under `.data`; older versions return it flat.
    const idToken = signInResult?.data?.idToken ?? signInResult?.idToken;
    if (!idToken) throw new Error('Google no devolvió un idToken.');

    const credential = GoogleAuthProvider.credential(idToken);
    const userCredential = await signInWithCredential(auth, credential);
    await ensureUserDoc(userCredential.user);
    return userCredential.user;
  } catch (error) {
    console.error('Error signing in with Google (native):', error);
    throw error;
  }
};

/**
 * Check for Google redirect result on app load.
 * Call this once on startup (in _layout.js or auth store). Web only — native
 * sign-in resolves directly in `signInWithGoogle` and never redirects.
 */
export const checkGoogleRedirectResult = async () => {
  if (Platform.OS !== 'web') return null;
  try {
    const { getRedirectResult } = await import('firebase/auth');
    const result = await getRedirectResult(auth);
    if (!result) return null;

    await ensureUserDoc(result.user);
    return result.user;
  } catch (error) {
    console.error('Error checking redirect result:', error);
    return null;
  }
};

/**
 * Sign out the current user
 * @returns {Promise<void>}
 */
export const signOut = async () => {
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

/**
 * Subscribe to auth state changes
 * @param {Function} callback - Called with user object or null
 * @returns {Function} Unsubscribe function
 */
export const onAuthChange = (callback) => {
  return onAuthStateChanged(auth, callback);
};
