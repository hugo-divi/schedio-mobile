import { useEffect } from 'react';
import { TouchableOpacity, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../../theme/tokens';

const BADGE_WIDTH = 74;
const SHEEN_WIDTH = BADGE_WIDTH * 0.4;

/**
 * "PRIME" pill with a sheen that sweeps across it on a loop.
 * Reproduces the `primeScan` keyframes from the design system's Home screen:
 * the highlight travels left→right, then rests before repeating.
 */
export function PrimeBadge({ onPress }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    // 0 -> 1 over 60% of the cycle, then hold (the CSS keyframes park the
    // sheen off-screen between 60% and 100%).
    progress.value = withRepeat(
      withDelay(1280, withTiming(1, { duration: 1920, easing: Easing.inOut(Easing.ease) })),
      -1,
      false
    );
  }, [progress]);

  const sheenStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: -SHEEN_WIDTH + progress.value * (BADGE_WIDTH + SHEEN_WIDTH),
      },
    ],
  }));

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="Schedio Prime"
      style={{
        width: BADGE_WIDTH,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 6,
        borderRadius: tokens.radius.pill,
        backgroundColor: tokens.colors.surfaceCard,
        borderWidth: 1,
        borderColor: tokens.colors.borderDefault,
      }}
    >
      <Text
        style={{
          fontFamily: tokens.typography.families.inter.semibold,
          fontSize: 12,
          letterSpacing: 0.3,
          color: '#7FA3E6',
        }}
      >
        PRIME
      </Text>

      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', top: 0, bottom: 0, width: SHEEN_WIDTH }, sheenStyle]}
      >
        <LinearGradient
          colors={['transparent', 'rgba(127, 163, 230, 0.35)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

/** Two-cell strip showing the streak and level, with an entry animation. */
export function StatsStrip({ children }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: tokens.colors.surfaceCard,
        borderWidth: 1,
        borderColor: tokens.colors.borderDefault,
        borderRadius: tokens.radius.card,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

export default PrimeBadge;
