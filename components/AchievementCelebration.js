import { useState } from 'react';
import { View, Text, Modal, StyleSheet } from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { tokens } from '../theme/tokens';
import { getIcon } from '../services/gamification';
import { softBg } from '../utils/color';
import Card from './ui/Card';
import Button from './ui/Button';

const font = tokens.typography.families.inter;

/**
 * Rank-up and badge-unlock, queued one at a time — a session can earn both
 * at once, and stacking them would step on the confetti. `queue` is a list
 * of `{ type: 'rank', rank }` or `{ type: 'badge', badge }`. The caller
 * mounts this only once it's ready to show it (see study.js, which waits for
 * the end-of-session reveal to settle first) — mounting is what starts a
 * fresh run through the queue, since state resets with it.
 */
export default function AchievementCelebration({ queue, onFinish }) {
  const [index, setIndex] = useState(0);

  if (!queue || queue.length === 0) return null;

  const item = queue[index];
  const isLast = index >= queue.length - 1;
  const data = item.type === 'rank' ? item.rank : item.badge;
  const Icon = getIcon(data.icon);
  const title = item.type === 'rank' ? data.title : data.name;
  const overline = item.type === 'rank' ? 'Nuevo rango' : 'Insignia desbloqueada';

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
          <View style={[styles.iconWrap, { backgroundColor: softBg(data.color) }]}>
            <Icon size={44} color={data.color} fill={data.color} strokeWidth={1.5} />
          </View>
          <Text style={styles.overline}>{overline}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{data.description}</Text>
          <Button title={isLast ? '¡Vamos!' : 'Siguiente'} fullWidth onPress={advance} />
        </Card>
        {/* Keyed by index so each item in the queue gets its own burst —
            ConfettiCannon only fires once, on mount. */}
        <ConfettiCannon key={index} count={200} origin={{ x: -10, y: 0 }} fadeOut />
      </View>
    </Modal>
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
    marginBottom: 24,
  },
});
