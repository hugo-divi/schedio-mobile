import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  StatusBar,
  ActivityIndicator,
  Dimensions,
  AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import { Play, Pause, X, Check, Plus, Trash2, BellOff } from 'lucide-react-native';
import Svg, {
  Circle as SvgCircle,
  Path,
  Line,
  Rect as SvgRect,
  Defs,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeOut,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { tokens } from '../../theme/tokens';
import { BASE_XP_PER_MINUTE } from '../../services/gamification';
import { getUpcomingExams } from '../../services/exams';
import {
  updateStudySessionNotification,
  stopStudySessionNotification,
  addNotificationActionListener,
  ACTION,
} from '../../services/studyNotification';
import useAuthStore from '../../store/authStore';
import useUserStore from '../../store/userStore';
import usePreferencesStore from '../../store/preferencesStore';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import BottomSheet from '../../components/ui/BottomSheet';
import SectionTitle, { OverlineLabel } from '../../components/ui/SectionTitle';
import SchedioLogoReveal from '../../components/SchedioLogoReveal';

const font = tokens.typography.families.inter;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const MIN_MINUTES = 15;
const MAX_MINUTES = 120;
const MINUTE_STEP = 5;
const DEFAULT_MINUTES = 25;

// Where an in-progress session is snapshotted so it survives the screen
// locking, the app backgrounding, or Android killing the process outright —
// none of which should cost the student their timer or their objectives.
const SESSION_STORAGE_KEY = '@schedio/active_study_session';
// Longer than the longest possible session (MAX_MINUTES) plus a grace window:
// past this, a leftover snapshot is abandoned, not resumable, and shouldn't
// prompt "continue?" for a session from days ago.
const STALE_SESSION_MS = (MAX_MINUTES + 30) * 60 * 1000;

// Timer ring geometry, scaled from the 220px circle in the design.
const RING_SIZE = Math.min(220, SCREEN_WIDTH - 96);
const RING_STROKE = 6;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// Drag the session screen down this far to ask about stopping.
const DRAG_TO_STOP = 120;

// Swipe an objective this far left to delete it.
const SWIPE_REVEAL = 96;
const SWIPE_COMMIT = 64;

// Only use KeepAwake on native to avoid web WakeLock errors
const activateKeepAwake = () => {
  if (Platform.OS !== 'web') {
    try {
      const { activateKeepAwakeAsync } = require('expo-keep-awake');
      activateKeepAwakeAsync();
    } catch (e) {
      console.warn('KeepAwake error:', e);
    }
  }
};

const deactivateKeepAwake = () => {
  if (Platform.OS !== 'web') {
    try {
      const { deactivateKeepAwake } = require('expo-keep-awake');
      deactivateKeepAwake();
    } catch (e) {
      console.warn('KeepAwake deactivate error:', e);
    }
  }
};

const formatTime = (seconds) => {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const sessionPhrase = (mins) => {
  if (mins < 30) return '😌 Estudio de chill';
  if (mins < 45) return '🎯 Alto foco';
  if (mins < 60) return '🧠 Deep work';
  return '⚡️ Modo Schedio activado';
};

// The four faces map onto the 1–5 focusScore that history.js renders as stars.
const MOODS = [
  { key: 'frown', score: 2, label: 'Ha ido mal' },
  { key: 'meh', score: 3, label: 'Regular' },
  { key: 'smile', score: 4, label: 'Bien' },
  { key: 'laugh', score: 5, label: 'Muy bien' },
];

/**
 * The four faces from the design (`Face` in ui_kits/app/Study.html): one ring,
 * two dot eyes, and a mouth that carries the whole expression. Traced in the
 * same 24x24 space, so the geometry matches the mock exactly.
 */
function Face({ type, size = 36, color }) {
  const mouth = {
    frown: (
      <Path
        d="M16 16s-1.5-2-4-2-4 2-4 2"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
    ),
    meh: (
      <Line x1={8} y1={15} x2={16} y2={15} stroke={color} strokeWidth={2} strokeLinecap="round" />
    ),
    smile: (
      <Path
        d="M8 14s1.5 2 4 2 4-2 4-2"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
    ),
    laugh: <Path d="M7 13a5 5 0 0 0 10 0z" fill={color} />,
  }[type];

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <SvgCircle cx={12} cy={12} r={10} stroke={color} strokeWidth={2} fill="none" />
      <SvgCircle cx={9} cy={9.5} r={1.1} fill={color} />
      <SvgCircle cx={15} cy={9.5} r={1.1} fill={color} />
      {mouth}
    </Svg>
  );
}

const daysUntil = (date) => {
  const now = new Date();
  const target = new Date(date);
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
};

/** "Examen en 5 días" under the selected subject, when there's one coming. */
const examReason = (exam) => {
  if (!exam) return null;
  const days = daysUntil(exam.date);
  if (days < 0) return null;
  if (days === 0) return 'Examen hoy';
  if (days === 1) return 'Examen mañana';
  return `Examen en ${days} días`;
};

// ── Pieces ──────────────────────────────────────────────────────────────────

function SubjectChip({ subject, reason, selected, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.subjectChip, selected && styles.subjectChipSelected]}
    >
      <View
        style={[styles.subjectAvatar, { backgroundColor: subject.color || tokens.colors.accent }]}
      >
        <Text style={styles.subjectInitial}>{(subject.name || '?').charAt(0).toUpperCase()}</Text>
      </View>
      <View>
        <Text style={styles.subjectName} numberOfLines={1}>
          {subject.name}
        </Text>
        {selected && reason ? <Text style={styles.subjectReason}>{reason}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

function Checkbox({ checked, onPress, size = 20 }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[
        styles.checkbox,
        { width: size, height: size },
        checked ? styles.checkboxOn : styles.checkboxOff,
      ]}
    >
      {checked ? <Check size={size * 0.65} color="#FFFFFF" strokeWidth={3} /> : null}
    </TouchableOpacity>
  );
}

function CheckRow({ label, checked, onToggle, strike = true }) {
  return (
    <View style={styles.checkRow}>
      <Checkbox checked={checked} onPress={onToggle} />
      <Text
        style={[styles.checkRowLabel, checked && strike && styles.checkRowLabelDone]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </View>
  );
}

/** Objective row that slides left to reveal a delete action. */
function SwipeToDelete({ onDelete, children }) {
  const dx = useSharedValue(0);

  const pan = Gesture.Pan()
    // Only claim the gesture once it's clearly horizontal, so the surrounding
    // ScrollView keeps its vertical drag.
    .activeOffsetX([-14, 14])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      dx.value = Math.min(0, Math.max(event.translationX, -SWIPE_REVEAL));
    })
    .onEnd(() => {
      if (dx.value < -SWIPE_COMMIT) {
        dx.value = withTiming(-SCREEN_WIDTH, { duration: 180 }, (finished) => {
          if (finished) runOnJS(onDelete)();
        });
      } else {
        dx.value = withSpring(0, { damping: 20, stiffness: 220 });
      }
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }] }));

  return (
    <View style={styles.swipeWrap}>
      <View style={styles.swipeAction}>
        <Trash2 size={16} color="#FFFFFF" />
      </View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.swipeContent, rowStyle]}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

function AddObjectiveRow({ value, onChangeText, onAdd }) {
  return (
    <View style={styles.addRow}>
      <TextInput
        style={styles.addInput}
        placeholder="Añadir objetivo"
        placeholderTextColor={tokens.colors.textDisabled}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onAdd}
        returnKeyType="done"
      />
      <TouchableOpacity
        style={styles.addButton}
        onPress={onAdd}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Añadir objetivo"
      >
        <Plus size={18} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

function MoodPicker({ value, onChange }) {
  return (
    <View style={styles.moodRow}>
      {MOODS.map(({ key, label }) => {
        const active = value === key;
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onChange(key)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
            style={styles.moodButton}
          >
            <Face
              type={key}
              size={36}
              color={active ? tokens.colors.accent : tokens.colors.textSecondary}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function StatTile({ value, label, accent = false }) {
  return (
    <View style={styles.statTile}>
      <Text
        style={[styles.statValue, accent && { color: tokens.colors.accent }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/**
 * Reminder shown before a session starts. An app can't silence the phone for
 * the student, so this only asks — hence no "activar", just an acknowledgement.
 */
function FocusReminderSheet({ visible, onClose, onStart, dontShow, onToggleDontShow }) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.sheetIcon}>
        <BellOff size={24} color={tokens.colors.accent} />
      </View>
      <Text style={styles.sheetTitle}>Silencia las notificaciones</Text>
      <Text style={styles.sheetBody}>
        Pon el móvil en silencio antes de empezar. Es la diferencia entre una sesión enfocada y
        media hora de interrupciones.
      </Text>

      <CheckRow
        label="No volver a mostrar"
        checked={dontShow}
        onToggle={onToggleDontShow}
        strike={false}
      />

      <View style={{ marginTop: 20 }}>
        <Button title="Empezar sesión" onPress={onStart} fullWidth />
      </View>
    </BottomSheet>
  );
}

/** Offered on launch when a session was cut short by the app closing — the
 * timer and objectives would otherwise just be gone. */
function RecoverSessionSheet({ visible, subjectName, onContinue, onDiscard }) {
  return (
    <BottomSheet visible={visible} onClose={onDiscard}>
      <View style={styles.sheetIcon}>
        <Play size={24} color={tokens.colors.accent} fill={tokens.colors.accent} />
      </View>
      <Text style={styles.sheetTitle}>Tenías una sesión sin terminar</Text>
      <Text style={styles.sheetBody}>
        {subjectName ? `${subjectName} — ` : ''}se cerró la app antes de que acabara. Puedes seguir
        donde lo dejaste o descartarla.
      </Text>

      <View style={{ marginTop: 20, gap: 10 }}>
        <Button title="Continuar sesión" onPress={onContinue} fullWidth />
        <Button title="Descartar" variant="secondary" onPress={onDiscard} fullWidth />
      </View>
    </BottomSheet>
  );
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function StudySessionScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  // Per-slice selectors, same as the other screens: destructuring the store
  // resubscribes this screen to every write in it, including the ones its own
  // session makes.
  const subjects = useUserStore((state) => state.subjects);
  const subjectsLoading = useUserStore((state) => state.loading);
  const stats = useUserStore((state) => state.stats);
  const hideFocusReminder = usePreferencesStore((state) => state.hideFocusReminder);
  const setHideFocusReminder = usePreferencesStore((state) => state.setHideFocusReminder);

  const params = useLocalSearchParams();
  const { autoStart, subjectId, duration: paramDuration, goal, taskId } = params || {};

  const [step, setStep] = useState('setup');
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [duration, setDuration] = useState(DEFAULT_MINUTES);
  const [goals, setGoals] = useState([]);
  const [newGoalText, setNewGoalText] = useState('');

  const [timeLeft, setTimeLeft] = useState(DEFAULT_MINUTES * 60);
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const [focusSheetVisible, setFocusSheetVisible] = useState(false);
  const [dontShowReminder, setDontShowReminder] = useState(false);
  const [stopConfirmVisible, setStopConfirmVisible] = useState(false);

  const [summary, setSummary] = useState(null);
  // 'draw' while the mark is being traced, 'settled' once the summary can land.
  const [endPhase, setEndPhase] = useState('draw');
  const [mood, setMood] = useState(null);
  const [notes, setNotes] = useState('');
  const [upcomingExams, setUpcomingExams] = useState([]);
  // A snapshot found in storage on launch, offered before it's applied —
  // null once there's nothing to recover or the student has answered.
  const [recoverableSession, setRecoverableSession] = useState(null);

  const timerRef = useRef(null);
  const autoStartedRef = useRef(null);
  // Wall-clock timestamps, not a counter: `timeLeft` is recomputed from these
  // on every tick, so a gap where the interval didn't fire (screen locked,
  // app backgrounded) self-corrects instead of freezing or drifting.
  const sessionStartRef = useRef(null);
  const pausedMsRef = useRef(0);
  const pauseStartedAtRef = useRef(null);
  // The write kicked off when the timer stopped. Held as a promise, not an id,
  // so a student who types fast and taps "Volver a Inicio" before Firestore
  // answers still gets their notes attached.
  const savedSessionRef = useRef(null);

  const dragY = useSharedValue(0);
  const flash = useSharedValue(0);

  // ── Derived ──

  const currentSubject = useMemo(
    () => subjects.find((s) => s.id === selectedSubject) || null,
    [subjects, selectedSubject]
  );

  // Nearest upcoming exam per subject, for the reason line on the chip.
  const reasonBySubject = useMemo(() => {
    const map = {};
    for (const exam of upcomingExams) {
      if (!exam.subjectId || map[exam.subjectId]) continue;
      const reason = examReason(exam);
      if (reason) map[exam.subjectId] = reason;
    }
    return map;
  }, [upcomingExams]);

  // ── Session lifecycle ──

  const startSession = useCallback((minutes) => {
    const total = Math.round(minutes) * 60;
    sessionStartRef.current = Date.now();
    pausedMsRef.current = 0;
    pauseStartedAtRef.current = null;
    setTimeLeft(total);
    setIsActive(true);
    setIsPaused(false);
    setStep('timer');
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, []);

  /** Applies a snapshot (fresh from storage, either resumed by the student or
   * auto-applied because it had already finished) as the live session. */
  const applyRecoveredSession = useCallback((snapshot) => {
    sessionStartRef.current = snapshot.sessionStart;
    pausedMsRef.current = snapshot.pausedMs || 0;
    pauseStartedAtRef.current = null;
    setSelectedSubject(snapshot.subjectId);
    setDuration(snapshot.duration);
    setGoals(snapshot.goals || []);
    setIsPaused(false);
    setIsActive(true);
    setStep('timer');
    setRecoverableSession(null);
  }, []);

  const discardRecoveredSession = useCallback(() => {
    AsyncStorage.removeItem(SESSION_STORAGE_KEY).catch((error) =>
      console.error('[Study] Error clearing persisted session:', error)
    );
    setRecoverableSession(null);
  }, []);

  // Pause/resume go through here rather than a bare `setIsPaused` so the
  // paused span gets excluded from the elapsed-time calculation — otherwise
  // time spent paused would still count against the student.
  const pauseTimer = useCallback(() => {
    pauseStartedAtRef.current = Date.now();
    setIsPaused(true);
  }, []);

  const resumeTimer = useCallback(() => {
    if (pauseStartedAtRef.current) {
      pausedMsRef.current += Date.now() - pauseStartedAtRef.current;
      pauseStartedAtRef.current = null;
    }
    setIsPaused(false);
  }, []);

  const togglePause = useCallback(() => {
    if (isPaused) resumeTimer();
    else pauseTimer();
  }, [isPaused, pauseTimer, resumeTimer]);

  const handleStartPress = () => {
    if (!selectedSubject) return;
    if (hideFocusReminder) {
      startSession(duration);
      return;
    }
    setDontShowReminder(false);
    setFocusSheetVisible(true);
  };

  const confirmFocusSheet = () => {
    if (dontShowReminder) setHideFocusReminder(true);
    setFocusSheetVisible(false);
    startSession(duration);
  };

  /**
   * Ends the session: writes it (streak + XP) straight away, then hands the
   * student the summary screen. Notes and mood are patched on afterwards.
   */
  const handleComplete = useCallback(
    (early = false) => {
      clearInterval(timerRef.current);
      setIsActive(false);
      setIsPaused(false);
      setStopConfirmVisible(false);
      AsyncStorage.removeItem(SESSION_STORAGE_KEY).catch((error) =>
        console.error('[Study] Error clearing persisted session:', error)
      );

      const totalSeconds = duration * 60;
      const secondsSpent = Math.max(0, totalSeconds - timeLeft);
      const minutesSpent = Math.floor(secondsSpent / 60);
      const subject = subjects.find((s) => s.id === selectedSubject);

      // Same formula the store awards with, so the number on screen is the
      // number the student actually receives.
      const xpEarned = minutesSpent * BASE_XP_PER_MINUTE;

      setSummary({
        subjectName: subject?.name || 'Estudio',
        subjectColor: subject?.color || tokens.colors.accent,
        minutes: minutesSpent,
        completed: !early,
        xpEarned,
        completedGoals: goals.filter((g) => g.completed).length,
        totalGoals: goals.length,
      });
      setStep('end');

      if (!early && Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      if (!user?.uid) return;

      if (!early && taskId) {
        useUserStore.getState().completeMicroTask(user.uid, taskId);
      }

      // A session shorter than a minute earns nothing and isn't worth a row.
      if (minutesSpent >= 1) {
        savedSessionRef.current = useUserStore
          .getState()
          .addSession(user.uid, {
            subjectId: selectedSubject,
            duration: minutesSpent,
            goals,
            focusScore: 5,
            notes: '',
          })
          .then((result) => result?.sessionId ?? null)
          .catch((error) => {
            console.error('Error saving session:', error);
            return null;
          });
      }
    },
    [duration, timeLeft, subjects, selectedSubject, goals, user?.uid, taskId]
  );

  const handleFinish = () => {
    const focusScore = MOODS.find((m) => m.key === mood)?.score;
    const trimmed = notes.trim();
    const pending = savedSessionRef.current;

    // Fire-and-forget: the student is already on their way to the dashboard,
    // and nothing here changes their streak or their XP.
    if (pending && (trimmed || focusScore)) {
      pending
        .then((sessionId) => {
          if (!sessionId) return;
          return useUserStore
            .getState()
            .updateSessionFeedback(sessionId, { notes: trimmed, focusScore });
        })
        .catch((error) => console.error('Error saving session feedback:', error));
    }

    savedSessionRef.current = null;
    setStep('setup');
    setSummary(null);
    setMood(null);
    setNotes('');
    setGoals([]);
    router.replace('/dashboard');
  };

  // ── Goals ──

  const addGoal = () => {
    const text = newGoalText.trim();
    if (!text) return;
    setGoals((prev) => [...prev, { id: Date.now(), text, completed: false }]);
    setNewGoalText('');
  };

  const toggleGoal = (id) => {
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, completed: !g.completed } : g)));
    if (Platform.OS !== 'web') Haptics.selectionAsync();
  };

  const removeGoal = (id) => setGoals((prev) => prev.filter((g) => g.id !== id));

  // ── Gestures ──

  const dragToStop = useMemo(
    () =>
      Gesture.Pan()
        .enabled(isActive && !stopConfirmVisible)
        .activeOffsetY([-20, 20])
        .onUpdate((event) => {
          if (event.translationY > 0) dragY.value = event.translationY;
        })
        .onEnd((event) => {
          if (event.translationY > DRAG_TO_STOP) {
            runOnJS(pauseTimer)();
            runOnJS(setStopConfirmVisible)(true);
          }
          dragY.value = withSpring(0, { damping: 20, stiffness: 200 });
        }),
    [isActive, stopConfirmVisible, dragY, pauseTimer]
  );

  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));

  // Mirrors the design's `blueFlash`: a hard bloom that peaks fast and drifts
  // outwards as it fades.
  const flashStyle = useAnimatedStyle(() => ({
    opacity: interpolate(flash.value, [0, 0.3, 1], [0, 1, 0]),
    transform: [{ scale: interpolate(flash.value, [0, 0.3, 1], [0.55, 1.05, 1.3]) }],
  }));

  const handleBurst = useCallback(() => {
    flash.value = 0;
    flash.value = withTiming(1, { duration: 600, easing: Easing.bezier(0.22, 0.61, 0.36, 1) });
  }, [flash]);

  const handleSettled = useCallback(() => setEndPhase('settled'), []);

  // ── Effects ──

  useEffect(() => {
    activateKeepAwake();
    return () => deactivateKeepAwake();
  }, []);

  useEffect(() => {
    if (user?.uid && subjects.length === 0) {
      useUserStore.getState().loadUserData(user.uid);
    }
  }, [user?.uid, subjects.length]);

  // Exams only drive the "Examen en N días" hint — a failure here must not
  // stop the student from studying.
  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    getUpcomingExams(user.uid, 20)
      .then((exams) => {
        if (!cancelled) setUpcomingExams(exams || []);
      })
      .catch((error) => console.warn('Could not load exams for the study screen', error));
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  // Deep link from the quick actions and the plan's micro-tasks.
  useEffect(() => {
    if (autoStart !== 'true' || !subjectId || subjects.length === 0) return;

    // The tab keeps this screen mounted, so the guard is keyed on the params
    // rather than a plain flag: a second launch with a different subject or
    // duration has to start its own session.
    const signature = `${subjectId}|${paramDuration}|${goal}|${taskId}`;
    if (autoStartedRef.current === signature) return;

    const subject = subjects.find((s) => s.id === subjectId);
    if (!subject) return;

    autoStartedRef.current = signature;

    // Read the duration from the param rather than from state: the setState
    // below hasn't landed yet when the session starts.
    const parsed = parseInt(paramDuration, 10);
    const minutes = Number.isFinite(parsed) ? parsed : DEFAULT_MINUTES;

    setSelectedSubject(subject.id);
    setDuration(minutes);
    if (goal) setGoals([{ id: Date.now(), text: String(goal), completed: false }]);
    startSession(minutes);
  }, [autoStart, subjectId, paramDuration, goal, taskId, subjects, startSession]);

  // Zen mode: the tab bar would be an exit ramp mid-session.
  useEffect(() => {
    const hidden = step === 'timer';
    navigation.setOptions({
      headerShown: false,
      tabBarStyle: hidden
        ? { display: 'none' }
        : {
            height: 85,
            paddingBottom: 25,
            backgroundColor: tokens.colors.surfaceCard,
            elevation: 0,
            borderTopWidth: 1,
            borderTopColor: tokens.colors.borderDefault,
            shadowColor: 'transparent',
            shadowOpacity: 0,
            display: 'flex',
          },
    });
  }, [step, navigation]);

  // Recomputed from `sessionStartRef`/`pausedMsRef` on every call rather than
  // decremented — a call after a gap (interval throttled, app backgrounded)
  // lands on the true remaining time instead of resuming from a stale count.
  const tick = useCallback(() => {
    if (!sessionStartRef.current) return null;
    const elapsedMs = Date.now() - sessionStartRef.current - pausedMsRef.current;
    const remaining = Math.max(0, duration * 60 - Math.floor(elapsedMs / 1000));
    setTimeLeft(remaining);
    if (remaining === 0) handleComplete(false);
    return remaining;
  }, [duration, handleComplete]);

  useEffect(() => {
    if (!isActive || isPaused) return;
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [isActive, isPaused, tick]);

  // The interval above is what Android throttles or drops while the screen is
  // locked — this catches the app coming back and snaps the display to the
  // real elapsed time immediately, instead of waiting for the next tick.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && isActive && !isPaused) tick();
    });
    return () => subscription.remove();
  }, [isActive, isPaused, tick]);

  // Snapshotted on pause/resume and on every goal edit — not every tick,
  // since the timestamps it stores don't change second to second and writing
  // to disk once a second for no reason would be pure waste.
  useEffect(() => {
    if (step !== 'timer') return;
    const snapshot = {
      subjectId: selectedSubject,
      duration,
      goals,
      sessionStart: sessionStartRef.current,
      pausedMs: pausedMsRef.current,
    };
    AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot)).catch((error) =>
      console.error('[Study] Error persisting session:', error)
    );
  }, [step, isPaused, goals, selectedSubject, duration]);

  // Android only: the ongoing lock-screen notification, kept in lockstep with
  // the same state the persistence effect above watches. The chronometer
  // can't be paused natively, so a pause swaps it for a frozen text line
  // instead — see services/studyNotification.js.
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    if (step !== 'timer') {
      stopStudySessionNotification();
      return;
    }

    const totalSeconds = duration * 60;

    const publish = () => {
      if (isPaused) {
        updateStudySessionNotification({
          subjectName: currentSubject?.name,
          goals,
          paused: true,
          remainingSeconds: timeLeft,
          totalSeconds,
        });
      } else {
        const elapsedMs = Date.now() - sessionStartRef.current - pausedMsRef.current;
        updateStudySessionNotification({
          subjectName: currentSubject?.name,
          goals,
          paused: false,
          endTimestamp: sessionStartRef.current + totalSeconds * 1000 + pausedMsRef.current,
          elapsedSeconds: Math.floor(elapsedMs / 1000),
          totalSeconds,
        });
      }
    };

    publish();

    // The chronometer text updates natively every second on its own — this
    // only nudges the progress bar forward periodically, since redrawing the
    // whole notification every second would be exactly the battery-draining
    // pattern Android's own notification guidance warns against.
    const progressInterval = isPaused ? null : setInterval(publish, 60000);
    return () => progressInterval && clearInterval(progressInterval);
    // `timeLeft` is deliberately excluded: it ticks every second and this
    // only needs to read whatever it was at the moment of pausing, not
    // re-fire (and re-notify) on every subsequent tick while running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, isPaused, goals, currentSubject, duration]);

  // Action buttons on the notification itself (Pausar/Reanudar, Terminar) —
  // same handlers the on-screen controls use, so behavior can't drift apart.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const unsubscribe = addNotificationActionListener((action) => {
      if (step !== 'timer') return;
      if (action === ACTION.PAUSE) pauseTimer();
      else if (action === ACTION.RESUME) resumeTimer();
      else if (action === ACTION.STOP) handleComplete(true);
    });
    return unsubscribe;
  }, [step, pauseTimer, resumeTimer, handleComplete]);

  // Once, on launch: was a session left running when the app last closed?
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) return;
        // Consumed immediately, not just on the stale/discard paths: this
        // effect can run twice in quick succession (e.g. the app relaunching
        // before the first pass finishes), and two reads of the same
        // not-yet-cleared snapshot would both call applyRecoveredSession and
        // write duplicate sessions. Continuing re-persists a fresh snapshot
        // right after anyway (see the snapshot effect below), so clearing
        // here doesn't lose anything on that path.
        await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
        const snapshot = JSON.parse(raw);
        const elapsedSinceStart = Date.now() - snapshot.sessionStart;

        if (elapsedSinceStart > STALE_SESSION_MS) {
          return;
        }

        const totalSeconds = Math.round(snapshot.duration) * 60;
        const elapsedSeconds = Math.floor((elapsedSinceStart - (snapshot.pausedMs || 0)) / 1000);

        if (totalSeconds - elapsedSeconds <= 0) {
          // It finished while the app was closed — land on the summary
          // instead of asking "continue?" a session that's already over.
          applyRecoveredSession(snapshot);
          return;
        }

        setRecoverableSession(snapshot);
      } catch (error) {
        console.error('[Study] Error checking for a recoverable session:', error);
      }
    })();
  }, [applyRecoveredSession]);

  // Rewind the reveal whenever a new session ends, so the second one animates
  // exactly like the first.
  useEffect(() => {
    if (step !== 'end') {
      setEndPhase('draw');
      flash.value = 0;
    }
  }, [step, flash]);

  // ── Render: setup ──

  const renderSetup = () => (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Animated.View entering={FadeInDown.duration(320)}>
        <Text style={styles.screenTitle}>Estudiar</Text>
        <Text style={styles.screenSubtitle}>Elige materia, tiempo y objetivos de hoy.</Text>
      </Animated.View>

      {/* Materia */}
      <View style={styles.section}>
        <SectionTitle>Materia</SectionTitle>

        {subjectsLoading ? (
          <View style={styles.subjectsPlaceholder}>
            <ActivityIndicator color={tokens.colors.accent} />
          </View>
        ) : subjects.length === 0 ? (
          <TouchableOpacity
            style={styles.subjectsEmpty}
            activeOpacity={0.8}
            onPress={() => router.push('/dashboard/profile')}
          >
            <Plus size={20} color={tokens.colors.textSecondary} />
            <Text style={styles.subjectsEmptyText}>Añadir materias</Text>
          </TouchableOpacity>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.subjectsRow}
          >
            {subjects.map((subject) => (
              <SubjectChip
                key={subject.id}
                subject={subject}
                reason={reasonBySubject[subject.id]}
                selected={selectedSubject === subject.id}
                onPress={() => setSelectedSubject(subject.id)}
              />
            ))}
          </ScrollView>
        )}
      </View>

      {/* Tiempo */}
      <View style={styles.section}>
        <SectionTitle>Tiempo de sesión</SectionTitle>

        <Card padding={20}>
          <View style={styles.durationRow}>
            <Text style={styles.durationValue}>{duration}</Text>
            <Text style={styles.durationUnit}>min</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={MIN_MINUTES}
            maximumValue={MAX_MINUTES}
            step={MINUTE_STEP}
            value={duration}
            onValueChange={(value) => setDuration(Math.round(value))}
            minimumTrackTintColor={tokens.colors.accent}
            maximumTrackTintColor={tokens.colors.borderDefault}
            thumbTintColor={tokens.colors.accent}
          />
          <Text style={styles.durationPhrase}>{sessionPhrase(duration)}</Text>
        </Card>
      </View>

      {/* Objetivos */}
      <View style={styles.section}>
        <SectionTitle>Objetivos de hoy</SectionTitle>

        <Card padding={16}>
          <AddObjectiveRow value={newGoalText} onChangeText={setNewGoalText} onAdd={addGoal} />
          {goals.length > 0 ? (
            <View style={{ marginTop: 8 }}>
              {goals.map((g) => (
                <SwipeToDelete key={g.id} onDelete={() => removeGoal(g.id)}>
                  <CheckRow
                    label={g.text}
                    checked={g.completed}
                    onToggle={() => toggleGoal(g.id)}
                  />
                </SwipeToDelete>
              ))}
              <Text style={styles.swipeHint}>
                Desliza un objetivo a la izquierda para borrarlo.
              </Text>
            </View>
          ) : null}
        </Card>
      </View>

      {/* Pushes the action to the bottom of the viewport when the content is
          short, and keeps a clear gap when it isn't. */}
      <View style={styles.bottomSpacer} />

      <Button
        title="Comenzar sesión"
        onPress={handleStartPress}
        disabled={!selectedSubject}
        fullWidth
      />
    </ScrollView>
  );

  // ── Render: timer ──

  const renderTimer = () => {
    const totalSeconds = duration * 60;
    const remainingFraction = totalSeconds > 0 ? Math.max(0, timeLeft) / totalSeconds : 0;
    const dashOffset = RING_CIRCUMFERENCE * remainingFraction;
    const reason = reasonBySubject[selectedSubject];

    return (
      <GestureDetector gesture={dragToStop}>
        <Animated.View style={[styles.timerContainer, { paddingTop: insets.top + 24 }, dragStyle]}>
          <StatusBar hidden />

          <View style={styles.timerHeader}>
            <Text style={styles.timerSubject}>{currentSubject?.name || 'Estudio'}</Text>
            <Text style={styles.timerReason}>{reason || 'Sesión enfocada'}</Text>
          </View>

          <View style={styles.ringWrap}>
            <Svg width={RING_SIZE} height={RING_SIZE} style={styles.ringSvg}>
              <SvgCircle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke={tokens.colors.borderDefault}
                strokeWidth={RING_STROKE}
                fill="none"
              />
              <SvgCircle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke={tokens.colors.accent}
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
                rotation="-90"
                origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
              />
            </Svg>
            <View style={styles.ringCenter}>
              <Text style={styles.timeDisplay}>{formatTime(timeLeft)}</Text>
              <Text style={styles.timeState}>{isPaused ? 'EN PAUSA' : 'ENFOQUE'}</Text>
            </View>
          </View>

          <View style={styles.controls}>
            <TouchableOpacity
              style={styles.controlButton}
              activeOpacity={0.7}
              onPress={togglePause}
              accessibilityRole="button"
              accessibilityLabel={isPaused ? 'Reanudar sesión' : 'Pausar sesión'}
            >
              {isPaused ? (
                <Play
                  size={24}
                  color={tokens.colors.textPrimary}
                  fill={tokens.colors.textPrimary}
                />
              ) : (
                <Pause
                  size={24}
                  color={tokens.colors.textPrimary}
                  fill={tokens.colors.textPrimary}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlButton}
              activeOpacity={0.7}
              onPress={() => {
                pauseTimer();
                setStopConfirmVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Terminar sesión"
            >
              <X size={26} color={tokens.colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {goals.length > 0 ? (
            <View style={styles.timerGoals}>
              <OverlineLabel>Objetivos</OverlineLabel>
              <ScrollView style={styles.timerGoalsScroll} showsVerticalScrollIndicator={false}>
                {goals.map((g) => (
                  <CheckRow
                    key={g.id}
                    label={g.text}
                    checked={g.completed}
                    onToggle={() => toggleGoal(g.id)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {stopConfirmVisible ? (
            <Animated.View entering={FadeIn.duration(160)} style={styles.stopOverlay}>
              <Card padding={24} style={styles.stopCard}>
                <View style={styles.stopIcon}>
                  <X size={26} color={tokens.colors.danger} />
                </View>
                <Text style={styles.stopTitle}>¿Terminar sesión?</Text>
                <Text style={styles.stopBody}>
                  Se guardará el tiempo que llevas, pero tu racha podría verse afectada.
                </Text>
                <View style={styles.stopActions}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Continuar"
                      variant="secondary"
                      fullWidth
                      onPress={() => {
                        setStopConfirmVisible(false);
                        resumeTimer();
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Terminar"
                      variant="danger"
                      fullWidth
                      onPress={() => handleComplete(true)}
                    />
                  </View>
                </View>
              </Card>
            </Animated.View>
          ) : null}
        </Animated.View>
      </GestureDetector>
    );
  };

  // ── Render: end ──

  const renderEnd = () => {
    if (!summary) return null;

    const settled = endPhase === 'settled';

    return (
      <View style={styles.endRoot}>
        {/* Night sky behind the trace, gone by the time the summary lands. */}
        {settled ? null : (
          <Animated.View
            exiting={FadeOut.duration(620)}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          >
            <Svg width="100%" height="100%">
              <Defs>
                <RadialGradient id="study-end-sky" cx="50%" cy="16%" rx="120%" ry="80%">
                  <Stop offset="0" stopColor="#17233D" />
                  <Stop offset="0.55" stopColor="#0B1020" />
                  <Stop offset="1" stopColor="#06070D" />
                </RadialGradient>
              </Defs>
              <SvgRect width="100%" height="100%" fill="url(#study-end-sky)" />
            </Svg>
          </Animated.View>
        )}

        {/* The flash that hides the hand-off from the stroke to the flat mark. */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.flash, flashStyle]}
        >
          <Svg width="100%" height="100%">
            <Defs>
              <RadialGradient id="study-end-flash" cx="66%" cy="14%" r="100%">
                <Stop offset="0" stopColor="#FFFFFF" />
                <Stop offset="0.38" stopColor={tokens.colors.accent} />
                <Stop offset="1" stopColor={tokens.colors.accent} />
              </RadialGradient>
            </Defs>
            <SvgRect width="100%" height="100%" fill="url(#study-end-flash)" />
          </Svg>
        </Animated.View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.endContent, { paddingTop: insets.top + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={settled}
        >
          <SchedioLogoReveal size={140} onBurst={handleBurst} onSettled={handleSettled} />

          {settled ? (
            <>
              <Animated.View entering={FadeInDown.duration(460)} style={styles.endBlock}>
                <Text style={styles.endTitle}>¿Cómo te ha ido?</Text>
                <MoodPicker value={mood} onChange={setMood} />
              </Animated.View>

              <Animated.View entering={FadeInDown.duration(460).delay(90)} style={styles.statRow}>
                <StatTile value={`+${summary.xpEarned}`} label="XP ganado" accent />
                <StatTile value={String(stats?.streak ?? 0)} label="Días de racha" />
              </Animated.View>

              <Animated.Text
                entering={FadeInDown.duration(460).delay(180)}
                style={styles.endSummaryLine}
              >
                {summary.subjectName} · {summary.minutes} min estudiados · {summary.completedGoals}/
                {summary.totalGoals} objetivos completados
              </Animated.Text>

              <Animated.View
                entering={FadeInDown.duration(460).delay(260)}
                style={styles.notesWrap}
              >
                <TextInput
                  style={styles.notesInput}
                  placeholder="Anota algo rápido (opcional)"
                  placeholderTextColor={tokens.colors.textDisabled}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                />
              </Animated.View>

              <View style={styles.bottomSpacer} />

              <Animated.View
                entering={FadeInDown.duration(460).delay(340)}
                style={{ width: '100%' }}
              >
                <Button title="Volver a Inicio" onPress={handleFinish} fullWidth />
              </Animated.View>
            </>
          ) : null}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {step === 'setup' && renderSetup()}
      {step === 'timer' && renderTimer()}
      {step === 'end' && renderEnd()}

      <FocusReminderSheet
        visible={focusSheetVisible}
        onClose={() => setFocusSheetVisible(false)}
        onStart={confirmFocusSheet}
        dontShow={dontShowReminder}
        onToggleDontShow={() => setDontShowReminder((v) => !v)}
      />

      <RecoverSessionSheet
        visible={!!recoverableSession}
        subjectName={subjects.find((s) => s.id === recoverableSession?.subjectId)?.name}
        onContinue={() => applyRecoveredSession(recoverableSession)}
        onDiscard={discardRecoveredSession}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  // Eats the leftover height so the primary action sits at the bottom, with a
  // floor that keeps it off the block above on a short screen.
  bottomSpacer: {
    flex: 1,
    minHeight: 40,
  },

  // Setup header
  screenTitle: {
    fontFamily: font.bold,
    fontSize: tokens.typography.screenTitle.size,
    color: tokens.colors.textPrimary,
    marginBottom: 4,
  },
  screenSubtitle: {
    fontFamily: font.regular,
    fontSize: 15,
    color: tokens.colors.textSecondary,
  },
  section: {
    marginTop: tokens.spacing.sectionGapMin,
    marginBottom: 0,
  },
  // Subjects
  subjectsRow: {
    gap: 10,
    paddingRight: 20,
  },
  subjectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
  },
  subjectChipSelected: {
    backgroundColor: tokens.colors.accentSoftBg,
    borderColor: tokens.colors.accent,
  },
  subjectAvatar: {
    width: 26,
    height: 26,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectInitial: {
    fontFamily: font.bold,
    fontSize: 12,
    color: '#FFFFFF',
  },
  subjectName: {
    fontFamily: font.semibold,
    fontSize: 14,
    color: tokens.colors.textPrimary,
  },
  subjectReason: {
    fontFamily: font.medium,
    fontSize: 11,
    color: tokens.colors.accent,
    marginTop: 1,
  },
  subjectsPlaceholder: {
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectsEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 66,
    borderRadius: tokens.radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: tokens.colors.borderDefault,
  },
  subjectsEmptyText: {
    fontFamily: font.semibold,
    fontSize: 14,
    color: tokens.colors.textSecondary,
  },

  // Duration
  durationRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
  },
  durationValue: {
    fontFamily: tokens.typography.families.display,
    fontSize: 44,
    letterSpacing: 0.5,
    color: tokens.colors.textPrimary,
  },
  durationUnit: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: tokens.colors.textSecondary,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  durationPhrase: {
    fontFamily: font.semibold,
    fontSize: 13,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },

  // Objectives
  addRow: {
    flexDirection: 'row',
    gap: 8,
  },
  addInput: {
    flex: 1,
    minWidth: 0,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.btn,
    backgroundColor: tokens.colors.background,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    fontFamily: font.regular,
    fontSize: 15,
    color: tokens.colors.textPrimary,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.btn,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  checkRowLabel: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 15,
    color: tokens.colors.textPrimary,
  },
  checkRowLabelDone: {
    color: tokens.colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  checkbox: {
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: tokens.colors.accent,
  },
  checkboxOff: {
    borderWidth: 1.5,
    borderColor: tokens.colors.borderDefault,
  },
  swipeWrap: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  swipeAction: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.colors.danger,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 18,
  },
  swipeContent: {
    backgroundColor: tokens.colors.surfaceCard,
  },
  swipeHint: {
    fontFamily: font.regular,
    fontSize: 12,
    color: tokens.colors.textDisabled,
    marginTop: 8,
  },

  // Sheet
  sheetIcon: {
    width: 52,
    height: 52,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accentSoftBg,
    borderWidth: 1,
    borderColor: tokens.colors.accentSoftBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontFamily: font.bold,
    fontSize: 20,
    color: tokens.colors.textPrimary,
    marginBottom: 6,
  },
  sheetBody: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
    color: tokens.colors.textSecondary,
    marginBottom: 12,
  },

  // Timer
  timerContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  timerHeader: {
    alignItems: 'center',
    marginBottom: 36,
  },
  timerSubject: {
    fontFamily: font.semibold,
    fontSize: 20,
    color: tokens.colors.textPrimary,
  },
  timerReason: {
    fontFamily: font.regular,
    fontSize: 14,
    color: tokens.colors.textSecondary,
    marginTop: 2,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSvg: {
    position: 'absolute',
  },
  ringCenter: {
    alignItems: 'center',
  },
  timeDisplay: {
    fontFamily: tokens.typography.families.display,
    fontSize: 56,
    letterSpacing: 0.5,
    color: tokens.colors.textPrimary,
  },
  timeState: {
    fontFamily: font.semibold,
    fontSize: 12,
    letterSpacing: 2,
    color: tokens.colors.textSecondary,
  },
  controls: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 36,
  },
  controlButton: {
    width: 60,
    height: 60,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerGoals: {
    width: '100%',
    marginTop: 36,
    flex: 1,
  },
  timerGoalsScroll: {
    marginTop: 4,
  },
  stopOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  stopCard: {
    width: '100%',
    alignItems: 'center',
  },
  stopIcon: {
    width: 56,
    height: 56,
    borderRadius: tokens.radius.pill,
    backgroundColor: 'rgba(216, 96, 74, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  stopTitle: {
    fontFamily: font.bold,
    fontSize: 20,
    color: tokens.colors.textPrimary,
    marginBottom: 8,
  },
  stopBody: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
  stopActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    width: '100%',
  },

  // End
  endRoot: {
    flex: 1,
  },
  endContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 48,
    alignItems: 'center',
  },
  flash: {
    // Above the sky and the mark, below nothing — it is the hand-off.
    zIndex: 10,
  },
  endBlock: {
    marginTop: 28,
    width: '100%',
    alignItems: 'center',
  },
  endTitle: {
    fontFamily: font.bold,
    fontSize: 20,
    color: tokens.colors.textPrimary,
    marginBottom: 14,
  },
  moodRow: {
    flexDirection: 'row',
    gap: 18,
    justifyContent: 'center',
  },
  moodButton: {
    padding: 4,
  },
  statRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 26,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
  },
  statValue: {
    fontFamily: tokens.typography.families.display,
    fontSize: 30,
    letterSpacing: 0.5,
    color: tokens.colors.textPrimary,
  },
  statLabel: {
    fontFamily: font.medium,
    fontSize: 12,
    color: tokens.colors.textSecondary,
    marginTop: 2,
  },
  endSummaryLine: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
    marginTop: 26,
  },
  notesWrap: {
    width: '100%',
    marginTop: 26,
  },
  notesInput: {
    width: '100%',
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    fontFamily: font.regular,
    fontSize: 15,
    color: tokens.colors.textPrimary,
    textAlignVertical: 'top',
  },
});
