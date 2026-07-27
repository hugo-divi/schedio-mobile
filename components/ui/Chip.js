import { View, Text } from 'react-native';
import { tokens } from '../../theme/tokens';

/**
 * Pill label. `active` uses the soft accent treatment — reserve it for
 * something that genuinely stands out (e.g. a high-priority exam), not for
 * decoration. Mirrors components/feedback/Chip.jsx in the design system.
 */
export function Chip({ children, active = false }) {
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: tokens.radius.pill,
        backgroundColor: active ? tokens.colors.accentSoftBg : tokens.colors.surfaceCard,
        borderWidth: 1,
        borderColor: active ? tokens.colors.accentSoftBorder : tokens.colors.borderDefault,
      }}
    >
      <Text
        style={{
          fontFamily: tokens.typography.families.inter.semibold,
          fontSize: 13,
          color: active ? tokens.colors.accentSoftText : tokens.colors.textPrimary,
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
