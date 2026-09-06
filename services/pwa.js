import { Platform } from 'react-native';

/**
 * Whether this web session is running as an installed PWA (added to the
 * home screen) rather than a normal browser tab. `display-mode: standalone`
 * is the standard signal; `navigator.standalone` is Safari's older,
 * iOS-specific flag, kept as a fallback for engines that don't report the
 * media feature.
 */
export const isStandalonePWA = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    window.navigator?.standalone === true
  );
};

/**
 * Whether this web session can actually be asked for notification
 * permission right now. Desktop and Android browsers support the
 * Notification API from a normal tab; iOS Safari only allows requesting
 * permission from a PWA already added to the home screen — asking from a
 * regular tab either silently fails or the API isn't even exposed,
 * depending on iOS version. There's no reliable feature-detection for that
 * iOS-specific restriction, so this checks the user agent for it.
 */
export const canRequestWebPush = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  const isIOS = /iphone|ipad|ipod/i.test(window.navigator?.userAgent ?? '');
  return isIOS ? isStandalonePWA() : true;
};

/**
 * Keeps the root element's real pixel height in sync with
 * `visualViewport.height` instead of the CSS `height: 100%` Expo's web
 * template ships (html, body, #root all inherit it). That percentage is
 * fixed to the *layout* viewport, which iOS Safari does not shrink when the
 * on-screen keyboard opens — only the separate `visualViewport` shrinks. Left
 * alone, the app keeps rendering at full pre-keyboard height while Safari
 * scrolls the page to reveal the focused input, so the bottom of the app
 * scrolls into view as a blank strip the size of the keyboard, and the
 * fields KeyboardAwareScrollView tries to reveal end up under it anyway —
 * everything this component is meant to prevent, undone one layer up. This
 * is a plain function (not a hook) so it can be called from a single
 * top-level effect without pulling React into a file that's otherwise just
 * platform checks.
 *
 * Native ignores this entirely: `window.visualViewport` doesn't exist there,
 * and the native keyboard-avoidance path (KeyboardAvoidingView,
 * KeyboardAwareScrollView) already handles it correctly on its own.
 */
export const syncViewportHeightToVisualViewport = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.visualViewport) {
    return () => {};
  }
  const root = document.getElementById('root');
  if (!root) return () => {};

  const apply = () => {
    root.style.height = `${window.visualViewport.height}px`;
  };
  apply();

  window.visualViewport.addEventListener('resize', apply);
  window.visualViewport.addEventListener('scroll', apply);
  return () => {
    window.visualViewport.removeEventListener('resize', apply);
    window.visualViewport.removeEventListener('scroll', apply);
    root.style.height = '';
  };
};
