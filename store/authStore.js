import { create } from 'zustand';
import { onAuthChange, isSessionExpired, signOut, touchSession } from '../services/auth';
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
      // Firebase fires this listener once immediately with whatever session
      // it already had persisted before this call — that first event is the
      // only one that can legitimately be a stale, weeks-old session. Every
      // later event within this same app run was triggered by an
      // interactive signIn/signUp/signOut call, which writes its own fresh
      // `markSessionStart()` timestamp — but *after* the credential promise
      // resolves, racing this very listener. On a device with no timestamp
      // yet (fresh install, fresh emulator), that race lost: a brand-new
      // login read `isSessionExpired()` before the write landed, saw no
      // record, and immediately force-signed the student back out.
      let isRestoringSession = true;
      const unsubscribe = onAuthChange(async (user) => {
        console.log('[AuthStore] Auth change detected. User:', user?.uid || 'guest');
        const checkingRestoredSession = isRestoringSession;
        isRestoringSession = false;

        // Firebase's refresh token doesn't expire on its own, so a restored
        // session is otherwise good forever. Force a fresh login after a
        // stretch of not opening the app instead of trusting it indefinitely.
        // Only checked when restoring a session from before this app run —
        // see the comment above `isRestoringSession`.
        if (user && checkingRestoredSession && (await isSessionExpired())) {
          console.log('[AuthStore] Session unused for too long, signing out.');
          await signOut();
          return; // onAuthChange fires again with user=null; that pass sets state
        }

        set({ user, loading: false, authResolved: true });

        if (user) {
          // Survived the check above, so this counts as using the app: push
          // the clock forward. Without this the window would measure time
          // since the last password was typed, and a student who opens
          // Schedio daily would be signed out on the same schedule as one who
          // had not opened it at all.
          touchSession();

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
