import { create } from 'zustand';
import { onAuthChange } from '../services/auth';
import { checkEntitlements, identifyUser, resetUser } from '../services/revenuecat';
import { markAppOpened } from '../services/notificationService';
import { markDeviceHadAccount } from '../services/welcome';

/**
 * Authentication store using Zustand
 * Manages user authentication state
 */
const useAuthStore = create((set) => ({
  user: null,
  isPrime: false,
  loading: true,
  error: null,

  /**
   * True only once Firebase's auth listener has actually reported. Distinct
   * from `!loading`, which the startup watchdog in app/index.js can force
   * without anything having resolved — so `!user && !authResolved` means "we
   * gave up waiting", not "there is no account". Routing that can only be
   * shown to a brand-new install (the welcome carousel) has to tell those
   * two apart, or a slow cold start would show it to a signed-in student.
   */
  authResolved: false,

  // Set Prime state
  setIsPrime: (isPrime) => set({ isPrime }),

  // Set user
  setUser: (user) => set({ user, loading: false, error: null }),

  // Clear user
  clearUser: () => set({ user: null, loading: false, error: null }),

  // Set loading state
  setLoading: (loading) => set({ loading }),

  // Set error
  setError: (error) => set({ error, loading: false }),

  // Clear error
  clearError: () => set({ error: null }),

  // Initialize auth listener
  initAuth: () => {
    try {
      console.log('[AuthStore] Initializing auth listener...');
      // A restored session is kept for as long as Firebase keeps it. There
      // used to be a forced sign-out here after 45 days without opening the
      // app, and it landed on exactly the students worth winning back: anyone
      // returning after the summer — or because a push reminded them of an
      // exam — met a login form instead of their plan, on an app whose whole
      // argument is coming back to it. Signing out is the student's call, from
      // Ajustes.
      const unsubscribe = onAuthChange(async (user) => {
        console.log('[AuthStore] Auth change detected. User:', user?.uid || 'guest');

        set({ user, loading: false, authResolved: true });

        if (user) {
          // The pre-login carousel is over for this device: anyone who has
          // ever been signed in here has no business seeing an intro again if
          // they later sign out. Covers the accounts that were already signed
          // in when the carousel shipped, which never passed through /welcome
          // and so never recorded anything themselves.
          markDeviceHadAccount();

          // Identify before checking entitlements, or the check would still
          // be reading whatever anonymous identity RevenueCat had before.
          await identifyUser(user.uid);
          const isPrime = await checkEntitlements();
          set({ isPrime });
          // Approximates "opened the app": fires on launch and on
          // login, not on every foreground resume from background —
          // good enough for a daily-granularity inactivity check.
          markAppOpened(user.uid);
        } else {
          await resetUser();
          set({ isPrime: false });
        }
      });
      return unsubscribe;
    } catch (error) {
      console.error('Firebase not configured:', error.message);
      // Set loading to false so app doesn't hang
      set({ user: null, loading: false, error: 'Firebase not configured' });
      // Return empty function to prevent errors
      return () => {};
    }
  },
}));

export default useAuthStore;
