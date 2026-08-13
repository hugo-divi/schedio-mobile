import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import useAuthStore from '../store/authStore';
import { needsOnboarding } from '../services/onboarding';

// The auth listener resolves on its own in practice (see
// store/authStore.js), but startup must never be able to hang behind the
// native splash forever if it somehow doesn't — same guard app/_layout.js
// applies to font loading.
const AUTH_TIMEOUT_MS = 5000;

export default function Home() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);

  useEffect(() => {
    if (!loading) return;
    const timeout = setTimeout(() => useAuthStore.getState().setLoading(false), AUTH_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [loading]);

  useEffect(() => {
    // This used to route to /login unconditionally, ignoring whatever
    // Firebase had already restored — so a still-valid, persisted
    // session got no further than a login form the student had to fill
    // in again anyway. `loading` only clears once the auth listener has
    // resolved once (see store/authStore.js), so this waits for that
    // before deciding, rather than guessing on a fixed timer.
    if (loading) return;

    (async () => {
      if (!user) {
        router.replace('/login');
      } else if (!user.emailVerified) {
        // Same gate login.js enforces — a restored session for a
        // password account that never verified shouldn't skip it.
        router.replace('/verify-email');
      } else {
        // Same as login.js: an account that abandoned onboarding goes back
        // into it rather than landing on a dashboard with no subjects.
        router.replace((await needsOnboarding(user.uid)) ? '/onboarding' : '/dashboard');
      }
      // Only now — the native splash covers this whole decision, so the
      // student never sees anything but it until we know where they land.
      SplashScreen.hideAsync().catch(() => {});
    })();
  }, [loading, user, router]);

  return null;
}
