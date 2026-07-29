import { useEffect } from 'react';
import { TouchableOpacity, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../../theme/tokens';

const BADGE_WIDTH = 74;
const SHEEN_WIDTH = BADGE_WIDTH * 0.4;

// Inverted against the design system's version: there the pill sat on the card
// surface with blue lettering, which read as just another chip. Filling it with
// that blue makes it the only solid non-accent surface on the screen.
const PRIME_BLUE = '#7FA3E6';

/**
 * "PRIME" pill with a highlight sweeping across it on a continuous loop.
 */
export function PrimeBadge({ onPress }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    // One continuous sweep at constant speed. Linear easing on purpose: an
    // ease-in-out reads as the highlight stalling at each end, and any delay
    // inside withRepeat parks it mid-travel instead of pausing off-screen.
    progress.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.linear }),
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
        paddingVertical: 7,
        borderRadius: tokens.radius.pill,
        backgroundColor: PRIME_BLUE,
      }}
    >
      <Text
        style={{
          fontFamily: tokens.typography.families.inter.bold,
          fontSize: 12,
          letterSpacing: 0.4,
          color: tokens.colors.bgBase,
        }}
      >
        PRIME
      </Text>

      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', top: 0, bottom: 0, width: SHEEN_WIDTH }, sheenStyle]}
      >
        {/* White on the blue fill — the old blue-on-dark sheen would vanish now */}
        <LinearGradient
          colors={['transparent', 'rgba(255, 255, 255, 0.55)', 'transparent']}
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
