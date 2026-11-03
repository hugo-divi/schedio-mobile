import { useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { tokens } from '../theme/tokens';
import {
  CATEGORIES,
  TIERS,
  buildBadgeStats,
  catalogFor,
  closestToUnlock,
  progressOf,
} from '../services/badges';
import useUserStore from '../store/userStore';
import useLocaleFormat from '../hooks/useLocaleFormat';
import BadgeMedal from './BadgeMedal';

const font = tokens.typography.families.inter;

/**
 * Every badge, for beta accounts (app/dashboard/ranks.js shows this instead
 * of the plain list).
 *
 * Built around one question — "what's my next one?" — so it opens on the
 * badges closest to unlocking, with their progress, before the full
 * catalogue. Each badge says how it's earned even while locked, its tier and
 * what it's worth, and when it was won.
 */
export default function BadgeGallery() {
  const { formatDate } = useLocaleFormat();
  const { width } = useWindowDimensions();
  const gamification = useUserStore((state) => state.gamification);
  const stats = useUserStore((state) => state.stats);
  const sessionHistory = useUserStore((state) => state.sessionHistory);
  const resources = useUserStore((state) => state.resources);

  const owned = useMemo(() => gamification?.badges || [], [gamification]);
  const unlockDates = gamification?.badgeUnlocks || {};
  const catalog = catalogFor({ beta: true });

  const badgeStats = useMemo(
    () =>
      buildBadgeStats({
        stats,
        history: sessionHistory,
        extra: { uploads: (resources || []).length },
        beta: true,
      }),
    [stats, sessionHistory, resources]
  );
  const closest = useMemo(
    () => closestToUnlock(owned, badgeStats, { beta: true }),
    [owned, badgeStats]
  );

  const earnedCount = catalog.filter((b) => owned.includes(b.id)).length;
  const goldCount = catalog.filter((b) => b.tier === 'gold' && owned.includes(b.id)).length;
  // Two columns on any phone; the cards hold a name, a tier and a line.
  const cardWidth = Math.floor((width - 20 * 2 - 10) / 2);

  return (
    <View style={styles.root}>
      <View style={styles.summary}>
        <Text style={styles.summaryValue}>
          {earnedCount}
          <Text style={styles.summaryOf}> de {catalog.length}</Text>
        </Text>
        <Text style={styles.summaryLabel}>insignias · {goldCount} de oro</Text>
      </View>

      {closest.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Más cerca</Text>
          <View style={styles.closeList}>
            {closest.map(({ entry, value, target, ratio }) => (
              <View key={entry.id} style={styles.closeRow}>
                <BadgeMedal badge={entry} size={40} unlocked={false} />
                <View style={styles.closeBody}>
                  <View style={styles.closeHead}>
                    <Text style={styles.closeName} numberOfLines={1}>
                      {entry.name}
                    </Text>
                    <Text style={styles.closeCount}>
                      {formatProgress(entry, value)} / {formatProgress(entry, target)}
                    </Text>
                  </View>
                  <View style={styles.track}>
                    <View
                      style={[
                        styles.fill,
                        {
                          width: `${Math.round(ratio * 100)}%`,
                          backgroundColor: TIERS[entry.tier].color,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.closeHint} numberOfLines={1}>
                    {entry.description}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {CATEGORIES.map((category) => {
        const badges = catalog.filter((b) => b.category === category.id);
        if (badges.length === 0) return null;
        const done = badges.filter((b) => owned.includes(b.id)).length;
        return (
          <View key={category.id} style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{category.label}</Text>
              <Text style={styles.sectionCount}>
                {done}/{badges.length}
              </Text>
            </View>
            <Text style={styles.sectionBlurb}>{category.blurb}</Text>
            <View style={styles.grid}>
              {badges.map((entry) => {
                const unlocked = owned.includes(entry.id);
                const tier = TIERS[entry.tier];
                const { value, target } = progressOf(entry, badgeStats);
                const date = unlockDates[entry.id];
                return (
                  <View
                    key={entry.id}
                    style={[styles.card, { width: cardWidth }, unlocked && styles.cardOn]}
                    accessible
                    accessibilityLabel={`${entry.name}, ${tier.label}. ${
                      unlocked ? 'Conseguida' : `Bloqueada: ${entry.description}`
                    }`}
                  >
                    <BadgeMedal badge={entry} size={48} unlocked={unlocked} />
                    <Text
                      style={[styles.cardName, !unlocked && styles.cardNameLocked]}
                      numberOfLines={2}
                    >
                      {entry.name}
                    </Text>
                    <Text style={[styles.cardTier, { color: tier.color }]}>
                      {tier.label} · +{tier.xp} XP
                    </Text>
                    <Text style={styles.cardLine} numberOfLines={3}>
                      {unlocked
                        ? date
                          ? `Conseguida el ${formatDate(new Date(date), 'dayMonth')}`
                          : 'Conseguida'
                        : entry.cumulative && target > 1 && value > 0
                          ? `${formatProgress(entry, value)} de ${formatProgress(entry, target)} · ${entry.description}`
                          : entry.description}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Minutes read better as hours on the time badges. */
const formatProgress = (entry, amount) =>
  entry.id === 'hours_10' || entry.id === 'century_club'
    ? `${Math.floor(amount / 60)} h`
    : String(Math.floor(amount));

const styles = StyleSheet.create({
  root: { paddingHorizontal: 20 },
  summary: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginBottom: 4,
  },
  summaryValue: {
    fontFamily: tokens.typography.families.display,
    fontSize: 34,
    letterSpacing: 0.5,
    color: tokens.colors.textPrimary,
  },
  summaryOf: {
    fontSize: 20,
    color: tokens.colors.textSecondary,
  },
  summaryLabel: { fontFamily: font.medium, fontSize: 14, color: tokens.colors.textSecondary },

  section: { marginTop: 22 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sectionTitle: {
    fontFamily: font.semibold,
    fontSize: 13,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: tokens.colors.textSecondary,
    marginBottom: 10,
  },
  sectionCount: { fontFamily: font.semibold, fontSize: 13, color: tokens.colors.textSecondary },
  sectionBlurb: {
    fontFamily: font.regular,
    fontSize: 13,
    color: tokens.colors.textSecondary,
    marginTop: -6,
    marginBottom: 12,
  },

  closeList: { gap: 10 },
  closeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
  },
  closeBody: { flex: 1, minWidth: 0, gap: 6 },
  closeHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  closeName: { flex: 1, fontFamily: font.semibold, fontSize: 14, color: tokens.colors.textPrimary },
  closeCount: { fontFamily: font.medium, fontSize: 13, color: tokens.colors.textSecondary },
  closeHint: { fontFamily: font.regular, fontSize: 12, color: tokens.colors.textSecondary },
  track: {
    height: 6,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surfaceHover,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: tokens.radius.pill },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    padding: 14,
    gap: 6,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
  },
  cardOn: { borderColor: tokens.colors.accentSoftBorder },
  cardName: {
    fontFamily: font.semibold,
    fontSize: 14,
    color: tokens.colors.textPrimary,
    marginTop: 4,
  },
  cardNameLocked: { color: tokens.colors.textSecondary },
  cardTier: { fontFamily: font.semibold, fontSize: 11, letterSpacing: 0.3 },
  cardLine: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 16,
    color: tokens.colors.textSecondary,
  },
});
