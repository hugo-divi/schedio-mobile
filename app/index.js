import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import useAuthStore from '../store/authStore';
import { needsOnboarding } from '../services/onboarding';
import { resolveGuestEntry } from '../services/welcome';
import SchedioSplash from '../components/SchedioSplash';

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

  // Where the student is headed, once we know. This used to be a `replace` the
  // moment it was decided; it is held instead so the splash animation and the
  // auth handshake can run at the same time rather than one after the other.
  // `SchedioSplash` leaves as soon as both are done.
  const [target, setTarget] = useState(null);
  // Set once the splash has finished leaving. Kept apart from the navigation
  // itself because the two don't always arrive in that order: the splash gives
  // up on its own after a hard cap, so it can finish with no route decided yet.
  const [splashDone, setSplashDone] = useState(false);
  const shown = useRef(false);

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
    // this, a stale pass could land its decision *after* the newer one and
    // send an account that just restored to the wrong screen.
    let cancelled = false;

    (async () => {
      let next;
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
        next = authResolved ? await resolveGuestEntry() : '/login';
      } else if (!user.emailVerified) {
        // Same gate login.js enforces — a restored session for a
        // password account that never verified shouldn't skip it.
        next = '/verify-email';
      } else {
        // Same as login.js: an account that abandoned onboarding goes back
        // into it rather than landing on a dashboard with no subjects.
        next = (await needsOnboarding(user.uid)) ? '/onboarding' : '/dashboard';
      }
      if (!cancelled) setTarget(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, user, authResolved]);

  // The native splash covers everything up to the animated one's first frame,
  // so this is the handover: hiding it any earlier would show a bare screen,
  // any later and the animation's opening frames would be hidden behind it.
  const handleShown = useCallback(() => {
    if (shown.current) return;
    shown.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // Deliberately dependency-free, so the splash's exit animation is never
  // restarted by this callback changing identity underneath it.
  const handleFinish = useCallback(() => setSplashDone(true), []);

  // Navigate once the splash has finished leaving — it fades and keeps rising,
  // and the destination fades in underneath it. Waiting on both means a splash
  // that hit its own cap before auth resolved still lands somewhere, instead of
  // stranding the student on a screen that has already faded out.
  useEffect(() => {
    if (splashDone && target) router.replace(target);
  }, [splashDone, target, router]);

  return <SchedioSplash ready={target !== null} onShown={handleShown} onFinish={handleFinish} />;
}
