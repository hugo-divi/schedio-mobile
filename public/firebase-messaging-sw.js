// Handles push messages that arrive while the PWA isn't in the foreground.
// Metro never processes this file (it's a static asset served as-is from
// public/), so it can't import the app's own firebase.js or read
// EXPO_PUBLIC__* env vars at build time — the config it needs travels as
// query params on the registration URL instead (see registerForWebPush in
// services/notificationService.js), so there's exactly one place the real
// values live.

// ── Where a tap lands ──
// A copy of `pathForNotification` in services/notificationRoutes.js, because
// this file can't import anything. scripts/check-notification-routes.mjs
// extracts the function between these two markers and checks it answers the
// same as the original for every kind of push, so keep both ends in place.
// <path-for>
function pathFor(data) {
  if (!data || typeof data !== 'object') return '/';
  const examId =
    typeof data.examId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(data.examId)
      ? data.examId
      : null;
  switch (data.kind) {
    case 'exam_alert':
    case 'reengagement':
      return examId
        ? `/dashboard/plans?${new URLSearchParams({ highlightId: examId }).toString()}`
        : '/dashboard/plans';
    case 'weekly_summary':
      return '/dashboard/streak';
    default:
      return '/';
  }
}
// </path-for>

// Registered before the Firebase scripts load, as their docs ask of a worker
// that handles its own clicks. Only for the notifications shown below: the
// ones FCM displays itself carry `FCM_MSG` and are the SDK's to handle.
self.addEventListener('notificationclick', (event) => {
  const data = event.notification?.data || {};
  if (data.FCM_MSG) return;
  event.notification.close();

  const target = new URL(pathFor(data), self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        try {
          await open.navigate(target);
        } catch {
          // A window this worker doesn't control can't be navigated from
          // here. Focusing it is still better than opening a second copy.
        }
        return;
      }
      await self.clients.openWindow(target);
    })()
  );
});

importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js');

const params = new URL(self.location.href).searchParams;

firebase.initializeApp({
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
});

const messaging = firebase.messaging();

// functions/index.js's sendToUser sends a `notification` payload plus a small
// `data` one (`kind`, sometimes `examId`), so this is the whole background
// handler — FCM would otherwise drop the message silently while the tab isn't
// focused. The data rides along on the notification for the click handler.
messaging.onBackgroundMessage(({ notification, data }) => {
  if (!notification) return;
  self.registration.showNotification(notification.title ?? 'Schedio', {
    body: notification.body,
    icon: '/icon-192.png',
    data: data || {},
  });
});
