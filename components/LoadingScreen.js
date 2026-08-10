import { View, Image, Text, Animated, ActivityIndicator, StyleSheet } from 'react-native';
import { useEffect, useRef } from 'react';
import { tokens } from '../theme/tokens';

const font = tokens.typography.families.inter;

/**
 * Shown at `app/index.js` while the auth listener resolves — the very first
 * frame every user sees on every cold start, right after the native splash.
 * Mirrors login.js's brand block so that hand-off doesn't jump between two
 * different visual languages.
 */
export function LoadingScreen() {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.brand, { opacity: fadeAnim }]}>
        <View style={styles.logoBadge}>
          <Image
            source={require('../assets/images/schedio-mark.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.brandName}>Schedio</Text>
        <Text style={styles.tagline}>Que el estudio sea fácil</Text>
      </Animated.View>

      <ActivityIndicator color={tokens.colors.accent} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    alignItems: 'center',
    gap: 12,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: {
    width: 34,
    height: 34,
  },
  brandName: {
    fontFamily: font.bold,
    fontSize: 20,
    letterSpacing: 0.2,
    color: tokens.colors.textPrimary,
  },
  tagline: {
    fontFamily: font.regular,
    fontSize: 15,
    color: tokens.colors.textSecondary,
    marginTop: -2,
  },
  spinner: {
    position: 'absolute',
    bottom: 64,
  },
});

export default LoadingScreen;
