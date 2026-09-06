// Handles push messages that arrive while the PWA isn't in the foreground.
// Metro never processes this file (it's a static asset served as-is from
// public/), so it can't import the app's own firebase.js or read
// EXPO_PUBLIC__* env vars at build time — the config it needs travels as
// query params on the registration URL instead (see registerForWebPush in
// services/notificationService.js), so there's exactly one place the real
// values live.
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

// functions/index.js's sendToUser sends a plain `notification` payload (no
// `data`-only messages), so this is the whole background handler — FCM
// would otherwise drop the message silently while the tab isn't focused.
messaging.onBackgroundMessage(({ notification }) => {
  if (!notification) return;
  self.registration.showNotification(notification.title ?? 'Schedio', {
    body: notification.body,
    icon: '/icon-192.png',
  });
});
