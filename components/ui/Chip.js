import { View, Text } from 'react-native';
import { tokens } from '../../theme/tokens';

// Soft-fill variants of the semantic exceptions in tokens.js (danger, trendUp),
// same 0.14/0.3 opacity convention as accentSoftBg/accentSoftBorder. Not
// promoted to tokens.js itself because that file mirrors the Claude Design
// project and is meant to change there first — these stay local to the one
// component that needs them.
const TONES = {
  danger: {
    bg: 'rgba(216, 96, 74, 0.14)',
    border: 'rgba(216, 96, 74, 0.3)',
    text: tokens.colors.danger,
  },
  warning: {
    bg: tokens.colors.premiumBg,
    border: tokens.colors.premiumBorder,
    text: tokens.colors.premiumText,
  },
};

/**
 * Pill label. `active` uses the soft accent treatment — reserve it for
 * something that genuinely stands out (e.g. a high-priority exam), not for
 * decoration. Mirrors components/feedback/Chip.jsx in the design system.
 *
 * `tone` overrides the color for a graduated signal (e.g. an urgency
 * thermometer) instead of the binary active/inactive one. Omit it and
 * `active` behaves exactly as before.
 */
export function Chip({ children, active = false, tone }) {
  const toneColors = tone && TONES[tone];
  const bg = toneColors
    ? toneColors.bg
    : active
      ? tokens.colors.accentSoftBg
      : tokens.colors.surfaceCard;
  const border = toneColors
    ? toneColors.border
    : active
      ? tokens.colors.accentSoftBorder
      : tokens.colors.borderDefault;
  const text = toneColors
    ? toneColors.text
    : active
      ? tokens.colors.accentSoftText
      : tokens.colors.textPrimary;

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: tokens.radius.pill,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
      }}
    >
      <Text
        style={{
          fontFamily: tokens.typography.families.inter.semibold,
          fontSize: 13,
          color: text,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

/** Gold treatment reserved for Schedio Prime surfaces. */
export function PremiumBadge({ children = 'Premium' }) {
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: tokens.radius.pill,
        backgroundColor: tokens.colors.premiumBg,
        borderWidth: 1,
        borderColor: tokens.colors.premiumBorder,
      }}
    >
      <Text
        style={{
          fontFamily: tokens.typography.families.inter.semibold,
          fontSize: 12,
          color: tokens.colors.premiumText,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

export default Chip;
