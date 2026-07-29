import { View, Text, StyleSheet } from 'react-native';
import { Flame, Trophy, Moon } from 'lucide-react-native';
import { startOfWeek, addDays, isSameDay, isAfter, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { tokens } from '../theme/tokens';
import { MAX_REST_PER_WEEK } from '../services/streaks';
import BottomSheet from './ui/BottomSheet';
import Button from './ui/Button';

const font = tokens.typography.families.inter;
const DAILY_GOAL_MIN = 5;

const getMotivation = (streak) => {
  if (streak === 0) return 'Cada día es una nueva oportunidad. Empieza hoy.';
  if (streak < 3) return 'Buen comienzo. Mantén el ritmo.';
  if (streak < 7) return 'Estás en racha: una semana completa está cerca.';
  if (streak < 30) return 'Imparable. Tu disciplina ya es un hábito.';
  return 'Nivel leyenda. Eres un ejemplo a seguir.';
};

/**
 * Streak detail sheet.
 *
 * `studyHistory` accepts either dates or session objects — the store hands over
 * full session documents, and the previous version called `new Date()` straight
 * on those objects, which always produced an invalid date, so no day ever lit up.
 */
export default function StreakModal({
  visible,
  onClose,
  currentStreak = 0,
  maxStreak = 0,
  studyHistory = [],
  dailyActivity = 0,
  restDays = [],
  restRemaining = MAX_REST_PER_WEEK,
  onStartSession,
}) {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const studiedDates = studyHistory
    .map((entry) => {
      const raw = entry?.date ?? entry;
      const parsed = new Date(raw);
      return isNaN(parsed.getTime()) ? null : parsed;
    })
    .filter(Boolean);

  const hasStudiedOn = (date) => studiedDates.some((d) => isSameDay(d, date));
  const restDaySet = new Set(restDays);

  // The stored record can lag behind an in-progress streak, so take the higher.
  const record = Math.max(maxStreak, currentStreak);
  const isRecord = currentStreak > 0 && currentStreak >= record;

  const metToday = dailyActivity >= DAILY_GOAL_MIN;
  const remaining = Math.max(0, DAILY_GOAL_MIN - dailyActivity);
  const alight = currentStreak > 0;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.hero}>
        <View style={styles.flameWrap}>
          <Flame
            size={56}
            color={alight ? tokens.colors.premiumText : tokens.colors.textDisabled}
            fill={alight ? tokens.colors.premiumText : 'transparent'}
            strokeWidth={1.5}
          />
        </View>
        <Text style={styles.count}>{currentStreak}</Text>
        <Text style={styles.countLabel}>
          {currentStreak === 1 ? 'día en racha' : 'días en racha'}
        </Text>
        <Text style={styles.motivation}>{getMotivation(currentStreak)}</Text>

        {/* Worth keeping visible: if the streak resets, the record survives */}
        {record > 0 ? (
          <View style={styles.recordPill}>
            <Trophy size={13} color={tokens.colors.premiumText} />
            <Text style={styles.recordText}>
              {isRecord ? 'Es tu mejor racha' : `Tu récord: ${record} días`}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.weekRow}>
        {week.map((day, i) => {
          const studied = hasStudiedOn(day);
          const rested = restDaySet.has(format(day, 'yyyy-MM-dd'));
          const isTodayCell = isSameDay(day, today);
          const future = isAfter(day, today);

          return (
            <View key={i} style={styles.dayItem}>
              <Text style={[styles.dayLabel, isTodayCell && styles.dayLabelToday]}>
                {format(day, 'EEEEE', { locale: es }).toUpperCase()}
              </Text>
              <View
                style={[
                  styles.dayCircle,
                  studied && styles.dayCircleStudied,
                  rested && !studied && styles.dayCircleRested,
                  isTodayCell && styles.dayCircleToday,
                  future && styles.dayCircleFuture,
                ]}
              >
                {studied ? (
                  <Flame size={15} color={tokens.colors.bgBase} fill={tokens.colors.bgBase} />
                ) : rested ? (
                  <Moon size={13} color={tokens.colors.accent} />
                ) : (
                  <View style={styles.emptyDot} />
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* Rest days are invisible mechanics otherwise — spell out the rule and
          what's left, so a skipped day doesn't feel like a bug. */}
      <View style={styles.restBox}>
        <View style={styles.restHead}>
          <Moon size={14} color={tokens.colors.accent} />
          <Text style={styles.restTitle}>Días de descanso</Text>
          <View style={styles.restCounter}>
            <Text style={styles.restCounterText}>
              {restRemaining}/{MAX_REST_PER_WEEK}
            </Text>
          </View>
        </View>
        <Text style={styles.restBody}>
          Puedes saltarte {MAX_REST_PER_WEEK} días por semana sin perder la racha. Se usan solos
          cuando no estudias, y el contador se reinicia cada lunes.
        </Text>
      </View>

      {/* dailyActivity comes back from checkDailyStreak and was going unused */}
      <View style={styles.goalBox}>
        <Text style={styles.goalText}>
          {metToday
            ? `Objetivo de hoy cumplido: ${dailyActivity} min estudiados.`
            : `Te faltan ${remaining} min hoy para mantener la racha.`}
        </Text>
        <View style={styles.goalTrack}>
          <View
            style={[
              styles.goalFill,
              { width: `${Math.min(100, (dailyActivity / DAILY_GOAL_MIN) * 100)}%` },
            ]}
          />
        </View>
      </View>

      {!metToday && onStartSession ? (
        <Button
          title="Estudiar ahora"
          fullWidth
          style={styles.cta}
          onPress={() => {
            onClose();
            onStartSession();
          }}
        />
      ) : (
        <Button
          title="Entendido"
          variant="secondary"
          fullWidth
          style={styles.cta}
          onPress={onClose}
        />
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    marginBottom: 24,
  },
  flameWrap: {
    marginBottom: 4,
  },
  count: {
    fontFamily: tokens.typography.families.display,
    fontSize: 56,
    lineHeight: 60,
    color: tokens.colors.textPrimary,
  },
  countLabel: {
    fontFamily: font.medium,
    fontSize: 13,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: tokens.colors.textSecondary,
  },
  motivation: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
    marginTop: 12,
  },
  recordPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.premiumBg,
    borderWidth: 1,
    borderColor: tokens.colors.premiumBorder,
  },
  recordText: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: tokens.colors.premiumText,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayItem: {
    alignItems: 'center',
    gap: 8,
  },
  dayLabel: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: tokens.colors.textSecondary,
  },
  dayLabelToday: {
    color: tokens.colors.accent,
  },
  dayCircle: {
    width: 38,
    height: 38,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surfaceHover,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayCircleStudied: {
    backgroundColor: tokens.colors.premiumText,
  },
  dayCircleToday: {
    borderColor: tokens.colors.accent,
  },
  dayCircleRested: {
    backgroundColor: tokens.colors.accentSoftBg,
    borderColor: tokens.colors.accentSoftBorder,
  },
  dayCircleFuture: {
    backgroundColor: 'transparent',
    borderColor: tokens.colors.borderDefault,
  },
  restBox: {
    marginTop: 20,
    padding: 14,
    borderRadius: tokens.radius.btn,
    backgroundColor: tokens.colors.accentSoftBg,
    borderWidth: 1,
    borderColor: tokens.colors.accentSoftBorder,
  },
  restHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  restTitle: {
    flex: 1,
    fontFamily: font.semibold,
    fontSize: 13,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: tokens.colors.accent,
  },
  restCounter: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accent,
  },
  restCounterText: {
    fontFamily: font.bold,
    fontSize: 12,
    color: '#FFFFFF',
  },
  restBody: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.textSecondary,
  },
  emptyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.textDisabled,
  },
  goalBox: {
    marginTop: 24,
    padding: 14,
    borderRadius: tokens.radius.btn,
    backgroundColor: tokens.colors.background,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
  },
  goalText: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textPrimary,
    marginBottom: 10,
  },
  goalTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.colors.surfaceHover,
    overflow: 'hidden',
  },
  goalFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: tokens.colors.premiumText,
  },
  cta: {
    marginTop: 20,
  },
});
