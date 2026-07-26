import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeAuth,
  getReactNativePersistence,
  getAuth,
  GoogleAuthProvider,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Replace with your actual config
// 🛡️ SECURITY NOTE: Firebase Frontend Keys are not secret by design.
// They are used to identify your project. Real security resides in Firebase Rules.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC__FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC__FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC__FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC__FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC__FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC__FIREBASE_APP_ID,
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth with Platform-specific Persistence.
// On native, `firebase/auth` must resolve to @firebase/auth's react-native
// build for getReactNativePersistence to exist — Metro does this via its
// `react-native` export condition. Requires firebase >= 12: older versions
// could end up with duplicate nested @firebase/auth copies, which made
// initializeApp and getAuth disagree on the component registry and failed
// with "Component auth has not been registered yet".
let auth;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  try {
    // Attempt to initialize with persistence first
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e) {
    // Expected on hot reload: auth is already initialized for this app.
    // Anything else is a real failure, so surface it instead of hiding it.
    if (e?.code !== 'auth/already-initialized') {
      console.warn('[Firebase] initializeAuth failed, falling back to getAuth:', e);
    }
    auth = getAuth(app);
  }
}

export { auth };
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
