import { Platform } from 'react-native';

/**
 * Enables native crash reporting, and hooks unhandled JS errors into it too —
 * @react-native-firebase/crashlytics only auto-captures native crashes on its
 * own, not JS exceptions.
 *
 * Off in dev builds: a crash while iterating locally isn't a signal worth
 * mixing into what testers actually hit.
 *
 * Everything here is wrapped and imported dynamically, on purpose: this is
 * the first release carrying @react-native-firebase, untested on a real
 * device before now, and a crash-reporting module that can itself crash the
 * app on startup — whether from the native module not linking, an init
 * order issue, whatever — defeats the point and takes the rest of the app
 * down with it. A failure here should mean "no crash reports", never "no app".
 */
export const initCrashlytics = async () => {
  if (Platform.OS === 'web' || __DEV__) return;

  try {
    const { default: crashlytics } = await import('@react-native-firebase/crashlytics');
    await crashlytics().setCrashlyticsCollectionEnabled(true);

    const previousHandler = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error, isFatal) => {
      crashlytics()
        .recordError(error)
        .catch(() => {});
      previousHandler(error, isFatal);
    });
  } catch (error) {
    console.warn('[Crashlytics] Failed to initialize, continuing without it:', error);
  }
};
