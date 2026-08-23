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
import { Crown } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';

const BADGE_WIDTH = 74;
const SHEEN_WIDTH = BADGE_WIDTH * 0.4;

// Inverted against the design system's version: there the pill sat on the card
// surface with gold lettering, which read as just another chip. Filling it
// with that gold (tokens.colors.premiumText — the same one the paywall's CTA
// and the PremiumBadge chip use) makes it the only solid non-accent surface
// on the screen.
const PRIME_GOLD = tokens.colors.premiumText;

/**
 * "PRIME" pill.
 *
 * The gold is the same one the paywall CTA and the `PremiumBadge` chip use,
 * and it stays gold whether or not the student has paid — an earlier version
 * turned it into the app's blue accent on purchase, which meant paying made
 * the badge *less* distinctive than the app's ordinary buttons, and swapped a
 * membership mark for the same tick used on finished tasks.
 *
 * What separates the two states is motion, not colour: without Prime a
 * highlight sweeps across on a loop, which is a sales animation. Owning it
 * stops the sweep and adds the crown. The stillness is the reward.
 *
 * Both states call `onPress`; the parent decides where each one goes.
 */
export function PrimeBadge({ onPress, active = false }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (active) return;
    // One continuous sweep at constant speed. Linear easing on purpose: an
    // ease-in-out reads as the highlight stalling at each end, and any delay
    // inside withRepeat parks it mid-travel instead of pausing off-screen.
    progress.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.linear }),
      -1,
      false
    );
  }, [active, progress]);

  const sheenStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: -SHEEN_WIDTH + progress.value * (BADGE_WIDTH + SHEEN_WIDTH),
      },
    ],
  }));

  return (
    <View>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={active ? 'Ya eres Schedio Prime' : 'Schedio Prime'}
        style={{
          width: BADGE_WIDTH,
          overflow: 'hidden',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          paddingVertical: 7,
          borderRadius: tokens.radius.pill,
          backgroundColor: PRIME_GOLD,
        }}
      >
        {active ? (
          <Crown size={13} color={tokens.colors.bgBase} fill={tokens.colors.bgBase} />
        ) : null}
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

        {active ? null : (
          <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', top: 0, bottom: 0, width: SHEEN_WIDTH }, sheenStyle]}
          >
            {/* White on the gold fill — a colored sheen would just blend in and vanish */}
            <LinearGradient
              colors={['transparent', 'rgba(255, 255, 255, 0.55)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        )}
      </TouchableOpacity>
    </View>
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
