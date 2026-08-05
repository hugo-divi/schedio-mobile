import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { LoadingScreen } from '../components/LoadingScreen';
import useAuthStore from '../store/authStore';
import { needsOnboarding } from '../services/onboarding';

export default function Home() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);

  useEffect(() => {
    // This used to route to /login unconditionally, ignoring whatever
    // Firebase had already restored — so a still-valid, persisted
    // session got no further than a login form the student had to fill
    // in again anyway. `loading` only clears once the auth listener has
    // resolved once (see store/authStore.js), so this waits for that
    // before deciding, rather than guessing on a fixed timer.
    if (loading) return;

    // Small delay to show branding rather than a hard cut.
    const timer = setTimeout(async () => {
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
    }, 1200);

    return () => clearTimeout(timer);
  }, [loading, user, router]);

  return <LoadingScreen />;
}
