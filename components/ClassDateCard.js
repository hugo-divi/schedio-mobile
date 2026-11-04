import { View, Text, StyleSheet } from 'react-native';
import { CalendarCheck, CalendarClock, CalendarPlus } from 'lucide-react-native';
import { tokens } from '../theme/tokens';
import Button from './ui/Button';
import useLocaleFormat from '../hooks/useLocaleFormat';
import { STATUS, countdownLabel, trustLine } from '../services/classDates';

const font = tokens.typography.families.inter;
const SUBJECT_FALLBACK = '#A1A1AA';
const CHANGED = tokens.colors.premiumText;

/**
 * Una fecha del aula, y lo único que puedes hacer con ella ahora.
 *
 * El bloque de la izquierda es el día: lo primero que se busca en una lista
 * de exámenes. A la derecha, qué es, qué entra y cuánto fiarse ("Confirmada
 * por 6 de la clase", "Cambiada hace 2 h por Laura M."), porque las fechas
 * las pone la propia clase. Abajo, según en qué punto esté respecto a tu
 * calendario (services/classDates.js):
 *
 *   no la tienes          → Añadir a mi calendario
 *   tienes una parecida   → Es el mismo examen · Añadir aparte
 *   la clase la cambió    → Mover el mío · Dejar la mía
 *   ya la tienes          → "En tu calendario" (sin botón)
 */
export default function ClassDateCard({
  row,
  now,
  busy,
  subjectColor,
  onAdd,
  onLink,
  onAccept,
  onKeep,
}) {
  const { formatDate } = useLocaleFormat();
  if (!row) return null;
  const { classDate, status, daysLeft, exam } = row;
  const trust = trustLine(classDate, { now });
  const color = subjectColor || row.subject?.color || SUBJECT_FALLBACK;
  const soon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 2;
  const past = status === STATUS.PAST || daysLeft < 0;
  const title =
    classDate.title ||
    `${classDate.type === 'task' ? 'Entrega' : 'Examen'} de ${classDate.subjectName || 'clase'}`;

  return (
    <View
      style={[
        styles.card,
        status === STATUS.CHANGED && styles.cardChanged,
        past && styles.cardPast,
      ]}
      accessible
      accessibilityLabel={`${title}, ${formatDate(classDate.date, 'weekdayLongDayMonth')}, ${countdownLabel(daysLeft)}`}
    >
      <View style={styles.top}>
        <View style={[styles.day, { borderColor: color }]}>
          <Text style={styles.dayWeek}>{formatDate(classDate.date, 'weekdayShort')}</Text>
          <Text style={styles.dayNumber}>{classDate.date.getDate()}</Text>
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            <Text style={[styles.countdown, soon && styles.countdownSoon]}>
              {countdownLabel(daysLeft)}
            </Text>
          </View>
          {classDate.title && classDate.subjectName ? (
            <Text style={[styles.subject, { color }]} numberOfLines={1}>
              {classDate.subjectName}
            </Text>
          ) : null}
          {classDate.includes ? (
            <Text style={styles.includes} numberOfLines={2}>
              Entra: {classDate.includes}
            </Text>
          ) : null}
          <Text
            style={[
              styles.trust,
              trust.tone === 'confirmed' && styles.trustConfirmed,
              trust.tone === 'changed' && styles.trustChanged,
            ]}
          >
            {trust.text}
          </Text>
        </View>
      </View>

      {status === STATUS.IN_CALENDAR ? (
        <View style={styles.inCalendar}>
          <CalendarCheck size={15} color={tokens.colors.success} />
          <Text style={styles.inCalendarText}>
            {row.userMoved
              ? `En tu calendario el ${formatDate(exam.date, 'weekdayLongDay')} (la moviste tú)`
              : 'En tu calendario y en tu plan'}
          </Text>
        </View>
      ) : null}

      {status === STATUS.NOT_ADDED ? (
        <View style={styles.actions}>
          <Button
            title="Añadir a mi calendario"
            icon={<CalendarPlus size={16} color="#FFFFFF" />}
            onPress={onAdd}
            loading={busy}
            fullWidth
          />
        </View>
      ) : null}

      {status === STATUS.MAYBE_SAME ? (
        <View style={styles.actions}>
          <Text style={styles.question}>
            Ya tienes «{exam.name}» el {formatDate(exam.date, 'weekdayLongDay')}. ¿Es el mismo?
          </Text>
          <View style={styles.pair}>
            <View style={styles.half}>
              <Button title="Es el mismo" onPress={onLink} loading={busy} fullWidth />
            </View>
            <View style={styles.half}>
              <Button
                title="Añadir aparte"
                variant="secondary"
                onPress={onAdd}
                disabled={busy}
                fullWidth
              />
            </View>
          </View>
        </View>
      ) : null}

      {status === STATUS.CHANGED ? (
        <View style={styles.actions}>
          <View style={styles.changedRow}>
            <CalendarClock size={15} color={CHANGED} />
            <Text style={styles.changedText}>
              La clase lo ha movido del {formatDate(row.from, 'weekdayLongDay')} al{' '}
              {formatDate(row.to, 'weekdayLongDay')}.
            </Text>
          </View>
          <View style={styles.pair}>
            <View style={styles.half}>
              <Button title="Mover el mío" onPress={onAccept} loading={busy} fullWidth />
            </View>
            <View style={styles.half}>
              <Button
                title="Dejar la mía"
                variant="secondary"
                onPress={onKeep}
                disabled={busy}
                fullWidth
              />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.colors.surfaceCard,
    borderRadius: tokens.radius.card,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    padding: 14,
    gap: 12,
  },
  cardChanged: { borderColor: tokens.colors.premiumBorder },
  cardPast: { opacity: 0.6 },
  top: { flexDirection: 'row', gap: 12 },
  day: {
    width: 48,
    height: 54,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.bgBase,
  },
  dayWeek: {
    fontFamily: font.medium,
    fontSize: 11,
    color: tokens.colors.textSecondary,
    textTransform: 'uppercase',
  },
  dayNumber: { fontFamily: font.bold, fontSize: 20, color: tokens.colors.textPrimary },
  body: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: {
    flex: 1,
    fontFamily: font.semibold,
    fontSize: 15,
    lineHeight: 20,
    color: tokens.colors.textPrimary,
  },
  countdown: { fontFamily: font.medium, fontSize: 12, color: tokens.colors.textSecondary },
  countdownSoon: { color: tokens.colors.accent },
  subject: { fontFamily: font.medium, fontSize: 13 },
  includes: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 18,
    color: tokens.colors.textSecondary,
  },
  trust: {
    fontFamily: font.regular,
    fontSize: 12,
    color: tokens.colors.textSecondary,
    marginTop: 2,
  },
  trustConfirmed: { color: tokens.colors.success },
  trustChanged: { color: CHANGED },
  inCalendar: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inCalendarText: { fontFamily: font.medium, fontSize: 13, color: tokens.colors.textSecondary },
  actions: { gap: 10 },
  question: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 18,
    color: tokens.colors.textPrimary,
  },
  pair: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  changedRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  changedText: { flex: 1, fontFamily: font.medium, fontSize: 13, lineHeight: 18, color: CHANGED },
});
