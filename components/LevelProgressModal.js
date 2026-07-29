import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Zap, BookOpen, Star, Crown, Lock, Check } from 'lucide-react-native';
import { tokens } from '../theme/tokens';
import {
  RANKS,
  getRankForLevel,
  getNextRank,
  calculateXpForLevel,
  calculateXpForNextLevel,
} from '../services/gamification';
import BottomSheet from './ui/BottomSheet';
import Button from './ui/Button';

const font = tokens.typography.families.inter;
const IconMap = { Zap, BookOpen, Star, Crown };

/**
 * Level and rank detail sheet.
 *
 * Ranks come from services/gamification. This file used to carry its own copy
 * of the table, and the two had drifted apart — the service calls level 10
 * "Estudiante" while the local copy called it "Académico", a rank that doesn't
 * exist in the service at all. The dashboard and profile read the service, so
 * this sheet was the one telling a different story.
 */
export default function LevelProgressModal({ visible, onClose, gamification }) {
  if (!gamification) return null;

  const { level = 1, xp = 0 } = gamification;

  const floor = calculateXpForLevel(level);
  const ceiling = calculateXpForNextLevel(level);
  const span = ceiling - floor;
  const percentage = span > 0 ? Math.min(100, Math.max(0, ((xp - floor) / span) * 100)) : 0;
  const xpToGo = Math.max(0, ceiling - Math.floor(xp));

  const currentRank = getRankForLevel(level);
  const nextRank = getNextRank(level);
  const RankIcon = IconMap[currentRank?.icon] || Zap;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.hero}>
        <View style={[styles.iconRing, { borderColor: currentRank.color }]}>
          <RankIcon size={30} color={currentRank.color} strokeWidth={1.75} />
        </View>
        <Text style={styles.level}>Nivel {level}</Text>
        <Text style={[styles.rankName, { color: currentRank.color }]}>{currentRank.title}</Text>
        <Text style={styles.rankDescription}>{currentRank.description}</Text>
      </View>

      <View style={styles.xpHeader}>
        <Text style={styles.xpLabel}>XP</Text>
        <Text style={styles.xpValue}>
          {Math.floor(xp)} / {ceiling}
        </Text>
      </View>
      <View style={styles.xpTrack}>
        <View
          style={[styles.xpFill, { width: `${percentage}%`, backgroundColor: currentRank.color }]}
        />
      </View>
      <Text style={styles.xpHint}>
        {xpToGo > 0 ? (
          <>
            Te faltan <Text style={styles.xpStrong}>{xpToGo} XP</Text> para el nivel {level + 1}.
          </>
        ) : (
          '¡Nivel completado!'
        )}
      </Text>

      <Text style={styles.laddderTitle}>
        {nextRank ? `Próximo rango: ${nextRank.title}` : 'Has alcanzado el rango máximo'}
      </Text>

      {/* The whole ladder, so the milestones ahead are visible — not just the next one */}
      <ScrollView style={styles.ladder} showsVerticalScrollIndicator={false}>
        {RANKS.map((rank) => {
          const unlocked = level >= rank.minLevel;
          const isCurrent = rank.title === currentRank.title;
          const Icon = IconMap[rank.icon] || Zap;

          return (
            <View
              key={rank.title}
              style={[styles.ladderRow, isCurrent && { borderColor: rank.color }]}
            >
              <View
                style={[
                  styles.ladderIcon,
                  { backgroundColor: unlocked ? `${rank.color}22` : tokens.colors.surfaceHover },
                ]}
              >
                <Icon
                  size={16}
                  color={unlocked ? rank.color : tokens.colors.textDisabled}
                  strokeWidth={2}
                />
              </View>

              <View style={styles.ladderText}>
                <Text
                  style={[styles.ladderName, !unlocked && { color: tokens.colors.textDisabled }]}
                >
                  {rank.title}
                </Text>
                <Text style={styles.ladderReq}>{rank.requirements}</Text>
              </View>

              {isCurrent ? (
                <Text style={[styles.ladderBadge, { color: rank.color }]}>Actual</Text>
              ) : unlocked ? (
                <Check size={15} color={tokens.colors.trendUp} />
              ) : (
                <Lock size={14} color={tokens.colors.textDisabled} />
              )}
            </View>
          );
        })}
      </ScrollView>

      <Button
        title="Entendido"
        variant="secondary"
        fullWidth
        style={styles.cta}
        onPress={onClose}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconRing: {
    width: 60,
    height: 60,
    borderRadius: tokens.radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  level: {
    fontFamily: font.bold,
    fontSize: 26,
    color: tokens.colors.textPrimary,
  },
  rankName: {
    fontFamily: font.semibold,
    fontSize: 15,
    marginTop: 2,
  },
  rankDescription: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
  },
  xpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  xpLabel: {
    fontFamily: font.medium,
    fontSize: 13,
    letterSpacing: 0.4,
    color: tokens.colors.textSecondary,
  },
  xpValue: {
    fontFamily: font.semibold,
    fontSize: 13,
    color: tokens.colors.textPrimary,
  },
  xpTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.background,
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    borderRadius: 3,
  },
  xpHint: {
    fontFamily: font.regular,
    fontSize: 13,
    color: tokens.colors.textSecondary,
    marginTop: 8,
  },
  xpStrong: {
    fontFamily: font.bold,
    color: tokens.colors.textPrimary,
  },
  laddderTitle: {
    fontFamily: font.semibold,
    fontSize: 13,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: tokens.colors.textSecondary,
    marginTop: 24,
    marginBottom: 10,
  },
  ladder: {
    maxHeight: 220,
  },
  ladderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.btn,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: tokens.colors.background,
    marginBottom: 8,
  },
  ladderIcon: {
    width: 30,
    height: 30,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ladderText: {
    flex: 1,
  },
  ladderName: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: tokens.colors.textPrimary,
  },
  ladderReq: {
    fontFamily: font.regular,
    fontSize: 13,
    color: tokens.colors.textSecondary,
    marginTop: 1,
  },
  ladderBadge: {
    fontFamily: font.bold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  cta: {
    marginTop: 20,
  },
});
