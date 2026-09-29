import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Flame, Moon, LifeBuoy, Snowflake, Play, Trophy } from 'lucide-react-native';
import { startOfWeek, addDays, isSameDay, isAfter, format } from 'date-fns';
import { tokens } from '../theme/tokens';
import { MAX_REST_PER_WEEK, MAX_FREE_DAYS, DAILY_GOAL_MINUTES } from '../services/streaks';
import Button from './ui/Button';
import useLocaleFormat from '../hooks/useLocaleFormat';

const font = tokens.typography.families.inter;

const getMotivation = (streak) => {
  if (streak === 0) return 'Cada día es una nueva oportunidad. Empieza hoy.';
  if (streak < 3) return 'Buen comienzo. Mantén el ritmo.';
  if (streak < 7) return 'Estás en racha: una semana completa está cerca.';
  if (streak < 30) return 'Imparable. Tu disciplina ya es un hábito.';
  return 'Nivel leyenda. Eres un ejemplo a seguir.';
};

/**
 * El detalle de la racha.
 *
 * Antes esta pantalla llamaba "días de descanso" a los dos comodines, que se
 * gastaban solos al fallar un día. Eran tres cosas distintas metidas en una, y
 * ahora se ven las tres por separado — la regla que las une es que **un día
 * solo cuenta si el plan te pidió algo**:
 *
 *  · los días que marcas libres, con tareas igual pero sin consecuencias;
 *  · los comodines, dos por semana, que ahora gastas tú a propósito;
 *  · la racha congelada, cuando no hay exámenes y por tanto no hay plan.
 *
 * Sigue siendo un componente de presentación: recibe los números y los dibuja.
 * Quien los carga y quien escribe es `app/dashboard/streak.js`.
 *
 * `studyHistory` acepta fechas u objetos de sesión — el store entrega
 * documentos completos, y la versión anterior llamaba `new Date()` sobre ellos,
 * lo que daba siempre fecha inválida y ningún día se encendía nunca.
 */
export default function StreakDetail({
  currentStreak = 0,
  maxStreak = 0,
  studyHistory = [],
  dailyActivity = 0,
  restDays = [],
  restRemaining = MAX_REST_PER_WEEK,
  freeDays = [],
  frozen = false,
  onToggleFreeDay,
  onSpendJoker,
  onStartSession,
}) {
  const { formatDate, weekdayInitials } = useLocaleFormat();
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
  const jokerDaySet = new Set(restDays);
  const todayIndex = (today.getDay() + 6) % 7;
  const todayIsFree = freeDays.includes(todayIndex);

  // The stored record can lag behind an in-progress streak, so take the higher.
  const record = Math.max(maxStreak, currentStreak);
  const isRecord = currentStreak > 0 && currentStreak >= record;

  const metToday = dailyActivity >= DAILY_GOAL_MINUTES;
  const remaining = Math.max(0, DAILY_GOAL_MINUTES - dailyActivity);
  const goalPercent = Math.min(100, (dailyActivity / DAILY_GOAL_MINUTES) * 100);
  const canSpendJoker =
    !todayIsFree && !frozen && restRemaining > 0 && !jokerDaySet.has(format(today, 'yyyy-MM-dd'));

  return (
    <>
      {/* El número dentro de un aro, no una llama enorme: la llama vive ahora
          en los días de la semana, donde distingue un día estudiado de uno
          libre o de uno con comodín. */}
      <View style={styles.hero}>
        <View style={styles.ring}>
          <Text style={styles.count}>{currentStreak}</Text>
        </View>
        <Text style={styles.countLabel}>
          {currentStreak === 1 ? 'día seguido' : 'días seguidos'}
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
          const isFree = freeDays.includes(i);
          const usedJoker = jokerDaySet.has(format(day, 'yyyy-MM-dd'));
          const studied = hasStudiedOn(day);
          const isTodayCell = isSameDay(day, today);
          const future = isAfter(day, today);

          return (
            <View key={i} style={styles.dayItem}>
              <Text style={[styles.dayLabel, isTodayCell && styles.dayLabelToday]}>
                {weekdayInitials[i]}
              </Text>
              <View
                style={[
                  styles.dayCircle,
                  studied && !isFree && styles.dayCircleStudied,
                  isFree && styles.dayCircleFree,
                  usedJoker && !isFree && !studied && styles.dayCircleJoker,
                  isTodayCell && styles.dayCircleToday,
                  future && !isFree && styles.dayCircleFuture,
                ]}
              >
                {isFree ? (
                  <Moon size={13} color={tokens.colors.accent} />
                ) : studied ? (
                  <Flame
                    size={15}
                    color={tokens.colors.background}
                    fill={tokens.colors.background}
                  />
                ) : usedJoker ? (
                  <LifeBuoy size={13} color={tokens.colors.premiumText} />
                ) : (
                  <View style={styles.emptyDot} />
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* ── Días libres ─────────────────────────────────────────────────── */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>TUS DÍAS LIBRES</Text>
        <Text style={styles.sectionCount}>
          {freeDays.length === 0
            ? 'ninguno'
            : `${freeDays.length} ${freeDays.length === 1 ? 'día' : 'días'}`}
        </Text>
      </View>
      <View style={styles.box}>
        <View style={styles.pickRow}>
          {weekdayInitials.map((initial, i) => {
            const active = freeDays.includes(i);
            return (
              <TouchableOpacity
                key={i}
                onPress={() => onToggleFreeDay?.(i)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${initial}, ${active ? 'día libre' : 'día de estudio'}`}
                style={[styles.pick, active && styles.pickOn]}
              >
                <Text style={[styles.pickText, active && styles.pickTextOn]}>{initial}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.boxBody}>
          El plan te sigue proponiendo tareas esos días, por si te apetece adelantar. La diferencia
          es que no pasa nada si no las haces: no cuentan ni a favor ni en contra de la racha.
        </Text>
        <Text style={styles.boxWarn}>Puedes marcar hasta {MAX_FREE_DAYS}.</Text>
      </View>

      {/* ── Comodines ───────────────────────────────────────────────────── */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>COMODINES</Text>
      </View>
      <View style={styles.box}>
        <View style={styles.jokerRow}>
          {Array.from({ length: MAX_REST_PER_WEEK }, (_, i) => (
            <View key={i} style={[styles.token, i >= restRemaining && styles.tokenSpent]}>
              <LifeBuoy
                size={15}
                color={i < restRemaining ? tokens.colors.premiumText : tokens.colors.textDisabled}
              />
            </View>
          ))}
          <Text style={styles.jokerCount}>
            {restRemaining} de {MAX_REST_PER_WEEK} esta semana
          </Text>
        </View>
        <Text style={styles.boxBody}>Para los días que se tuercen. Se reinician cada lunes.</Text>
        <TouchableOpacity
          onPress={onSpendJoker}
          disabled={!canSpendJoker}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSpendJoker }}
          style={[styles.ghostButton, !canSpendJoker && styles.ghostButtonOff]}
        >
          <LifeBuoy
            size={15}
            color={canSpendJoker ? tokens.colors.textSecondary : tokens.colors.textDisabled}
          />
          <Text style={[styles.ghostText, !canSpendJoker && styles.ghostTextOff]}>
            Hoy no puedo
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Hoy ─────────────────────────────────────────────────────────── */}
      {todayIsFree ? (
        <StateBox
          icon={<Moon size={15} color={tokens.colors.accent} />}
          tint={styles.tintAccent}
          title="Hoy es día libre"
          body="El plan no te pide nada. Descansa."
        />
      ) : frozen ? (
        <StateBox
          icon={<Snowflake size={15} color={tokens.colors.textSecondary} />}
          tint={styles.tintMute}
          title="Racha congelada"
          body="No tienes exámenes por delante, así que no hay plan y la racha te espera intacta."
        />
      ) : (
        <>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>OBJETIVO DE HOY</Text>
          </View>
          <View style={styles.box}>
            <View style={styles.goalRow}>
              <Text style={styles.goalValue}>{dailyActivity} min</Text>
              <Text style={styles.goalLabel}>
                {metToday ? 'objetivo cumplido' : `de ${DAILY_GOAL_MINUTES} para mantenerla`}
              </Text>
            </View>
            <View style={styles.goalTrack}>
              <View style={[styles.goalFill, { width: `${goalPercent}%` }]} />
            </View>
            {!metToday && onStartSession ? (
              <Button
                title="Estudiar ahora"
                fullWidth
                style={styles.cta}
                onPress={onStartSession}
                icon={<Play size={15} color="#FFFFFF" />}
              />
            ) : (
              <Text style={styles.goalDone}>
                Te faltan {remaining} min… nada: ya has cumplido hoy.
              </Text>
            )}
          </View>
        </>
      )}
    </>
  );
}

/** Una fila de estado: icono con su tinte, título y explicación. */
function StateBox({ icon, tint, title, body }) {
  return (
    <View style={styles.box}>
      <View style={styles.stateRow}>
        <View style={[styles.stateIcon, tint]}>{icon}</View>
        <View style={styles.stateBody}>
          <Text style={styles.stateTitle}>{title}</Text>
          <Text style={styles.stateText}>{body}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    marginBottom: 22,
  },
  ring: {
    width: 112,
    height: 112,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accentSoftBg,
    borderWidth: 1.5,
    borderColor: tokens.colors.accentSoftBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  count: {
    fontFamily: tokens.typography.families.display,
    fontSize: 54,
    lineHeight: 58,
    color: tokens.colors.accent,
  },
  countLabel: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
  motivation: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
  },
  recordPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: tokens.radius.pill,
    backgroundColor: 'rgba(212, 169, 76, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212, 169, 76, 0.3)',
  },
  recordText: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: tokens.colors.premiumText,
  },

  weekRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 24,
  },
  dayItem: {
    flex: 1,
    alignItems: 'center',
  },
  dayLabel: {
    fontFamily: font.semibold,
    fontSize: 11,
    color: tokens.colors.textDisabled,
    marginBottom: 7,
  },
  dayLabelToday: {
    color: tokens.colors.accent,
  },
  dayCircle: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayCircleStudied: {
    backgroundColor: tokens.colors.accent,
  },
  // Contorno y no relleno: un día libre no es un logro, es un hueco previsto.
  dayCircleFree: {
    backgroundColor: 'transparent',
    borderColor: tokens.colors.accentSoftBorder,
  },
  dayCircleJoker: {
    backgroundColor: 'rgba(212, 169, 76, 0.12)',
    borderColor: 'rgba(212, 169, 76, 0.3)',
  },
  dayCircleToday: {
    borderWidth: 2,
    borderColor: tokens.colors.accent,
  },
  dayCircleFuture: {
    opacity: 0.5,
  },
  emptyDot: {
    width: 5,
    height: 5,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.textDisabled,
  },

  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
  },
  sectionTitle: {
    flex: 1,
    fontFamily: font.semibold,
    fontSize: 10,
    letterSpacing: 1.1,
    color: tokens.colors.textDisabled,
  },
  sectionCount: {
    fontFamily: font.medium,
    fontSize: 11,
    color: tokens.colors.textSecondary,
  },
  box: {
    backgroundColor: tokens.colors.surfaceCard,
    borderRadius: tokens.radius.card,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    padding: 14,
    marginBottom: 18,
  },
  boxBody: {
    fontFamily: font.regular,
    fontSize: 11.5,
    lineHeight: 17,
    color: tokens.colors.textSecondary,
    marginTop: 11,
  },
  boxWarn: {
    fontFamily: font.regular,
    fontSize: 11.5,
    lineHeight: 17,
    color: tokens.colors.premiumText,
    marginTop: 8,
  },

  pickRow: {
    flexDirection: 'row',
    gap: 5,
  },
  pick: {
    flex: 1,
    paddingVertical: 9,
    // Mismo criterio que la dificultad en Perfil: opcion seleccionable, forma
    // de pastilla.
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surfaceHover,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  pickOn: {
    backgroundColor: tokens.colors.accentSoftBg,
    borderColor: tokens.colors.accentSoftBorder,
  },
  pickText: {
    fontFamily: font.medium,
    fontSize: 12,
    color: tokens.colors.textSecondary,
  },
  pickTextOn: {
    fontFamily: font.semibold,
    color: tokens.colors.accent,
  },

  jokerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  token: {
    width: 30,
    height: 30,
    borderRadius: tokens.radius.pill,
    backgroundColor: 'rgba(212, 169, 76, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212, 169, 76, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenSpent: {
    backgroundColor: 'transparent',
    borderColor: tokens.colors.borderDefault,
  },
  jokerCount: {
    marginLeft: 'auto',
    fontFamily: font.medium,
    fontSize: 11,
    color: tokens.colors.textSecondary,
  },
  ghostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 12,
    paddingVertical: 11,
    borderRadius: tokens.radius.btn,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
  },
  ghostButtonOff: {
    opacity: 0.4,
  },
  ghostText: {
    fontFamily: font.medium,
    fontSize: 12.5,
    color: tokens.colors.textSecondary,
  },
  ghostTextOff: {
    color: tokens.colors.textDisabled,
  },

  goalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 7,
  },
  goalValue: {
    fontFamily: tokens.typography.families.display,
    fontSize: 24,
    lineHeight: 26,
    color: tokens.colors.textPrimary,
  },
  goalLabel: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 11.5,
    color: tokens.colors.textSecondary,
  },
  goalTrack: {
    height: 5,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surfaceHover,
    marginTop: 10,
    overflow: 'hidden',
  },
  goalFill: {
    height: '100%',
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accent,
  },
  goalDone: {
    fontFamily: font.medium,
    fontSize: 12.5,
    color: tokens.colors.success,
    marginTop: 12,
  },
  cta: {
    marginTop: 12,
  },

  stateRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
  },
  stateIcon: {
    width: 30,
    height: 30,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  stateBody: {
    flex: 1,
  },
  stateTitle: {
    fontFamily: font.medium,
    fontSize: 12.5,
    color: tokens.colors.textPrimary,
  },
  stateText: {
    fontFamily: font.regular,
    fontSize: 11.5,
    lineHeight: 17,
    color: tokens.colors.textSecondary,
    marginTop: 3,
  },
  tintAccent: {
    backgroundColor: tokens.colors.accentSoftBg,
    borderColor: tokens.colors.accentSoftBorder,
  },
  tintMute: {
    backgroundColor: 'transparent',
    borderColor: tokens.colors.borderDefault,
  },
});
