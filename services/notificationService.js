import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { db } from './firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

// Configure how notifications should be handled when the app is open.
// `shouldShowAlert` was deprecated in favour of the banner/list pair.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Request permissions for push notifications
 */
export async function requestPermissions() {
  if (Platform.OS === 'web') return false;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  return true;
}

/**
 * Asks for notification permission and, if granted, registers this device's
 * native FCM token in Firestore so the exam-alert/re-engagement/weekly-summary
 * Cloud Functions can reach it. Whether granted or not, `notificationsConsent`
 * is recorded either way — its presence is what tells the caller "already
 * asked", so this only needs to run once per account.
 *
 * All notifications now come from the server (Cloud Functions + FCM), not
 * from scheduling them on-device: an iOS PWA can't reliably schedule a future
 * local notification, so the same pipeline covers both platforms instead of
 * running two different systems.
 */
export async function registerForPushNotifications(uid) {
  if (Platform.OS === 'web' || !uid) return false;

  const granted = await requestPermissions();
  const userRef = doc(db, 'users', uid);

  if (!granted) {
    await updateDoc(userRef, { notificationsConsent: false });
    return false;
  }

  const token = await Notifications.getDevicePushTokenAsync();
  await updateDoc(userRef, {
    notificationsConsent: true,
    fcmToken: token.data,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  });
  return true;
}

/**
 * Marks that the account opened the app just now — the signal the
 * re-engagement Cloud Function reads to find accounts inactive 4+ days.
 */
export async function markAppOpened(uid) {
  if (!uid) return;
  try {
    await updateDoc(doc(db, 'users', uid), { lastOpenTimestamp: serverTimestamp() });
  } catch (error) {
    // Never let this block startup — worst case, one day's re-engagement
    // check runs on slightly stale data.
    console.warn('Could not record lastOpenTimestamp', error);
  }
}
