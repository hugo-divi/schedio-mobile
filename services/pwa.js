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
