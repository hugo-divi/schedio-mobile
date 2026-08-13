import {
  View,
  Image,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight, Plus } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';
import { db } from '../../services/firebase';
import { auth } from '../../services/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { checkDailyStreak } from '../../services/streaks';
import {
  calculateXpForLevel,
  calculateXpForNextLevel,
  getNextRank,
} from '../../services/gamification';
import {
  getUpcomingExams,
  getPendingExams,
  createExam,
  updateExam,
  deleteExam,
} from '../../services/exams';
import {
  rankExams,
  summarizeStudyLoad,
  localDateKey,
  HIGH_PRIORITY_SCORE,
} from '../../services/priority';
import { generateRecommendations } from '../../services/aiService';
import usePreferencesStore from '../../store/preferencesStore';
import { registerForPushNotifications } from '../../services/notificationService';
import useUserStore from '../../store/userStore';
import useAuthStore from '../../store/authStore';
import Skeleton from '../../components/Skeleton';
import GradeModal from '../../components/GradeModal';
import StreakModal from '../../components/StreakModal';
import MiniCalendar from '../../components/MiniCalendar';
import EventModal from '../../components/EventModal';
import DayOptionsModal from '../../components/DayOptionsModal';
import GuidedTour from '../../components/GuidedTour';
import Card from '../../components/ui/Card';
import Chip from '../../components/ui/Chip';
import Button from '../../components/ui/Button';
import SectionTitle, { OverlineLabel } from '../../components/ui/SectionTitle';
import PrimeBadge, { StatsStrip } from '../../components/ui/PrimeBadge';
import { Emoji } from '../../components/ui/Emoji';

// How long the dashboard data stays fresh before returning to the tab
// triggers a refetch.
const FOCUS_REFETCH_MS = 60_000;

// Main Dashboard component - Refactored for global subject sync
export default function Dashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const autoGradePrompt = usePreferencesStore((state) => state.autoGradePrompt);
  const isPrime = useAuthStore((state) => state.isPrime);

  const [refreshing, setRefreshing] = useState(false);
  const [userData, setUserData] = useState({
    streak: 0,
    dailyActivity: 0,
    maxStreak: 0,
    restDays: [],
    restRemaining: 2,
    level: 1,
    xp: 0,
    rank: 'Aprendiz',
  });
  const [profile, setProfile] = useState(null);
  const [exams, setExams] = useState([]);
  const [pendingExams, setPendingExams] = useState([]);
  // One selector per slice: destructuring the store subscribed this screen to
  // every write in it, so unrelated changes redrew the whole dashboard. The
  // actions are stable, so they're read through getState() at the call site.
  const subjects = useUserStore((state) => state.subjects);
  const sessionHistory = useUserStore((state) => state.sessionHistory);
  // Already normalised by the store (raw doc keeps it under `profile.averageGrade`).
  const averageGrade = useUserStore((state) => state.profile?.averageGrade) ?? 0;
  const hasAverage = parseFloat(averageGrade) > 0;
  const [loading, setLoading] = useState(true);

  const scrollViewRef = useRef(null);
  const statsStripRef = useRef(null);
  const heroCardRef = useRef(null);
  const pendingSectionRef = useRef(null);
  const calendarSectionRef = useRef(null);
  const [aiRecommendation, setAiRecommendation] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const lastFetchRef = useRef(0);

  // Modals state
  const [streakModalOpen, setStreakModalOpen] = useState(false);
  const [eventModalVisible, setEventModalVisible] = useState(false);
  const [dayOptionsVisible, setDayOptionsVisible] = useState(false);
  const [gradeModalVisible, setGradeModalVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [examToGrade, setExamToGrade] = useState(null);
  const [eventsForSelectedDay, setEventsForSelectedDay] = useState([]);
  const [examsExpanded, setExamsExpanded] = useState(false);
  const [tourVisible, setTourVisible] = useState(false);

  const [easterEggVisible, setEasterEggVisible] = useState(false);
  // Timestamps of recent taps on the header logo, pruned to the trailing
  // window on every tap — cheaper than a timer per tap and self-resets if
  // the student pauses partway through.
  const logoTapsRef = useRef([]);

  const calculateDaysLeft = (date) => {
    const now = new Date();
    const examDate = new Date(date);

    // Reset hours to compare only days
    now.setHours(0, 0, 0, 0);
    examDate.setHours(0, 0, 0, 0);

    const diffTime = examDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Mañana';
    if (diffDays < 0) return 'Pasado';
    return `En ${diffDays} días`;
  };

  // Memoized against its real dependencies (refreshing, autoGradePrompt) so
  // useFocusEffect and onRefresh below always call the current closure —
  // an unmemoized fetchData handed to a useCallback with an empty dep array
  // is exactly what froze the auto-grade prompt at whatever autoGradePrompt
  // was on mount, deaf to the student turning it off in Ajustes afterwards.
  const fetchData = useCallback(async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      // Skeletons are for a screen with nothing on it. Coming back to the tab
      // refetches in the background, and swapping the content out for
      // placeholders while it does read as the tab being slow.
      if (!refreshing && !lastFetchRef.current) setLoading(true);

      // Fetch user profile
      const profileDoc = await getDoc(doc(db, 'users', user.uid));
      const profileData = profileDoc.exists() ? profileDoc.data() : null;
      setProfile(profileData);

      // First time this account reaches the Dashboard: ask once for push
      // permission. `notificationsConsent` is undefined until this runs, so
      // it never asks again regardless of the answer.
      if (profileData && profileData.notificationsConsent === undefined) {
        registerForPushNotifications(user.uid);
      }

      const [streakData, examsData, pendingExamsData] = await Promise.all([
        checkDailyStreak(user.uid),
        getUpcomingExams(user.uid, 20),
        getPendingExams(user.uid),
      ]);

      // Load subjects and user details via store
      await useUserStore.getState().loadUserData(user.uid);

      setUserData({
        streak: streakData.currentStreak || 0,
        // Minutes studied today and the personal record, straight from
        // checkDailyStreak. StreakModal shows both; they were being discarded.
        dailyActivity: streakData.dailyActivity || 0,
        maxStreak: streakData.maxStreak || 0,
        restDays: streakData.restDays || [],
        restRemaining: streakData.restRemaining ?? 0,
        level: profileData?.gamification?.level || 1,
        xp: profileData?.gamification?.xp || 0,
        rank: profileData?.gamification?.rank || 'Aprendiz',
      });

      setExams(examsData || []);
      setPendingExams(pendingExamsData || []);

      loadAIRecommendation(profileData, examsData, streakData);

      // Auto-Prompt logic
      if (pendingExamsData && pendingExamsData.length > 0 && autoGradePrompt) {
        setTimeout(() => {
          setExamToGrade(pendingExamsData[0]);
          setGradeModalVisible(true);
        }, 1000);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      lastFetchRef.current = Date.now();
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshing, autoGradePrompt]);

  const loadAIRecommendation = async (profileData, examsData, streakData) => {
    try {
      setAiLoading(true);
      const recommendations = await generateRecommendations({
        profile: profileData,
        exams: examsData,
        streak: streakData,
      });
      setAiRecommendation(recommendations?.mainRecommendation);
    } catch (error) {
      console.error('Error loading AI recommendation:', error);
      // Fallback recommendation
      if (examsData && examsData.length > 0) {
        const daysUntil = Math.ceil(
          (new Date(examsData[0].date) - new Date()) / (1000 * 60 * 60 * 24)
        );
        if (daysUntil <= 3) {
          setAiRecommendation(`¡A por el examen de ${examsData[0].name} ! 🎯`);
        } else {
          setAiRecommendation('¿Qué quieres aprender hoy? 🚀');
        }
      } else if (streakData?.currentStreak > 0) {
        setAiRecommendation(
          `🔥 ¡Llevas ${streakData.currentStreak} días de racha! Mantén el impulso.`
        );
      } else {
        setAiRecommendation(
          '¡Comienza tu racha hoy! Una sesión de 25 minutos es todo lo que necesitas.'
        );
      }
    } finally {
      setAiLoading(false);
    }
  };

  const examRefreshTrigger = useUserStore((state) => state.examRefreshTrigger);

  useEffect(() => {
    fetchData();
    // `fetchData` deliberately excluded: it's now memoized against
    // `refreshing` (see its own definition), and this effect has no
    // throttle guard the way useFocusEffect below does — reacting to every
    // identity change here would re-fetch mid pull-to-refresh, right when
    // `refreshing` flips and hands this effect a new `fetchData` closure.
    // examRefreshTrigger is the only thing that should start a fetch here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examRefreshTrigger]);

  useFocusEffect(
    useCallback(() => {
      // Refresh when coming back to the tab, so the user doesn't have to pull.
      // Mount is already covered by the effect above (lastFetchRef is still 0),
      // and the staleness window keeps a quick glance from re-running the
      // Firestore reads and the Gemini call every single time.
      if (!lastFetchRef.current) return;
      if (Date.now() - lastFetchRef.current < FOCUS_REFETCH_MS) return;
      fetchData();
      // `fetchData` isn't memoized (a fresh closure every render, reading
      // current prefs like autoGradePrompt), so it belongs in the deps —
      // an empty array froze this callback on its first-ever closure,
      // permanently reading whatever autoGradePrompt was at mount.
    }, [fetchData])
  );

  // Session history feeds StreakModal's calendar. Kept out of fetchData so the
  // data/notification flow there stays untouched.
  useEffect(() => {
    const user = auth.currentUser;
    if (user) useUserStore.getState().loadSessionHistory(user.uid);
  }, []);

  // Independent effect for the tour to prevent render loops
  useEffect(() => {
    if (profile && profile.isNewAccount && !profile.hasSeenTour) {
      setTourVisible(true);
    }
  }, [profile]);

  const handleTourComplete = async () => {
    setTourVisible(false);
    try {
      const user = auth.currentUser;
      if (user) {
        const { doc, updateDoc } = await import('firebase/firestore');
        await updateDoc(doc(db, 'users', user.uid), {
          hasSeenTour: true,
          isNewAccount: false,
        });
      }
    } catch (error) {
      console.error('Error updating tour status:', error);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  // Calendar Handlers
  const handleDayClick = (date) => {
    // Compared as local calendar days. Read through `toISOString()` these never
    // matched: a calendar cell carries local midnight, which is the previous day
    // in UTC, while an exam carries its real time, which isn't — so tapping a day
    // that had exams on it opened as if it were empty.
    const dateStr = localDateKey(date);
    const eventsOnDay = exams.filter((e) => localDateKey(e.date) === dateStr);

    setSelectedDate(date);

    if (eventsOnDay.length > 0) {
      setEventsForSelectedDay(eventsOnDay);
      setDayOptionsVisible(true);
    } else {
      setSelectedEvent(null);
      setEventModalVisible(true);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!eventId) {
      console.error('No eventId provided for deletion');
      return;
    }
    try {
      await deleteExam(eventId);
      setEventModalVisible(false);
      setDayOptionsVisible(false);
      fetchData();
      if (Platform.OS !== 'web') {
        const Haptics = require('expo-haptics');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Error deleting event:', error);
      Alert.alert('Error', 'No se pudo eliminar el evento.');
    }
  };

  const LOGO_TAP_COUNT = 4;
  const LOGO_TAP_WINDOW_MS = 1500;

  const handleLogoPress = () => {
    const now = Date.now();
    const recent = [...logoTapsRef.current, now].filter((t) => now - t < LOGO_TAP_WINDOW_MS);
    logoTapsRef.current = recent;
    if (recent.length < LOGO_TAP_COUNT) return;

    logoTapsRef.current = [];
    setEasterEggVisible(true);
    if (Platform.OS !== 'web') {
      const Haptics = require('expo-haptics');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleSaveEvent = async (eventData) => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      // `id` identifies the document, it shouldn't also live inside it —
      // createExam spreads whatever it gets, so this was storing `id: null`.
      const fields = { ...eventData };
      delete fields.id;

      const newEvent = {
        userId: user.uid,
        completed: false,
        // Spread last: the modal now supplies type and priority, and hardcoding
        // them after this would overwrite whatever the user picked.
        ...fields,
      };

      if (selectedEvent) {
        await updateExam(selectedEvent.id, newEvent);
      } else {
        await createExam(newEvent);
      }

      // Refresh data
      fetchData();
    } catch (error) {
      console.error('Error saving event:', error);
      Alert.alert('Error', 'No se pudo guardar el evento.');
    }
  };

  // Grading Handlers
  const handleOpenGradeModal = (exam) => {
    setExamToGrade(exam);
    setGradeModalVisible(true);
  };

  const handleSaveGrade = async (examId, grade, weight) => {
    if (!examId) {
      console.error('Cannot save grade: examId is null');
      Alert.alert('Error', 'Ocurrió un error al identificar el examen. Intenta recargar.');
      return;
    }

    try {
      await updateExam(examId, {
        grade,
        weight,
        completed: true,
      });

      // 2. Trigger Average Recalculation (Global & Subject)
      const user = auth.currentUser;
      if (user) {
        await useUserStore.getState().updateAverageGrade(user.uid);
      }

      await fetchData();
    } catch (error) {
      console.error('Error saving grade:', error);
      Alert.alert('Error', 'No se pudo guardar la nota.');
    }
  };

  // Priority chip reads the computed score, not the stored `priority` field.
  // That field held whatever the user picked in EventModal and never changed
  // afterwards, so the chip couldn't react to an exam getting closer, to a bad
  // grade landing, or to the subject going untouched for a fortnight.
  const urgentExamIds = useMemo(() => {
    const ctx = {
      studiedMinutesBySubject: summarizeStudyLoad(sessionHistory),
    };
    return new Set(
      rankExams(exams, subjects, ctx)
        .filter((exam) => exam.priorityScore >= HIGH_PRIORITY_SCORE)
        .map((exam) => exam.id)
    );
  }, [exams, subjects, sessionHistory]);

  const isUrgent = (exam) => urgentExamIds.has(exam.id);

  const formatShortDate = (date) =>
    new Date(date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

  const firstName = (profile?.displayName || '').trim().split(' ')[0];
  const isFreshAccount = subjects.length === 0 && exams.length === 0;

  // The AI line is the headline when we have one; otherwise fall back to the
  // empty-state copy for new accounts, or a neutral prompt.
  const welcomeTitle = aiRecommendation
    ? aiRecommendation
    : isFreshAccount
      ? `Rompe el hielo${firstName ? `, ${firstName}` : ''}`
      : '¿Qué quieres aprender hoy? 🚀';

  // Only the onboarding copy earns a second line. Any generic filler here just
  // repeats what the AI headline (or the button right below) already says.
  const welcomeBody = isFreshAccount
    ? 'Añade tus asignaturas y haz una sesión corta de 15 min para activar tu racha y empezar a ganar XP.'
    : null;

  const visibleExams = examsExpanded ? exams : exams.slice(0, 3);

  // Progress through the current level, as a percentage. The curve is
  // XP = level² × 100, so each level spans a wider XP band than the last.
  const levelProgress = (() => {
    const floor = calculateXpForLevel(userData.level);
    const ceiling = calculateXpForNextLevel(userData.level);
    const span = ceiling - floor;
    if (span <= 0) return 0;
    return Math.min(100, Math.max(0, ((userData.xp - floor) / span) * 100));
  })();

  // The near-miss nudge: this used to only live on the ranks screen, so the
  // "almost there" pull never showed up unless the student had already
  // gone looking for it.
  const nextRank = getNextRank(userData.level);
  const xpToNextRank = nextRank
    ? Math.max(0, Math.round(calculateXpForLevel(nextRank.minLevel) - userData.xp))
    : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.brand}
            onPress={handleLogoPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Schedio"
          >
            {/* Small badge + wordmark, not the old wordmark-crop pill — one
                fixed white surface the size of an icon reads as a mark, not
                as a loud card competing with PrimeBadge for attention. */}
            <View style={styles.brandBadge}>
              <Image
                source={require('../../assets/images/schedio-mark.png')}
                style={styles.brandMark}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.brandName}>Schedio</Text>
          </TouchableOpacity>

          <PrimeBadge active={isPrime} onPress={() => router.push('/plus')} />
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.colors.accent}
          />
        }
      >
        {/* Streak / level / average — each cell opens its own screen or sheet */}
        <View ref={statsStripRef}>
          <Animated.View entering={FadeInDown.duration(320)}>
            <StatsStrip>
              <TouchableOpacity
                style={styles.statCell}
                onPress={() => setStreakModalOpen(true)}
                activeOpacity={0.7}
              >
                <Emoji name="fire" style={styles.statEmoji} />
                <View style={styles.statTextWrap}>
                  <OverlineLabel style={styles.statLabel}>Racha</OverlineLabel>
                  <Text
                    style={[
                      styles.statValue,
                      userData.streak === 0 && { color: tokens.colors.textDisabled },
                    ]}
                  >
                    {userData.streak} {userData.streak === 1 ? 'día' : 'días'}
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={styles.statDivider} />

              <TouchableOpacity
                style={styles.statCell}
                onPress={() => router.push('/dashboard/ranks')}
                activeOpacity={0.7}
              >
                <Emoji name="highVoltage" style={styles.statEmoji} />
                <View style={styles.statTextWrap}>
                  <OverlineLabel style={styles.statLabel}>Nivel</OverlineLabel>
                  <Text style={[styles.statValue, { color: tokens.colors.accent }]}>
                    {userData.level}
                  </Text>
                  {/* How far into the current level the user is */}
                  <View style={styles.xpTrack}>
                    <View style={[styles.xpFill, { width: `${levelProgress}%` }]} />
                  </View>
                  {xpToNextRank !== null ? (
                    <Text style={styles.nextRankHint} numberOfLines={1}>
                      {xpToNextRank} XP para {nextRank.title}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>

              <View style={styles.statDivider} />

              <TouchableOpacity
                style={styles.statCell}
                onPress={() => router.push('/dashboard/profile')}
                activeOpacity={0.7}
              >
                <Emoji name="barChart" style={styles.statEmoji} />
                <View style={styles.statTextWrap}>
                  <OverlineLabel style={styles.statLabel}>Media</OverlineLabel>
                  <Text
                    style={[styles.statValue, !hasAverage && { color: tokens.colors.textDisabled }]}
                  >
                    {hasAverage ? String(averageGrade).replace('.', ',') : '—'}
                  </Text>
                </View>
              </TouchableOpacity>
            </StatsStrip>
          </Animated.View>
        </View>

        {/* Welcome / AI suggestion */}
        <View ref={heroCardRef}>
          <Card padding={20}>
            {loading ? (
              <>
                <Skeleton width={54} height={14} style={{ marginBottom: 10 }} />
                <Skeleton width="85%" height={24} style={{ marginBottom: 10 }} />
                <Skeleton width="70%" height={16} style={{ marginBottom: 20 }} />
                <Skeleton width="100%" height={46} borderRadius={tokens.radius.btn} />
              </>
            ) : (
              <>
                <OverlineLabel style={styles.welcomeOverline}>Hoy</OverlineLabel>

                {aiLoading ? (
                  <View style={styles.aiLoadingRow}>
                    <Text style={styles.welcomeTitle}>Analizando tu día…</Text>
                    <ActivityIndicator size="small" color={tokens.colors.textSecondary} />
                  </View>
                ) : (
                  <Text style={[styles.welcomeTitle, !welcomeBody && styles.welcomeTitleAlone]}>
                    {welcomeTitle}
                  </Text>
                )}

                {welcomeBody ? <Text style={styles.welcomeBody}>{welcomeBody}</Text> : null}

                <Button
                  title="Comenzar sesión de estudio →"
                  fullWidth
                  onPress={() => router.push('/dashboard/study')}
                />
              </>
            )}
          </Card>
        </View>

        {/* Calendar — month grid and upcoming exams share one card */}
        <View ref={calendarSectionRef}>
          <SectionTitle>Tu calendario</SectionTitle>

          {loading ? (
            <Skeleton width="100%" height={320} borderRadius={tokens.radius.card} />
          ) : (
            <Card padding={16}>
              <MiniCalendar exams={exams} subjects={subjects} onDayClick={handleDayClick} />

              <View style={styles.cardDivider} />

              <OverlineLabel style={styles.examsOverline}>Próximos exámenes</OverlineLabel>

              {exams.length === 0 ? (
                <View>
                  <Text style={styles.emptyText}>
                    Añade tus exámenes y tareas para mantener tu calendario organizado.
                  </Text>
                  <Button
                    title="Añadir examen o tarea"
                    variant="secondary"
                    fullWidth
                    icon={<Plus size={16} color={tokens.colors.textPrimary} />}
                    onPress={() => {
                      setSelectedEvent(null);
                      setSelectedDate(new Date());
                      setEventModalVisible(true);
                    }}
                  />
                </View>
              ) : (
                visibleExams.map((exam, index) => {
                  const subject = subjects.find((s) => s.id === exam.subjectId);
                  const urgent = isUrgent(exam);
                  // The "show all" row acts as the last divider when collapsed.
                  const isLast = index === visibleExams.length - 1 && exams.length <= 3;

                  return (
                    <TouchableOpacity
                      key={exam.id}
                      style={[styles.examRow, isLast && styles.rowLast]}
                      activeOpacity={0.7}
                      onPress={() =>
                        router.push({
                          pathname: '/dashboard/plans',
                          params: { highlightId: exam.id },
                        })
                      }
                      onLongPress={() => {
                        setSelectedEvent(exam);
                        setSelectedDate(new Date(exam.date));
                        setEventModalVisible(true);
                      }}
                    >
                      <View style={styles.rowMain}>
                        <View style={styles.examTitleRow}>
                          <View
                            style={[
                              styles.subjectDot,
                              { backgroundColor: subject?.color || tokens.colors.accent },
                            ]}
                          />
                          <Text style={styles.examName} numberOfLines={1}>
                            {exam.name}
                          </Text>
                        </View>
                        <Text style={styles.rowMeta}>
                          {exam.type === 'task' ? 'Tarea · ' : ''}
                          {formatShortDate(exam.date)} ·{' '}
                          {calculateDaysLeft(exam.date).toLowerCase()}
                        </Text>
                      </View>

                      <Chip active={urgent}>{urgent ? 'Prioridad alta' : 'Normal'}</Chip>
                    </TouchableOpacity>
                  );
                })
              )}

              {/* Sits with the list it controls, rather than up in the heading */}
              {exams.length > 3 && (
                <TouchableOpacity
                  style={styles.showAllRow}
                  onPress={() => setExamsExpanded(!examsExpanded)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.link}>
                    {examsExpanded ? 'Ver menos' : `Ver los ${exams.length} exámenes`}
                  </Text>
                  <ChevronRight size={15} color={tokens.colors.accent} />
                </TouchableOpacity>
              )}
            </Card>
          )}
        </View>

        {/* Exams waiting for a grade */}
        {!loading && pendingExams.length > 0 && (
          <View ref={pendingSectionRef}>
            <SectionTitle>Por calificar</SectionTitle>

            <Card padding={16}>
              {pendingExams.map((exam, index) => {
                const isLast = index === pendingExams.length - 1;
                return (
                  <TouchableOpacity
                    key={exam.id}
                    style={[styles.pendingRow, isLast && styles.rowLast]}
                    activeOpacity={0.9}
                    delayLongPress={500}
                    onLongPress={() => {
                      Alert.alert(
                        'Eliminar examen',
                        `¿Estás seguro de que quieres eliminar "${exam.name}"?`,
                        [
                          { text: 'Cancelar', style: 'cancel' },
                          {
                            text: 'Eliminar',
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                await deleteExam(exam.id);
                                fetchData();
                              } catch {
                                Alert.alert('Error', 'No se pudo eliminar el examen.');
                              }
                            },
                          },
                        ]
                      );
                    }}
                  >
                    <View style={styles.rowMain}>
                      <Text style={styles.pendingName} numberOfLines={1}>
                        {exam.name}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {subjects.find((s) => s.id === exam.subjectId)?.name || 'Asignatura'} ·
                        Examen terminado · {formatShortDate(exam.date)}
                      </Text>
                    </View>

                    <Button
                      title="Añadir nota →"
                      variant="secondary"
                      onPress={() => handleOpenGradeModal(exam)}
                      style={styles.gradeButton}
                    />
                  </TouchableOpacity>
                );
              })}
            </Card>
          </View>
        )}
      </ScrollView>

      {tourVisible && (
        <GuidedTour
          onComplete={handleTourComplete}
          tourRefs={{
            scrollViewRef,
            statsStripRef,
            heroCardRef,
            pendingSectionRef,
            calendarSectionRef,
          }}
          hasPendingExams={pendingExams.length > 0}
        />
      )}

      {/* Modals */}
      <StreakModal
        visible={streakModalOpen}
        onClose={() => setStreakModalOpen(false)}
        currentStreak={userData.streak}
        studyHistory={sessionHistory}
        dailyActivity={userData.dailyActivity}
        maxStreak={userData.maxStreak}
        restDays={userData.restDays}
        restRemaining={userData.restRemaining}
        onStartSession={() => router.push('/dashboard/study')}
      />

      <EventModal
        visible={eventModalVisible}
        onClose={() => setEventModalVisible(false)}
        selectedDate={selectedDate}
        existingEvent={selectedEvent}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
        subjects={subjects}
      />

      <DayOptionsModal
        visible={dayOptionsVisible}
        onClose={() => setDayOptionsVisible(false)}
        date={selectedDate}
        events={eventsForSelectedDay}
        subjects={subjects}
        onAddNew={() => {
          setDayOptionsVisible(false);
          setSelectedEvent(null);
          setTimeout(() => setEventModalVisible(true), 220);
        }}
        onEditEvent={(event) => {
          setDayOptionsVisible(false);
          setSelectedEvent(event);
          setTimeout(() => setEventModalVisible(true), 220);
        }}
      />

      <GradeModal
        visible={gradeModalVisible}
        onClose={() => setGradeModalVisible(false)}
        exam={examToGrade}
        onSave={handleSaveGrade}
      />

      {/* Easter egg: four quick taps on the header logo */}
      <Modal
        visible={easterEggVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEasterEggVisible(false)}
      >
        <Pressable style={styles.easterEggOverlay} onPress={() => setEasterEggVisible(false)}>
          <Pressable onPress={() => {}}>
            <Card padding={28} style={styles.easterEggCard}>
              <Text style={styles.easterEggText}>
                Hecho en A Coruña con la misión de que el estudio sea fácil
              </Text>
              <Text style={styles.easterEggAuthor}>~ Divi ~</Text>
            </Card>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const font = tokens.typography.families.inter;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },

  // Header
  header: {
    paddingHorizontal: 20,
    // Breathing room so scrolling content doesn't appear to touch the pill.
    paddingBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandBadge: {
    width: 30,
    height: 30,
    borderRadius: tokens.radius.btn,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMark: {
    width: 17,
    height: 17,
  },
  brandName: {
    fontFamily: font.bold,
    fontSize: 17,
    letterSpacing: 0.1,
    color: tokens.colors.textPrimary,
  },

  // Streak / level strip
  statCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 11,
  },
  statEmoji: {
    width: 22,
    height: 22,
  },
  statTextWrap: {
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    letterSpacing: 0.3,
  },
  statValue: {
    fontFamily: font.bold,
    fontSize: 16,
    color: tokens.colors.textPrimary,
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    backgroundColor: tokens.colors.borderDefault,
  },
  xpTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: tokens.colors.surfaceHover,
    marginTop: 6,
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: tokens.colors.accent,
  },
  nextRankHint: {
    fontFamily: font.medium,
    fontSize: 10,
    color: tokens.colors.textSecondary,
    marginTop: 4,
  },

  // Scroll body
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
    gap: 24,
  },

  // Welcome card
  welcomeOverline: {
    marginBottom: 6,
  },
  aiLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  welcomeTitle: {
    fontFamily: font.bold,
    fontSize: 22,
    color: tokens.colors.textPrimary,
    marginBottom: 8,
    flexShrink: 1,
  },
  // Without a body line the title carries the gap before the CTA itself.
  welcomeTitleAlone: {
    marginBottom: 18,
  },
  welcomeBody: {
    fontFamily: font.regular,
    fontSize: tokens.typography.body.size,
    lineHeight: 22,
    color: tokens.colors.textSecondary,
    marginBottom: 16,
  },

  // Shared rows
  link: {
    fontFamily: font.semibold,
    fontSize: 13,
    color: tokens.colors.accent,
  },
  showAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingTop: 14,
  },
  cardDivider: {
    height: 1,
    backgroundColor: tokens.colors.borderDefault,
    marginTop: 16,
    marginBottom: 16,
  },
  examsOverline: {
    marginBottom: 4,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowMeta: {
    fontFamily: font.regular,
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  emptyText: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 20,
    color: tokens.colors.textSecondary,
    paddingTop: 12,
    paddingBottom: 16,
  },

  // Upcoming exams
  examRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderDefault,
  },
  examTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subjectDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  examName: {
    fontFamily: font.medium,
    fontSize: 15,
    color: tokens.colors.textPrimary,
    flexShrink: 1,
  },

  // Pending grades
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderDefault,
  },
  pendingName: {
    fontFamily: font.medium,
    fontSize: 15,
    color: tokens.colors.textPrimary,
  },
  gradeButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },

  // Rank celebration
  // Easter egg
  easterEggOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  easterEggCard: {
    alignItems: 'center',
  },
  easterEggText: {
    fontFamily: font.semibold,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    color: tokens.colors.textPrimary,
  },
  easterEggAuthor: {
    fontFamily: font.regular,
    fontSize: 14,
    textAlign: 'center',
    color: tokens.colors.textSecondary,
    marginTop: 12,
  },
});
