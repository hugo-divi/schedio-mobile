import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Pre-account routing state for the welcome carousel (`app/welcome.js`).
 *
 * Device-local on purpose: the carousel runs *before* there is an account, so
 * there is no user document to record it against.
 *
 * This used to be a single "has seen the carousel" boolean, which conflated
 * two different facts and got both wrong. One tap on "Saltar" set it, so a
 * mis-tap buried the only explanation of what Schedio is, forever; and
 * store/authStore.js set it on every signed-in launch, which is right for
 * "this device has had an account" but has nothing to do with having *seen*
 * anything. What actually governs the decision is two independent things:
 *
 *   1. Has any account ever signed in on this device? If so the carousel is
 *      over for good — it is an intro for strangers, and someone who signs
 *      out is not a stranger.
 *   2. How many times has a guest opened the app? The largest group in the
 *      funnel is the one that opens, doesn't register, and comes back. Meeting
 *      them with a cold login form wastes the visit; replaying the full pitch
 *      every time nags them. So it decays: the whole story once, then just the
 *      closing screen, then nothing.
 *
 * Read directly from AsyncStorage rather than through a persisted zustand
 * store: those rehydrate asynchronously, and the routing decision in
 * `app/index.js` happens early enough that it could read a not-yet-hydrated
 * value and send the wrong person to the wrong screen.
 */

const HAD_ACCOUNT = 'schedio-device-had-account';
const GUEST_LAUNCHES = 'schedio-guest-launches';

/**
 * Guest launches that still get the pitch. Past this the login screen's
 * "¿Qué es Schedio?" link is the only way back in — on request, never pushed.
 */
const MAX_GUEST_LAUNCHES = 3;

/**
 * Cached for the rest of the app run. `app/index.js` resolves inside an effect
 * whose dependencies (`loading`, `authResolved`) change in separate zustand
 * notifications on the watchdog path, so it can legitimately run twice in one
 * cold start. Without this, a single launch would burn two of the three the
 * student is allotted — and the destination would be free to change
 * underneath them mid-run, which nothing downstream expects.
 */
let resolvedThisRun = null;

/**
 * Where a launch with no restored session should land. Counts the launch as
 * it goes, so it must only be called once the auth listener has actually
 * reported no user — see the `authResolved` guard in `app/index.js`.
 */
export async function resolveGuestEntry() {
  if (resolvedThisRun) return resolvedThisRun;

  let target = '/login';
  try {
    if ((await AsyncStorage.getItem(HAD_ACCOUNT)) !== 'true') {
      // A corrupt or missing value reads as 0, which shows the pitch again
      // rather than swallowing it — the friendlier way to be wrong here.
      const launches = Number(await AsyncStorage.getItem(GUEST_LAUNCHES)) || 0;

      if (launches === 0) {
        target = '/welcome';
      } else if (launches < MAX_GUEST_LAUNCHES) {
        // They have already been told what the problem is. Open on the
        // closing screen — the outcome and the "Crear cuenta" button — and
        // leave the first two pages a swipe away for anyone who wants them.
        target = '/welcome?start=outcome';
      }

      // Saturates instead of counting up forever: past the cap the number
      // stops meaning anything, and there is no reason to keep writing it.
      if (launches < MAX_GUEST_LAUNCHES) {
        await AsyncStorage.setItem(GUEST_LAUNCHES, String(launches + 1));
      }
    }
  } catch (error) {
    // Failing closed means "straight to login": a storage error should never
    // strand someone in front of an intro instead of the app they came for.
    console.warn('[Welcome] Could not resolve the guest entry point:', error?.message);
    target = '/login';
  }

  resolvedThisRun = target;
  return target;
}

/**
 * Called from store/authStore.js on every launch that has a signed-in user,
 * which also covers the accounts that were already signed in when this
 * shipped and so never passed through the carousel themselves.
 */
export async function markDeviceHadAccount() {
  try {
    await AsyncStorage.setItem(HAD_ACCOUNT, 'true');
  } catch (error) {
    // Worst case the carousel shows once more after a sign-out.
    console.warn('[Welcome] Could not persist the account flag:', error?.message);
  }
}

/**
 * Development only. Verifying the four states above otherwise means wiping the
 * app's data four times over — `expo start --clear` empties the bundler cache,
 * not AsyncStorage — which is exactly why this decay was easy to write and
 * unpleasant to check by hand.
 */
export async function resetWelcomeState() {
  resolvedThisRun = null;
  await AsyncStorage.multiRemove([HAD_ACCOUNT, GUEST_LAUNCHES]);
}
