import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { useEffect } from "react";
import Head from 'expo-router/head';
import useAuthStore from "../store/authStore";
import { configureRevenueCat } from "../services/revenuecat";
import { requestPermissions } from "../services/notificationService";
import * as Notifications from 'expo-notifications';

export default function Layout() {
    const initAuth = useAuthStore(state => state.initAuth);

    useEffect(() => {
        const unsubscribe = initAuth();
        configureRevenueCat();

        // Notification setup
        requestPermissions();

        // Listen for notification clicks
        const notificationListener = Notifications.addNotificationResponseReceivedListener(response => {
            console.log("Notification clicked:", response.notification.request.content.data);
            // In the future we can navigate to specific screens here
        });

        return () => {
            unsubscribe && unsubscribe();
            notificationListener.remove();
        };
    }, []);

    return (
        <View style={{ flex: 1, backgroundColor: "#000000" }}>
            <Head>
                <meta name="google" content="notranslate" />
            </Head>
            <StatusBar style="light" />
            <Stack
                screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: "#000000" },
                    animation: "fade",
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
                        gestureEnabled: true
                    }}
                />
            </Stack>
        </View>
    );
}
