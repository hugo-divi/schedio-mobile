import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { tokens } from '../theme/tokens';

export default function Skeleton({ width, height, style, borderRadius = tokens.radius.btn }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  const baseColor = tokens.colors.surfaceHover;

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
