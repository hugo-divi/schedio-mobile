import { View, StyleSheet } from 'react-native';
import { Lock } from 'lucide-react-native';
import { tokens } from '../theme/tokens';
import { getIcon } from '../services/gamification';
import { TIERS } from '../services/badges';
import { softBg } from '../utils/color';

/**
 * One badge, drawn the same way everywhere it appears: the gallery, the
 * profile strip and the celebration.
 *
 * The icon wears the badge's own colour; the ring around it wears the tier's
 * (bronze, silver, gold), so how much a badge is worth reads at a glance
 * without a label. Locked badges keep their shape and lose their colour, with
 * a small lock — a goal you can see is a goal you can go after.
 *
 * `showTier` is off for accounts outside the beta, which don't have tiers.
 */
export default function BadgeMedal({ badge, size = 44, unlocked = true, showTier = true }) {
  const Icon = getIcon(badge.icon);
  const tier = showTier ? TIERS[badge.tier] : null;
  const ring = Math.max(2, Math.round(size / 18));
  const iconSize = Math.round(size * 0.46);
  const color = unlocked ? badge.color : tokens.colors.textDisabled;

  return (
    <View
      style={[
        styles.medal,
        {
          width: size,
          height: size,
          borderWidth: tier ? ring : 0,
          borderColor: unlocked && tier ? tier.color : tokens.colors.borderDefault,
          backgroundColor: unlocked ? softBg(badge.color, 0.16) : tokens.colors.surfaceHover,
        },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Icon
        size={iconSize}
        color={color}
        fill={unlocked ? color : 'none'}
        strokeWidth={unlocked ? 1.5 : 1.75}
      />
      {!unlocked ? (
        <View style={[styles.lock, { right: -2, bottom: -2 }]}>
          <Lock size={Math.max(9, Math.round(size / 5))} color={tokens.colors.textSecondary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  medal: {
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lock: {
    position: 'absolute',
    padding: 3,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
  },
});
