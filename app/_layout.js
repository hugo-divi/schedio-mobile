import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import Head from 'expo-router/head';
import useAuthStore from '../store/authStore';
import { configureRevenueCat } from '../services/revenuecat';
import { requestPermissions } from '../services/notificationService';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { tokens } from '../theme/tokens';

// Hold the splash screen until the fonts are ready, so text never renders in a
// fallback family first and then reflows.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* no-op: already hidden or unavailable */
});

export default function Layout() {
  const initAuth = useAuthStore((state) => state.initAuth);

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    BebasNeue_400Regular,
  });

  // A font download must never be able to brick startup. `useFonts` reports
  // failures, but it can also just never settle (a stalled asset request), and
  // gating the render on it meant the app kept running behind a splash screen
  // that was never dismissed — effects fired, nothing was drawn.
  const [waitedLongEnough, setWaitedLongEnough] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaitedLongEnough(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const ready = fontsLoaded || !!fontError || waitedLongEnough;

  // Hide from an effect rather than the root view's onLayout: onLayout depends
  // on the wrapper forwarding it, and if it doesn't fire the splash stays up
  // forever. An effect is tied to `ready` itself.
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  useEffect(() => {
    const unsubscribe = initAuth();
    configureRevenueCat();

    // Notification setup
    requestPermissions();

    // Listen for notification clicks
    const notificationListener = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('Notification clicked:', response.notification.request.content.data);
        // In the future we can navigate to specific screens here
      }
    );

    return () => {
      unsubscribe && unsubscribe();
      notificationListener.remove();
    };
  }, []);

  if (!ready) return null;

  return (
    // Gesture handlers (the sheets' drag-to-dismiss) need this at the root;
    // expo-router doesn't provide it.
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: tokens.colors.background }}>
      <Head>
        <meta name="google" content="notranslate" />
      </Head>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: tokens.colors.background },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="dashboard" />
        <Stack.Screen
          name="plus"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
            gestureEnabled: true,
          }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
