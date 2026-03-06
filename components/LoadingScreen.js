import { View, Text, Animated, StyleSheet } from 'react-native';
import { useEffect, useRef } from 'react';
import { tokens } from '../theme/tokens';

export function LoadingScreen() {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        // Fade in animation
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
        }).start();

        // Pulse animation
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.1,
                    duration: 1000,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, []);

    return (
        <View style={styles.container}>
            {/* Background Blobs */}
            <View style={[styles.blob, styles.blobTop]} />
            <View style={[styles.blob, styles.blobBottom]} />

            {/* Logo */}
            <Animated.View style={[styles.logoContainer, { opacity: fadeAnim, transform: [{ scale: pulseAnim }] }]}>
                <Text style={styles.logoText}>Schedio</Text>
                <View style={styles.underline} />
            </Animated.View>

            <Animated.Text style={[styles.subtitle, { opacity: fadeAnim }]}>
                Intelligent Workspace
            </Animated.Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
        justifyContent: 'center',
        alignItems: 'center',
    },
    blob: {
        position: 'absolute',
        borderRadius: 9999,
    },
    blobTop: {
        top: -100,
        right: -100,
        width: 450,
        height: 450,
        backgroundColor: tokens.colors.blue,
        opacity: 0.08,
    },
    blobBottom: {
        bottom: -50,
        left: -80,
        width: 400,
        height: 400,
        backgroundColor: tokens.colors.purple,
        opacity: 0.06,
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: 16,
    },
    logoText: {
        fontSize: 56,
        fontWeight: '900',
        color: '#FFFFFF',
        letterSpacing: -2,
        marginBottom: 12,
    },
    underline: {
        width: 64,
        height: 6,
        backgroundColor: tokens.colors.primary,
        borderRadius: 3,
        opacity: 0.6,
    },
    subtitle: {
        fontSize: 11,
        fontWeight: '900',
        color: tokens.colors.textTertiary,
        textTransform: 'uppercase',
        letterSpacing: 3,
    },
});
