import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut as firebaseSignOut,
    onAuthStateChanged
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from './firebase';

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

        return user;
    } catch (error) {
        console.error('Error signing up:', error);
        throw error;
    }
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
            error.userMessage = 'Error de red: No se pudo contactar con Firebase. Verifica tu conexión o dominios autorizados.';
        }
        throw error;
    }
};

/**
 * Sign in with Google OAuth
 * Uses redirect on web (more reliable in Expo web preview) and popup where available.
 * @returns {Promise<Object>} User object
 */
export const signInWithGoogle = async () => {
    try {
        const { signInWithRedirect, signInWithPopup, getRedirectResult } = await import('firebase/auth');

        // Use popup on web first; if it fails (blocked), fall back to redirect
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const user = result.user;

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

            return user;
        } catch (popupError) {
            // If popup was blocked or closed, try redirect flow
            const isBlockedOrCancelled = (
                popupError.code === 'auth/popup-blocked' ||
                popupError.code === 'auth/cancelled-popup-request' ||
                popupError.code === 'auth/popup-closed-by-user'
            );

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
};

/**
 * Check for Google redirect result on app load.
 * Call this once on startup (in _layout.js or auth store).
 */
export const checkGoogleRedirectResult = async () => {
    try {
        const { getRedirectResult } = await import('firebase/auth');
        const result = await getRedirectResult(auth);
        if (!result) return null;

        const user = result.user;
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
        return user;
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
