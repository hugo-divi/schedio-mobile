import { useState } from 'react';
import { View, Text, Modal, StyleSheet } from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { tokens } from '../theme/tokens';
import { getIcon } from '../services/gamification';
import { TIERS } from '../services/badges';
import { isBetaProfile } from '../services/beta';
import useUserStore from '../store/userStore';
import { softBg } from '../utils/color';
import Card from './ui/Card';
import Button from './ui/Button';
import BadgeMedal from './BadgeMedal';

const font = tokens.typography.families.inter;

/**
 * Rank-ups and badge unlocks, one at a time — a session can earn both at
 * once, and stacking them would step on the confetti. `queue` holds
 * `{ type: 'rank', rank }`, `{ type: 'badge', badge }` or, for several badges
 * granted together (the catch-up when new badges ship), `{ type: 'summary',
 * badges }`. Mounted by components/CelebrationHost.js, which decides when.
 *
 * Beta accounts see what a badge is worth: its tier and the XP it adds.
 */
export default function AchievementCelebration({ queue, onFinish }) {
  const [index, setIndex] = useState(0);
  const beta = useUserStore((state) => isBetaProfile(state.profile));

  if (!queue || queue.length === 0) return null;

  const item = queue[Math.min(index, queue.length - 1)];
  const isLast = index >= queue.length - 1;

  const advance = () => {
    if (isLast) {
      onFinish();
    } else {
      setIndex((i) => i + 1);
    }
  };

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <Card padding={28} style={styles.card}>
          {item.type === 'summary' ? (
            <Summary badges={item.badges} beta={beta} />
          ) : item.type === 'badge' ? (
            <SingleBadge badge={item.badge} beta={beta} />
          ) : (
            <Rank rank={item.rank} />
          )}
          <Button title={isLast ? '¡Vamos!' : 'Siguiente'} fullWidth onPress={advance} />
        </Card>
        {/* Keyed by index so each item in the queue gets its own burst —
            ConfettiCannon only fires once, on mount. */}
        <ConfettiCannon key={index} count={200} origin={{ x: -10, y: 0 }} fadeOut />
      </View>
    </Modal>
  );
}

function Rank({ rank }) {
  const Icon = getIcon(rank.icon);
  return (
    <>
      <View style={[styles.iconWrap, { backgroundColor: softBg(rank.color) }]}>
        <Icon size={44} color={rank.color} fill={rank.color} strokeWidth={1.5} />
      </View>
      <Text style={styles.overline}>Nuevo rango</Text>
      <Text style={styles.title}>{rank.title}</Text>
      <Text style={styles.description}>{rank.description}</Text>
    </>
  );
}

function SingleBadge({ badge, beta }) {
  const tier = beta ? TIERS[badge.tier] : null;
  return (
    <>
      <View style={styles.medalWrap}>
        <BadgeMedal badge={badge} size={88} showTier={beta} />
      </View>
      <Text style={styles.overline}>
        {tier ? `Insignia de ${tier.label.toLowerCase()}` : 'Insignia desbloqueada'}
      </Text>
      <Text style={styles.title}>{badge.name}</Text>
      <Text style={styles.description}>{badge.description}</Text>
      {tier ? (
        <View style={[styles.reward, { borderColor: tier.color }]}>
          <Text style={[styles.rewardText, { color: tier.color }]}>+{tier.xp} XP</Text>
        </View>
      ) : null}
    </>
  );
}

function Summary({ badges, beta }) {
  const xp = beta ? badges.reduce((sum, b) => sum + (TIERS[b.tier]?.xp || 0), 0) : 0;
  return (
    <>
      <View style={styles.summaryRow}>
        {badges.slice(0, 5).map((badge) => (
          <BadgeMedal key={badge.id} badge={badge} size={48} showTier={beta} />
        ))}
      </View>
      <Text style={styles.overline}>Insignias nuevas</Text>
      <Text style={styles.title}>
        {badges.length} {badges.length === 1 ? 'insignia' : 'insignias'}
      </Text>
      <Text style={styles.description}>
        Por lo que ya llevabas hecho:{' '}
        {badges
          .slice(0, 4)
          .map((b) => b.name)
          .join(', ')}
        {badges.length > 4 ? ` y ${badges.length - 4} más` : ''}.
      </Text>
      {xp > 0 ? (
        <View style={[styles.reward, { borderColor: tokens.colors.premiumText }]}>
          <Text style={[styles.rewardText, { color: tokens.colors.premiumText }]}>+{xp} XP</Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    alignItems: 'center',
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  medalWrap: {
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  overline: {
    fontFamily: font.semibold,
    fontSize: 13,
    letterSpacing: 1,
    textAlign: 'center',
    color: tokens.colors.textSecondary,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 26,
    textAlign: 'center',
    color: tokens.colors.textPrimary,
    marginTop: 4,
    marginBottom: 12,
  },
  description: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: tokens.colors.textSecondary,
    marginBottom: 16,
  },
  reward: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    marginBottom: 20,
  },
  rewardText: {
    fontFamily: font.semibold,
    fontSize: 14,
  },
});
