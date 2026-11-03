import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { routeForNotification } from './notificationRoutes';
import useNotificationRouteStore from '../store/notificationRouteStore';

/**
 * Turns a tap on one of our pushes into a pending route.
 *
 * On Android a push displayed by the system tray reaches expo-notifications as
 * intent extras, and its `data` keys come through as
 * `request.content.data` — so `kind` and `examId` arrive exactly as
 * functions/index.js sent them.
 *
 * A cold start can deliver the same tap twice: once through the listener and
 * once as the "last response" read on mount. The FCM message id
 * (`request.identifier`) is what tells them apart.
 */
const handled = new Set();

export function queueRouteFromNotification(response) {
  if (!response?.notification) return;

  // Only the plain tap. None of our pushes has action buttons today, and an
  // action that isn't "open the app" must never navigate anywhere.
  if (
    response.actionIdentifier &&
    response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER
  ) {
    return;
  }

  const id = response.notification.request?.identifier;
  if (id) {
    if (handled.has(id)) return;
    handled.add(id);
  }

  const route = routeForNotification(response.notification.request?.content?.data);
  if (route) useNotificationRouteStore.getState().queue(route);
}

/**
 * The tap that launched the app fired before app/_layout.js had a listener, so
 * it is only reachable as the last stored response. Cleared once read, so a
 * later remount of the root layout doesn't replay it.
 *
 * Native only: on web the service worker opens the right URL itself, and
 * expo-notifications has no stored response to give.
 */
export function queueLastNotificationResponse() {
  if (Platform.OS === 'web') return;
  try {
    queueRouteFromNotification(Notifications.getLastNotificationResponse());
    Notifications.clearLastNotificationResponse();
  } catch (error) {
    console.warn('[Notifications] Could not read the launching notification:', error?.message);
  }
}
