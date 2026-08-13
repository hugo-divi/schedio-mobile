import { useEffect, useRef, useState } from 'react';
import { TouchableOpacity, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  FadeIn,
  FadeOut,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Check } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';

const BADGE_WIDTH = 74;
const SHEEN_WIDTH = BADGE_WIDTH * 0.4;

// Inverted against the design system's version: there the pill sat on the card
// surface with gold lettering, which read as just another chip. Filling it
// with that gold (tokens.colors.premiumText — the same one the paywall's CTA
// and the PremiumBadge chip use) makes it the only solid non-accent surface
// on the screen.
const PRIME_GOLD = tokens.colors.premiumText;

const OWNED_MESSAGES = [
  'Ya eres Prime. Gracias por apoyar Schedio 💛',
  'Prime activo — todo desbloqueado para ti.',
  'Eres Prime. A por el curso sin límites.',
];

/**
 * "PRIME" pill. For students without Prime it's a highlight sweeping across
 * on a loop and taps go to the paywall (`/plus`). For students who already
 * bought it, `active` swaps it for a static accent-colored badge — the sweep
 * reads as a still-selling CTA once they own it — and taps show a quick
 * thank-you message instead of sending them back to the paywall.
 */
export function PrimeBadge({ onPress, active = false }) {
  const progress = useSharedValue(0);
  const [message, setMessage] = useState(null);
  const hideTimer = useRef(null);

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

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    []
  );

  const sheenStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: -SHEEN_WIDTH + progress.value * (BADGE_WIDTH + SHEEN_WIDTH),
      },
    ],
  }));

  const handlePress = () => {
    if (!active) {
      onPress?.();
      return;
    }
    setMessage(OWNED_MESSAGES[Math.floor(Math.random() * OWNED_MESSAGES.length)]);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setMessage(null), 2800);
  };

  return (
    <View>
      <TouchableOpacity
        onPress={handlePress}
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
          backgroundColor: active ? tokens.colors.accent : PRIME_GOLD,
        }}
      >
        {active ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
        <Text
          style={{
            fontFamily: tokens.typography.families.inter.bold,
            fontSize: 12,
            letterSpacing: 0.4,
            color: active ? '#FFFFFF' : tokens.colors.bgBase,
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

      {message ? (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(180)}
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 8,
            maxWidth: 220,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: tokens.radius.card,
            backgroundColor: tokens.colors.surfaceCard,
            borderWidth: 1,
            borderColor: tokens.colors.accentSoftBorder,
            zIndex: 20,
          }}
        >
          <Text
            style={{
              fontFamily: tokens.typography.families.inter.medium,
              fontSize: 12,
              lineHeight: 16,
              color: tokens.colors.textPrimary,
            }}
          >
            {message}
          </Text>
        </Animated.View>
      ) : null}
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
