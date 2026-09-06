import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { db, firebaseConfig } from './firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { canRequestWebPush } from './pwa';

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
 * Web equivalent of the native path below: registers the Messaging service
 * worker, asks for Notification permission, and writes the resulting FCM
 * web token to Firestore. `sendToUser` in functions/index.js just calls
 * `messaging.send({ token, notification })` — FCM abstracts native push vs.
 * Web Push, so nothing server-side needs to know this token came from a
 * browser instead of a phone.
 *
 * Returns false without prompting anything when `canRequestWebPush()` is
 * false (not supported, or iOS Safari not installed as a PWA yet) — callers
 * that show the "add to home screen" UI in that case already skip calling
 * this at all, but the dashboard's automatic first-run call doesn't know
 * that, so this stays a safe no-op either way.
 */
async function registerForWebPush(uid) {
  if (!canRequestWebPush()) return false;

  const userRef = doc(db, 'users', uid);

  try {
    const { getMessaging, getToken } = await import('firebase/messaging');

    const swParams = new URLSearchParams(firebaseConfig);
    const registration = await navigator.serviceWorker.register(
      `/firebase-messaging-sw.js?${swParams.toString()}`
    );

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      await updateDoc(userRef, { notificationsConsent: false });
      return false;
    }

    const messaging = getMessaging();
    const token = await getToken(messaging, {
      vapidKey: process.env.EXPO_PUBLIC__FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) throw new Error('getToken returned no token');

    await updateDoc(userRef, {
      notificationsConsent: true,
      fcmToken: token,
      platform: 'web',
    });
    return true;
  } catch (error) {
    console.warn('[Notifications] Web push registration failed:', error?.message);
    return false;
  }
}

/**
 * Asks for notification permission and, if granted, registers this device's
 * FCM token in Firestore so the exam-alert/re-engagement/weekly-summary
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
  if (!uid) return false;

  if (Platform.OS === 'web') {
    return registerForWebPush(uid);
  }

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
