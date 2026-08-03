import { Platform } from 'react-native';
import crashlytics from '@react-native-firebase/crashlytics';

/**
 * Enables native crash reporting, and hooks unhandled JS errors into it too —
 * @react-native-firebase/crashlytics only auto-captures native crashes on its
 * own, not JS exceptions.
 *
 * Off in dev builds: a crash while iterating locally isn't a signal worth
 * mixing into what testers actually hit.
 */
export const initCrashlytics = () => {
  if (Platform.OS === 'web' || __DEV__) return;

  crashlytics().setCrashlyticsCollectionEnabled(true);

  const previousHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    crashlytics().recordError(error);
    previousHandler(error, isFatal);
  });
};
