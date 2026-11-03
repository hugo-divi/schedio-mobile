import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Check, ChevronRight, Sparkles } from 'lucide-react-native';
import { tokens } from '../theme/tokens';
import Card from './ui/Card';
import Button from './ui/Button';
import Skeleton from './Skeleton';
import { OverlineLabel } from './ui/SectionTitle';
import useLocaleFormat from '../hooks/useLocaleFormat';

const font = tokens.typography.families.inter;
const SUBJECT_FALLBACK = '#A1A1AA';
const MAX_ROWS = 4;

/**
 * "Hoy" on Inicio (beta): the day's plan, and the one button that starts it.
 *
 * Schedio's promise is that it tells you what to study today. This card used
 * to be an AI sentence and a generic "Comenzar sesión" — the plan itself lived
 * a tab away. Now the first thing on Inicio is the list of today's sessions,
 * the next one with its button, and a headline worked out from the plan
 * (services/todayCopy.js), so it reads right whether or not the AI has
 * anything to say today. When it does, its line goes underneath, marked.
 */
export default function TodayCard({
  view,
  tasks,
  coachLine,
  coachIsAi,
  loading,
  onStart,
  onOpenPlan,
  onAddExam,
}) {
  const { formatDate } = useLocaleFormat();

  if (loading || !view) {
    return (
      <Card padding={20}>
        <Skeleton width={90} height={14} style={{ marginBottom: 12 }} />
        <Skeleton width="80%" height={24} style={{ marginBottom: 10 }} />
        <Skeleton width="100%" height={52} style={{ marginBottom: 10 }} />
        <Skeleton width="100%" height={46} borderRadius={tokens.radius.btn} />
      </Card>
    );
  }

  const rows = tasks.slice(0, MAX_ROWS);
  const hidden = tasks.length - rows.length;
  const canStart =
    view.next && ['pending', 'partial', 'exam_tomorrow', 'exam_today'].includes(view.state);

  return (
    <Card padding={20}>
      <View style={styles.head}>
        <OverlineLabel>Hoy · {formatDate(new Date(), 'weekdayLongDay')}</OverlineLabel>
        {view.total > 0 ? (
          <Text style={styles.count}>
            {view.doneCount}/{view.total} hechas
          </Text>
        ) : null}
      </View>

      <Text style={styles.headline}>{view.headline}</Text>
      {view.detail ? (
        <Text style={styles.detail} numberOfLines={2}>
          {view.detail}
        </Text>
      ) : null}

      {rows.length > 0 ? (
        <View style={styles.list}>
          {rows.map((task) => (
            <View key={task.id} style={styles.row}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: task.subjectColor || SUBJECT_FALLBACK },
                  task.completed && styles.dotDone,
                ]}
              >
                {task.completed ? <Check size={10} color="#FFFFFF" strokeWidth={3} /> : null}
              </View>
              <View style={styles.rowBody}>
                <Text
                  style={[styles.rowSubject, task.completed && styles.rowDone]}
                  numberOfLines={1}
                >
                  {task.subjectName || 'Estudio'}
                  {task.isOptional ? <Text style={styles.optional}> · opcional</Text> : null}
                </Text>
                <Text style={styles.rowText} numberOfLines={1}>
                  {task.text}
                </Text>
              </View>
              <Text style={[styles.rowMinutes, task.completed && styles.rowDone]}>
                {task.duration} min
              </Text>
            </View>
          ))}
          {hidden > 0 ? (
            <Text style={styles.more}>
              y {hidden} {hidden === 1 ? 'sesión más' : 'sesiones más'}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actions}>
        {canStart ? (
          <Button
            title={`Empezar · ${view.next.duration} min`}
            fullWidth
            onPress={() => onStart(view.next)}
          />
        ) : view.state === 'no_exams' ? (
          <Button title="Añadir examen" fullWidth onPress={onAddExam} />
        ) : null}
        <TouchableOpacity
          onPress={onOpenPlan}
          style={styles.planLink}
          accessibilityRole="button"
          activeOpacity={0.7}
        >
          <Text style={styles.planLinkText}>
            {view.state === 'empty' ? 'Adelantar una sesión desde el plan' : 'Ver el plan completo'}
          </Text>
          <ChevronRight size={15} color={tokens.colors.accent} />
        </TouchableOpacity>
      </View>

      {coachLine ? (
        <View style={styles.coach}>
          {coachIsAi ? (
            <Sparkles size={14} color={tokens.colors.textSecondary} strokeWidth={1.75} />
          ) : null}
          <Text style={styles.coachText}>{coachLine}</Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  count: { fontFamily: font.medium, fontSize: 12, color: tokens.colors.textSecondary },
  headline: {
    fontFamily: font.bold,
    fontSize: 21,
    lineHeight: 27,
    color: tokens.colors.textPrimary,
  },
  detail: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: tokens.colors.textSecondary,
    marginTop: 4,
  },
  list: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.borderDefault,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderDefault,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.9,
  },
  dotDone: { opacity: 0.55 },
  rowBody: { flex: 1, minWidth: 0 },
  rowSubject: { fontFamily: font.semibold, fontSize: 14, color: tokens.colors.textPrimary },
  rowText: {
    fontFamily: font.regular,
    fontSize: 12,
    color: tokens.colors.textSecondary,
    marginTop: 1,
  },
  rowMinutes: { fontFamily: font.medium, fontSize: 13, color: tokens.colors.textSecondary },
  rowDone: { color: tokens.colors.textDisabled, textDecorationLine: 'line-through' },
  optional: { fontFamily: font.regular, fontSize: 12, color: tokens.colors.textSecondary },
  more: {
    fontFamily: font.regular,
    fontSize: 12,
    color: tokens.colors.textSecondary,
    paddingTop: 8,
  },
  actions: { marginTop: 16, gap: 4 },
  planLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
  },
  planLinkText: { fontFamily: font.semibold, fontSize: 14, color: tokens.colors.accent },
  coach: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.borderDefault,
  },
  coachText: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.textSecondary,
  },
});
