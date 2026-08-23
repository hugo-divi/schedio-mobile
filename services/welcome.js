import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Whether this device has already been shown the pre-login welcome carousel
 * (`app/welcome.js`).
 *
 * Device-local on purpose: the carousel runs *before* there is an account, so
 * there is no user document to record it against. Only `app/index.js` reads
 * it, and only on the branch where no session was restored — a student who is
 * already signed in never reaches that branch, so the carousel cannot appear
 * for them regardless of this flag.
 *
 * Read directly from AsyncStorage rather than through a persisted zustand
 * store: those rehydrate asynchronously, and the routing decision in
 * `app/index.js` happens early enough that it could read a not-yet-hydrated
 * `false` and show the carousel to someone who had already dismissed it.
 */
const KEY = 'schedio-welcome-seen';

export async function hasSeenWelcome() {
  try {
    return (await AsyncStorage.getItem(KEY)) === 'true';
  } catch (error) {
    // Failing closed here means "already seen": a storage error should send a
    // returning student straight to login, never trap them behind an intro
    // they have dismissed before.
    console.warn('[Welcome] Could not read the seen flag:', error?.message);
    return true;
  }
}

export async function markWelcomeSeen() {
  try {
    await AsyncStorage.setItem(KEY, 'true');
  } catch (error) {
    // Worst case it shows once more on the next cold start.
    console.warn('[Welcome] Could not persist the seen flag:', error?.message);
  }
}
