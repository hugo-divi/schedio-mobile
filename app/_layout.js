import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { useCallback, useEffect } from 'react';
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

  // Don't block the app forever if a font fails to load — render with the
  // system fallback rather than sitting on the splash screen.
  const ready = fontsLoaded || !!fontError;

  const onLayoutRoot = useCallback(() => {
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
    <View style={{ flex: 1, backgroundColor: tokens.colors.background }} onLayout={onLayoutRoot}>
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
    </View>
  );
}
