import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import useThemeStore from '../store/themeStore';
import { tokens } from '../theme/tokens';

export default function Skeleton({ width, height, style, borderRadius = 8 }) {
    const { isDarkMode } = useThemeStore();
    const opacity = useRef(new Animated.Value(0.3)).current;

    const theme = isDarkMode ? tokens.colors.dark : tokens.colors.light;
    const baseColor = isDarkMode ? '#2C2C2E' : '#E5E5EA';

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, {
                    toValue: 0.7,
                    duration: 800,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 0.3,
                    duration: 800,
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, [opacity]);

    return (
        <Animated.View
            style={[
                styles.skeleton,
                {
                    width,
                    height,
                    borderRadius,
                    backgroundColor: baseColor,
                    opacity,
                },
                style,
            ]}
        />
    );
}

const styles = StyleSheet.create({
    skeleton: {
        overflow: 'hidden',
    },
});
