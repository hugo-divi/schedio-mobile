import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import useAuthStore from '../store/authStore';
import { needsOnboarding } from '../services/onboarding';
import { resolveGuestEntry } from '../services/welcome';

// The auth listener resolves on its own in practice (see
// store/authStore.js), but startup must never be able to hang behind the
// native splash forever if it somehow doesn't — same guard app/_layout.js
// applies to font loading.
const AUTH_TIMEOUT_MS = 5000;

export default function Home() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);
  const authResolved = useAuthStore((state) => state.authResolved);

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

    // The awaits below give `user` time to change underneath this run (the
    // auth listener resolving just after the watchdog gave up, say). Without
    // this, a stale pass could land its `replace` *after* the newer one and
    // send an account that just restored to the wrong screen.
    let cancelled = false;

    (async () => {
      if (!user) {
        // The welcome carousel is strictly pre-account, so it needs proof
        // there is no account — not merely that we stopped waiting for one.
        // `loading` is not that proof: the watchdog above clears it on a
        // timeout, and initAuth's catch clears it when Firebase fails to
        // start, both with `user` still null. Only `authResolved` means the
        // listener actually reported. When it hasn't, go straight to /login:
        // a signed-in student gets a login screen instead of an intro that
        // was never meant for them, and a genuinely new one still sees the
        // carousel on the next launch, since this run was never counted.
        const target = authResolved ? await resolveGuestEntry() : '/login';
        if (!cancelled) router.replace(target);
      } else if (!user.emailVerified) {
        // Same gate login.js enforces — a restored session for a
        // password account that never verified shouldn't skip it.
        if (!cancelled) router.replace('/verify-email');
      } else {
        // Same as login.js: an account that abandoned onboarding goes back
        // into it rather than landing on a dashboard with no subjects.
        const target = (await needsOnboarding(user.uid)) ? '/onboarding' : '/dashboard';
        if (!cancelled) router.replace(target);
      }
      // Only now — the native splash covers this whole decision, so the
      // student never sees anything but it until we know where they land.
      SplashScreen.hideAsync().catch(() => {});
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, user, authResolved, router]);

  return null;
}
