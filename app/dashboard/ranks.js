import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { ChevronLeft, Check } from 'lucide-react-native';

import { tokens } from '../../theme/tokens';
import useUserStore from '../../store/userStore';
import {
  RANKS,
  BADGES,
  getRankForLevel,
  calculateXpForLevel,
  getIcon,
} from '../../services/gamification';
import { softBg } from '../../utils/color';

const font = tokens.typography.families.inter;
const iconFor = (entry) => getIcon(entry.icon);

const formatXp = (value) => Math.round(value).toLocaleString('es-ES');

/**
 * Ranks are gated by level, and level is a function of XP
 * (`xp = level² × 100`), so the XP threshold of a rank is exactly the XP of
 * its `minLevel`. Showing the threshold in XP rather than in levels matches
 * the design and is the currency the student actually watches go up.
 */
const buildLadder = () =>
  RANKS.map((rank, index) => {
    const from = calculateXpForLevel(rank.minLevel);
    const next = RANKS[index + 1];
    const to = next ? calculateXpForLevel(next.minLevel) : null;
    return {
      ...rank,
      from,
      to,
      range: to ? `${formatXp(from)} – ${formatXp(to - 1)} XP` : `${formatXp(from)}+ XP`,
    };
  });

function RankRow({ rank, state }) {
  const locked = state === 'locked';
  const current = state === 'current';
  const iconColor = locked ? tokens.colors.textDisabled : rank.color;
  const Icon = iconFor(rank);

  return (
    <View style={[styles.row, current && styles.rowCurrent]}>
      <View
        style={[
          styles.rowIcon,
          locked && styles.rowIconLocked,
          !locked && { backgroundColor: softBg(rank.color) },
        ]}
      >
        <Icon
          size={20}
          color={iconColor}
          fill={locked ? 'none' : iconColor}
          strokeWidth={locked ? 1.75 : 1.5}
        />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowName, locked && { color: tokens.colors.textDisabled }]}>
          {rank.title}
        </Text>
        <Text style={[styles.rowRange, locked && { color: tokens.colors.textDisabled }]}>
          {rank.range}
        </Text>
      </View>
      {current ? <Text style={styles.rowBadge}>Actual</Text> : null}
    </View>
  );
}

/**
 * Unlike ranks — where a locked row hides nothing but the "current" tag —
 * badges show their condition even when locked. That's the point: a hidden
 * goal can't pull anyone toward it.
 */
function BadgeRow({ badge, unlocked }) {
  const Icon = iconFor(badge);
  const iconColor = unlocked ? badge.color : tokens.colors.textDisabled;

  return (
    <View style={[styles.row, unlocked && styles.rowCurrent]}>
      <View
        style={[
          styles.rowIcon,
          !unlocked && styles.rowIconLocked,
          unlocked && { backgroundColor: softBg(badge.color) },
        ]}
      >
        <Icon size={20} color={iconColor} fill={unlocked ? iconColor : 'none'} strokeWidth={1.75} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowName, !unlocked && { color: tokens.colors.textDisabled }]}>
          {badge.name}
        </Text>
        <Text style={styles.badgeDescription} numberOfLines={2}>
          {badge.description}
        </Text>
      </View>
      {unlocked ? (
        <View style={styles.badgeCheck}>
          <Check size={13} color={tokens.colors.bgBase} strokeWidth={3} />
        </View>
      ) : null}
    </View>
  );
}

export default function RanksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const gamification = useUserStore((state) => state.gamification);

  const level = gamification?.level || 1;
  const xp = gamification?.xp || 0;
  const unlockedBadgeIds = gamification?.badges || [];

  const ladder = useMemo(buildLadder, []);
  const current = useMemo(() => getRankForLevel(level), [level]);
  const HeroIcon = iconFor(current);
  const currentIndex = ladder.findIndex((rank) => rank.title === current.title);
  const next = currentIndex >= 0 ? ladder[currentIndex + 1] : null;

  const from = currentIndex >= 0 ? ladder[currentIndex].from : 0;
  const span = next ? Math.max(1, next.from - from) : 1;
  const percent = next ? Math.min(100, Math.max(0, ((xp - from) / span) * 100)) : 100;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <ChevronLeft size={24} color={tokens.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rango del Estudiante</Text>
        {/* Mirrors `back`'s width so the title centers on the screen, not
            just in the space left over next to the button. */}
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={[styles.heroBadge, { backgroundColor: softBg(current.color) }]}>
            <HeroIcon size={48} color={current.color} fill={current.color} strokeWidth={1.5} />
          </View>
          <Text style={styles.heroRank}>{current.title}</Text>

          <View style={{ width: '100%' }}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${percent}%` }]} />
            </View>
            <View style={styles.trackLabels}>
              <Text style={styles.trackValue}>
                {next ? `${formatXp(xp)} / ${formatXp(next.from)} XP` : `${formatXp(xp)} XP`}
              </Text>
              <Text style={styles.trackNext}>
                {next ? `Siguiente: ${next.title}` : 'Rango máximo'}
              </Text>
            </View>
          </View>

          <Text style={styles.heroNote}>
            {next
              ? 'Sube de rango acumulando XP en tus sesiones de estudio.'
              : 'Has llegado al final de la escalera. Nada mal.'}
          </Text>
        </View>

        <Text style={styles.ladderTitle}>Escalera de rangos</Text>
        <View style={styles.ladder}>
          {ladder.map((rank, index) => (
            <RankRow
              key={rank.title}
              rank={rank}
              state={
                index === currentIndex ? 'current' : index < currentIndex ? 'reached' : 'locked'
              }
            />
          ))}
        </View>

        <Text style={styles.ladderTitle}>Insignias</Text>
        <View style={styles.ladder}>
          {BADGES.map((badge) => (
            <BadgeRow key={badge.id} badge={badge} unlocked={unlockedBadgeIds.includes(badge.id)} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: font.semibold,
    fontSize: 17,
    color: tokens.colors.textPrimary,
  },
  headerSpacer: {
    width: 40,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // Hero
  hero: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  heroBadge: {
    width: 96,
    height: 96,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accentSoftBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroRank: {
    fontFamily: font.bold,
    fontSize: 26,
    color: tokens.colors.textPrimary,
    marginBottom: 20,
  },
  track: {
    height: 8,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surfaceHover,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accent,
  },
  trackLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
    marginTop: 8,
  },
  trackValue: {
    fontFamily: tokens.typography.families.display,
    fontSize: 16,
    letterSpacing: 0.5,
    color: tokens.colors.textPrimary,
  },
  trackNext: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
  heroNote: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
    marginTop: 20,
  },

  // Ladder
  ladderTitle: {
    fontFamily: font.semibold,
    fontSize: 13,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: tokens.colors.textSecondary,
    marginTop: 28,
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  ladder: {
    gap: 10,
    paddingHorizontal: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
  },
  rowCurrent: {
    borderColor: tokens.colors.accent,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accentSoftBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconLocked: {
    backgroundColor: tokens.colors.surfaceHover,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowName: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: tokens.colors.textPrimary,
  },
  rowRange: {
    fontFamily: tokens.typography.families.display,
    fontSize: 14,
    letterSpacing: 0.5,
    color: tokens.colors.textSecondary,
  },
  rowBadge: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: tokens.colors.accent,
  },

  // Badges
  badgeDescription: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 18,
    color: tokens.colors.textSecondary,
  },
  badgeCheck: {
    width: 22,
    height: 22,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.trendUp,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
