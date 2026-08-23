import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';

import { tokens } from '../../theme/tokens';
import useUserStore from '../../store/userStore';
import { auth } from '../../services/firebase';
import { buildAnalysis } from '../../services/productivityService';
import { getUpcomingExams } from '../../services/exams';
import Card from '../../components/ui/Card';

const font = tokens.typography.families.inter;

const SUBJECT_FALLBACK_COLOR = tokens.colors.textDisabled;

const formatMinutes = (minutes) => {
  const value = Math.round(minutes || 0);
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
};

function Block({ title, children }) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      {children}
    </View>
  );
}

function WeekBars({ days }) {
  const peak = Math.max(1, ...days.map((d) => d.minutes));
  return (
    <View style={styles.weekBars}>
      {days.map((day) => (
        <View key={day.dateStr} style={styles.weekBarCell}>
          <View style={styles.weekBarTrack}>
            <View
              style={[
                styles.weekBarFill,
                { height: `${Math.max(3, (day.minutes / peak) * 100)}%` },
                day.minutes === 0 && { backgroundColor: tokens.colors.borderDefault },
              ]}
            />
          </View>
          <Text style={styles.weekBarLabel}>{day.dayName.slice(0, 1)}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The performance analysis, as its own screen rather than the bottom sheet it
 * used to be. Six blocks of prose in a sheet meant the student was reading a
 * long text through a window they had to hold open; as a screen it gets the
 * whole viewport and the back gesture everyone already knows. Same content,
 * same order, same numbers — `buildAnalysis` is shared with Perfil, which
 * still shows its `headline` on the card that leads here.
 */
export default function AnalysisScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = auth.currentUser;

  const sessionHistory = useUserStore((state) => state.sessionHistory);
  const subjects = useUserStore((state) => state.subjects);
  const [exams, setExams] = useState([]);

  useEffect(() => {
    if (!user?.uid) return;
    if ((sessionHistory || []).length === 0) {
      useUserStore.getState().loadSessionHistory(user.uid);
    }
    // Exams feed the subject health and the overload risk. A failure here must
    // not take the screen down with it.
    getUpcomingExams(user.uid, 30)
      .then(setExams)
      .catch((error) => console.warn('Could not load exams for the analysis', error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const analysis = useMemo(
    () => buildAnalysis({ sessions: sessionHistory || [], subjects, exams }),
    [sessionHistory, subjects, exams]
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <ChevronLeft size={22} color={tokens.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Análisis</Text>
        <View style={styles.back} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lead}>{analysis.headline}</Text>

        {!analysis.hasSessions ? (
          <Card padding={20}>
            <Text style={styles.empty}>
              Cuando termines tu primera sesión, aquí aparecerá tu ritmo, tus hábitos y las materias
              que necesitan atención.
            </Text>
          </Card>
        ) : (
          <Card padding={20}>
            <Block title="Ritmo semanal">
              <Text style={styles.paragraph}>
                {formatMinutes(analysis.thisWeek)} esta semana
                {analysis.previousWeek > 0
                  ? ` · ${formatMinutes(analysis.previousWeek)} la anterior`
                  : ''}
              </Text>
              <WeekBars days={analysis.week} />
            </Block>

            {analysis.patterns.hasEnoughData ? (
              <Block title="Tus hábitos">
                <Text style={styles.paragraph}>
                  Sueles estudiar por la {analysis.patterns.preferredTimeOfDay.toLowerCase()}
                  {analysis.goldenHour
                    ? `, sobre todo a las ${String(analysis.goldenHour.hour).padStart(2, '0')}:00`
                    : ''}
                  . Tus sesiones duran {analysis.patterns.averageDuration} min de media y tu
                  constancia es {analysis.patterns.consistency.toLowerCase()} (
                  {analysis.patterns.studyFrequency}{' '}
                  {analysis.patterns.studyFrequency === 1 ? 'sesión' : 'sesiones'} en los últimos 7
                  días).
                </Text>
              </Block>
            ) : null}

            <Block title={`Técnica recomendada · ${analysis.technique.name}`}>
              <Text style={styles.paragraph}>{analysis.technique.description}</Text>
            </Block>

            {analysis.needsAttention.length > 0 ? (
              <Block title="Materias que necesitan atención">
                {analysis.needsAttention.map((subject) => (
                  <View key={subject.id} style={styles.healthRow}>
                    <View
                      style={[
                        styles.healthDot,
                        { backgroundColor: subject.color || SUBJECT_FALLBACK_COLOR },
                      ]}
                    />
                    <Text style={styles.healthName} numberOfLines={1}>
                      {subject.name}
                    </Text>
                    <Text style={styles.healthStatus}>{subject.status}</Text>
                  </View>
                ))}
              </Block>
            ) : null}

            <Block title={`Riesgo de sobrecarga · ${analysis.overload.riskLevel}`}>
              <Text style={styles.paragraph}>{analysis.overload.recommendation}</Text>
              {analysis.overload.reasons.map((reason) => (
                <Text key={reason} style={styles.bullet}>
                  · {reason}
                </Text>
              ))}
            </Block>
          </Card>
        )}
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
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderDefault,
  },
  back: {
    width: 36,
    height: 36,
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
  body: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 16,
  },
  paragraph: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 21,
    color: tokens.colors.textSecondary,
  },
  lead: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
    color: tokens.colors.textPrimary,
  },
  empty: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 21,
    color: tokens.colors.textSecondary,
  },
  block: {
    marginBottom: 22,
  },
  blockTitle: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: tokens.colors.textPrimary,
    marginBottom: 6,
  },
  bullet: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 21,
    color: tokens.colors.textSecondary,
    marginTop: 4,
  },
  weekBars: {
    flexDirection: 'row',
    gap: 6,
    height: 72,
    marginTop: 14,
  },
  weekBarCell: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  weekBarTrack: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
  },
  weekBarFill: {
    width: '100%',
    borderRadius: 4,
    backgroundColor: tokens.colors.accent,
  },
  weekBarLabel: {
    fontFamily: font.medium,
    fontSize: 11,
    color: tokens.colors.textDisabled,
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  healthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  healthName: {
    flex: 1,
    minWidth: 0,
    fontFamily: font.medium,
    fontSize: 14,
    color: tokens.colors.textPrimary,
  },
  healthStatus: {
    fontFamily: font.regular,
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
});
