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
  KeyboardAvoidingView,
  InteractionManager,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useNavigation, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Play, Pause, X, Check, Plus, Trash2, BellOff, Flame } from 'lucide-react-native';
import Svg, {
  Circle as SvgCircle,
  Path,
  Line,
  Rect as SvgRect,
  Defs,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeOut,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  withDelay,
  runOnJS,
  interpolate,
  interpolateColor,
  Easing,
  ZoomIn,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { tokens } from '../../theme/tokens';
import { BASE_XP_PER_MINUTE, RANKS, BADGES } from '../../services/gamification';
import { getUpcomingExams } from '../../services/exams';
import { syncHomeScreenWidgets } from '../../services/widgetData';
import { hasDndPermission, enableStudyFocus, disableStudyFocus } from '../../services/focusMode';
import {
  updateStudySessionNotification,
  stopStudySessionNotification,
  scheduleBreakEndAlert,
  cancelBreakEndAlert,
  addNotificationActionListener,
  ACTION,
} from '../../services/studyNotification';
import {
  RHYTHMS,
  DEFAULT_RHYTHM,
  isCyclic,
  normalizeRhythm,
  phaseAt,
  breakTipFor,
  staleAfterMs,
} from '../../services/studyRhythm';
import useAuthStore from '../../store/authStore';
import useUserStore from '../../store/userStore';
import usePreferencesStore from '../../store/preferencesStore';
import useSessionStore from '../../store/sessionStore';
import RhythmPicker from '../../components/RhythmPicker';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import BottomSheet from '../../components/ui/BottomSheet';
import SectionTitle, { OverlineLabel } from '../../components/ui/SectionTitle';
import SchedioLogoReveal from '../../components/SchedioLogoReveal';
import AchievementCelebration from '../../components/AchievementCelebration';

const font = tokens.typography.families.inter;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// The slider bounds moved to services/studyRhythm.js, where the rhythms that
// use them live. Only the fallback for a plan task with no duration is still
// needed here.
const DEFAULT_MINUTES = 25;

// Where an in-progress session is snapshotted so it survives the screen
// locking, the app backgrounding, or Android killing the process outright —
// none of which should cost the student their timer or their objectives.
const SESSION_STORAGE_KEY = '@schedio/active_study_session';
// How long a snapshot stays resumable is now `staleAfterMs` in
// services/studyRhythm.js, computed from the session's own rhythm: a single
// ceiling can't cover both a 25-minute Continuo and eight blocks of Schedio
// Study without being uselessly generous for the first.

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

/** `entering`/animated styles only run on Reanimated components. */
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

function Checkbox({ checked, onPress, size = 20 }) {
  // A small overshoot on the way in and nothing on the way out. Ticking
  // something off is the moment worth marking; unticking is a correction, and
  // celebrating a correction is noise.
  const pop = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!checked) return;
    pop.value = withSequence(
      withTiming(1.22, { duration: 110, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 11, stiffness: 320 })
    );
  }, [checked, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  return (
    <AnimatedTouchable
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[
        styles.checkbox,
        { width: size, height: size },
        checked ? styles.checkboxOn : styles.checkboxOff,
        popStyle,
      ]}
    >
      {checked ? <Check size={size * 0.65} color="#FFFFFF" strokeWidth={3} /> : null}
    </AnimatedTouchable>
  );
}

/**
 * The strike drawn across a finished objective, one line per line of text.
 *
 * `textDecorationLine` snaps: the label is unstruck one frame and struck the
 * next, which is the same amount of feedback as no feedback at all. Measuring
 * the laid-out lines with `onTextLayout` and drawing over them means the rule
 * travels the way you'd cross something off on paper, and still handles a
 * label that wraps onto a second line.
 */
function StrikeLines({ lines, active }) {
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, {
      duration: active ? 260 : 140,
      easing: Easing.out(Easing.cubic),
    });
  }, [active, progress]);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));

  return lines.map((line, index) => (
    <Animated.View
      key={index}
      pointerEvents="none"
      style={[
        styles.strike,
        {
          left: line.x,
          top: line.y + line.height / 2,
          width: line.width,
        },
        style,
      ]}
    />
  ));
}

function CheckRow({ label, checked, onToggle, strike = true }) {
  const [lines, setLines] = useState([]);

  return (
    <View style={styles.checkRow}>
      <Checkbox checked={checked} onPress={onToggle} />
      <View style={styles.checkRowLabelWrap}>
        <Text
          style={[styles.checkRowLabel, checked && strike && styles.checkRowLabelDim]}
          numberOfLines={2}
          onTextLayout={(event) => setLines(event.nativeEvent.lines || [])}
        >
          {label}
        </Text>
        {strike ? <StrikeLines lines={lines} active={checked} /> : null}
      </View>
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

  /**
   * The red layer is only painted while the row is actually moving.
   *
   * It sits directly under the row, filling the same rounded rectangle. Android
   * antialiases each rounded shape independently, so along the curves the top
   * layer's edge pixels are partly transparent and the red underneath shows
   * through them — a thin red arc on each corner, visible even at rest. Adding
   * matching `borderRadius` to every layer (and `overflow: hidden` on the
   * wrapper) doesn't help, because the two curves are still antialiased
   * separately and never line up pixel for pixel.
   *
   * Fading it out at rest sidesteps the whole question: with nothing red drawn
   * underneath, there is nothing left to bleed through.
   */
  const actionStyle = useAnimatedStyle(() => ({ opacity: dx.value < -1 ? 1 : 0 }));

  return (
    <View style={styles.swipeWrap}>
      <Animated.View style={[styles.swipeAction, actionStyle]}>
        <Trash2 size={16} color="#FFFFFF" />
      </Animated.View>
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

/**
 * Counts from zero up to `to` once, when it mounts.
 *
 * Driven from JS rather than the UI thread on purpose: this runs on a summary
 * screen with nothing else moving, and the Reanimated equivalent needs an
 * animated TextInput written from a worklet — far more machinery than a number
 * that ticks for half a second is worth.
 */
function useCountUp(to, duration = 900, onDone) {
  const [shown, setShown] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!to) {
      setShown(0);
      return;
    }
    let frame;
    const start = Date.now();
    const tick = () => {
      const progress = Math.min(1, (Date.now() - start) / duration);
      // Eased out, so it sprints and then settles rather than crawling to the
      // final number at a constant rate.
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(Math.round(to * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        doneRef.current?.();
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, duration]);

  return shown;
}

function StatTile({ value, label, accent = false, countTo, prefix = '', pulse = false }) {
  // The reward is the one number worth animating: landing at its final value
  // reads as a label, counting up reads as something earned.
  const counted = useCountUp(
    countTo,
    900,
    useCallback(() => {
      // The punctuation the count was missing: without it the number just
      // stops, and the moment it was building towards passes unmarked.
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }, [])
  );
  const shown = countTo != null ? `${prefix}${counted}` : value;

  /**
   * Three beats, not a loop. A tile that pulses forever stops meaning
   * anything; three says "this went up today" and then gets out of the way.
   * Delayed so it fires after the tile has finished entering.
   */
  const beat = useSharedValue(1);
  useEffect(() => {
    if (!pulse) return;
    beat.value = withDelay(
      420,
      withRepeat(
        withSequence(
          withTiming(1.07, { duration: 220, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) })
        ),
        3,
        false
      )
    );
  }, [pulse, beat]);
  const beatStyle = useAnimatedStyle(() => ({ transform: [{ scale: beat.value }] }));

  return (
    <Animated.View style={[styles.statTile, beatStyle]}>
      <Text
        style={[styles.statValue, accent && { color: tokens.colors.accent }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {shown}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Animated.View>
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
  const microplans = useUserStore((state) => state.microplans);
  const hideFocusReminder = usePreferencesStore((state) => state.hideFocusReminder);
  const setHideFocusReminder = usePreferencesStore((state) => state.setHideFocusReminder);
  const focusModeEnabled = usePreferencesStore((state) => state.focusModeEnabled);
  const setSessionActive = useSessionStore((state) => state.setSessionActive);

  const rhythmMode = usePreferencesStore((state) => state.studyRhythmMode);
  const storedRhythms = usePreferencesStore((state) => state.studyRhythms);
  const setStudyRhythmMode = usePreferencesStore((state) => state.setStudyRhythmMode);
  const setStudyRhythm = usePreferencesStore((state) => state.setStudyRhythm);
  const hasSeenRhythmPicker = usePreferencesStore((state) => state.hasSeenRhythmPicker);
  const markRhythmPickerSeen = usePreferencesStore((state) => state.markRhythmPickerSeen);

  const params = useLocalSearchParams();
  const { autoStart, subjectId, duration: paramDuration, goal, taskId } = params || {};

  // Panic mode (services/microplanService.js PANIC_DAYS) is already computed
  // into the task's `isPanicMode` flag — plans.js just never threads it
  // through as a route param, so it's read back here from the same
  // `microplans` the plan screen itself uses. Deliberately doesn't touch the
  // block's `duration`: that number already accounts for the exam's real
  // remaining effort, and shortening it here would silently undercount study
  // time the plan is still owed.
  const activeTask = useMemo(
    () => (taskId ? (microplans || []).find((t) => t.id === taskId) : null),
    [microplans, taskId]
  );
  const isPanicTask = Boolean(activeTask?.isPanicMode);

  const [step, setStep] = useState('setup');
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [duration, setDuration] = useState(DEFAULT_MINUTES);
  const [goals, setGoals] = useState([]);
  const [newGoalText, setNewGoalText] = useState('');

  const [timeLeft, setTimeLeft] = useState(DEFAULT_MINUTES * 60);
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const [focusSheetVisible, setFocusSheetVisible] = useState(false);
  const [stopConfirmVisible, setStopConfirmVisible] = useState(false);

  /**
   * Both derived from elapsed time, never counted — `phaseAt` is the only
   * thing that decides them. They live in state purely so the screen can
   * repaint; nothing reads them to work out where the session is.
   */
  const [phase, setPhase] = useState('work');
  const [block, setBlock] = useState(1);

  const [summary, setSummary] = useState(null);
  // 'draw' while the mark is being traced, 'settled' once the summary can land.
  const [endPhase, setEndPhase] = useState('draw');
  // Filled once addSession resolves with an actual rank-up or badge unlock —
  // held back until the reveal settles, so it never competes with it.
  const [celebrationQueue, setCelebrationQueue] = useState(null);
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
  /**
   * Breaks the student cut short. Added to the elapsed time rather than
   * subtracted, so skipping fast-forwards the session past the rest of that
   * break — the work total is untouched, only the wall clock shortens.
   */
  const skippedMsRef = useRef(0);
  /** The rhythm this running session was started with. Held in a ref, not
   *  state: changing the picker mid-session must not reshape a session that
   *  is already under way. */
  const activeRhythmRef = useRef(null);
  /** Last phase `tick` saw, so a crossing can be spotted the moment it
   *  happens rather than inferred from a re-render. */
  const lastPhaseRef = useRef('work');
  // The write kicked off when the timer stopped. Held as a promise, not an id,
  // so a student who types fast and taps "Volver a Inicio" before Firestore
  // answers still gets their notes attached.
  const savedSessionRef = useRef(null);

  const dragY = useSharedValue(0);
  const flash = useSharedValue(0);

  /**
   * The timer's background, as two independent axes: tone says work or break,
   * lightness says whether the clock is running. Eased rather than swapped —
   * a screen that changes colour in one frame reads as a glitch, and this
   * colour is carrying the only signal that says a break has begun.
   */
  const breakness = useSharedValue(0);
  const pausedness = useSharedValue(0);

  useEffect(() => {
    breakness.value = withTiming(phase === 'break' ? 1 : 0, { duration: 260 });
  }, [phase, breakness]);

  useEffect(() => {
    pausedness.value = withTiming(isPaused ? 1 : 0, { duration: 200 });
  }, [isPaused, pausedness]);

  const surfaceStyle = useAnimatedStyle(() => {
    const running = interpolateColor(
      breakness.value,
      [0, 1],
      [tokens.colors.background, tokens.colors.breakBase]
    );
    const halted = interpolateColor(
      breakness.value,
      [0, 1],
      [tokens.colors.surfaceHover, tokens.colors.breakPaused]
    );
    return { backgroundColor: interpolateColor(pausedness.value, [0, 1], [running, halted]) };
  });

  // ── Derived ──

  const currentSubject = useMemo(
    () => subjects.find((s) => s.id === selectedSubject) || null,
    [subjects, selectedSubject]
  );

  /** The rhythm the picker is currently showing. Continuo is pinned to a
   *  single block with no break whatever happens to be stored for it. */
  const rhythm = useMemo(() => {
    const stored = storedRhythms?.[rhythmMode] || RHYTHMS[rhythmMode] || RHYTHMS[DEFAULT_RHYTHM];
    const base = normalizeRhythm(stored);
    return isCyclic(rhythmMode) ? base : { ...base, rest: 0, blocks: 1 };
  }, [storedRhythms, rhythmMode]);

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

  const startSession = useCallback(
    (sessionRhythm) => {
      const active = normalizeRhythm(sessionRhythm);
      activeRhythmRef.current = active;
      sessionStartRef.current = Date.now();
      pausedMsRef.current = 0;
      pauseStartedAtRef.current = null;
      skippedMsRef.current = 0;
      lastPhaseRef.current = 'work';

      // `duration` stays what it always was — the session's total, in minutes
      // of actual studying. Breaks are on top of it and never inside it, which
      // is what keeps the number that reaches XP and the streak honest.
      setDuration(active.work * active.blocks);
      setTimeLeft(phaseAt(0, active).remaining);
      setPhase('work');
      setBlock(1);
      setIsActive(true);
      setIsPaused(false);
      setStep('timer');
      // Starting counts as having seen the picker, even for someone who
      // scrolled straight past it.
      markRhythmPickerSeen();
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
    [markRhythmPickerSeen]
  );

  /** Applies a snapshot (fresh from storage, either resumed by the student or
   * auto-applied because it had already finished) as the live session. */
  const applyRecoveredSession = useCallback((snapshot) => {
    // A snapshot written before rhythms existed has no `rhythm` at all. Read
    // as a single uninterrupted block it is exactly what it was — so someone
    // who updates the app mid-session gets their session back rather than a
    // crash.
    const active = normalizeRhythm(
      snapshot.rhythm || { work: snapshot.duration, rest: 0, blocks: 1 }
    );
    activeRhythmRef.current = active;
    sessionStartRef.current = snapshot.sessionStart;
    pausedMsRef.current = snapshot.pausedMs || 0;
    skippedMsRef.current = snapshot.skippedMs || 0;
    pauseStartedAtRef.current = null;

    const elapsed = Math.floor(
      (Date.now() - snapshot.sessionStart - (snapshot.pausedMs || 0) + (snapshot.skippedMs || 0)) /
        1000
    );
    const at = phaseAt(elapsed, active);
    lastPhaseRef.current = at.phase;

    setSelectedSubject(snapshot.subjectId);
    setDuration(active.work * active.blocks);
    setGoals(snapshot.goals || []);
    setPhase(at.phase);
    setBlock(at.block);
    setTimeLeft(at.remaining);
    setIsPaused(false);
    setIsActive(true);
    setStep('timer');
    setRecoverableSession(null);

    // Landing back inside a break means the alert booked when it started died
    // with the old process. Without this it would be the one break of the
    // session that never announces itself. No subject name here on purpose:
    // the subject is only being set in this same pass, so the notification
    // falls back to naming the block.
    if (Platform.OS === 'android' && at.phase === 'break' && !at.finished) {
      scheduleBreakEndAlert({
        timestamp: Date.now() + at.remaining * 1000,
        block: Math.min(active.blocks, at.block + 1),
        totalBlocks: active.blocks,
      });
    }
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
    // A booked break alert is now wrong — pausing moves the end of the break.
    // It gets booked again on resume, for whatever the new end time is.
    if (Platform.OS === 'android') cancelBreakEndAlert();
  }, []);

  const resumeTimer = useCallback(() => {
    if (pauseStartedAtRef.current) {
      pausedMsRef.current += Date.now() - pauseStartedAtRef.current;
      pauseStartedAtRef.current = null;
    }
    setIsPaused(false);

    if (Platform.OS !== 'android' || !sessionStartRef.current || !activeRhythmRef.current) return;
    const active = activeRhythmRef.current;
    const elapsedMs =
      Date.now() - sessionStartRef.current - pausedMsRef.current + skippedMsRef.current;
    const at = phaseAt(Math.floor(elapsedMs / 1000), active);
    if (at.phase === 'break' && !at.finished) {
      scheduleBreakEndAlert({
        timestamp: Date.now() + at.remaining * 1000,
        subjectName: currentSubject?.name,
        block: Math.min(active.blocks, at.block + 1),
        totalBlocks: active.blocks,
      });
    }
  }, [currentSubject]);

  const togglePause = useCallback(() => {
    if (isPaused) resumeTimer();
    else pauseTimer();
  }, [isPaused, pauseTimer, resumeTimer]);

  // Whether Do Not Disturb is genuinely engaged right now — not just "the
  // toggle is on", but "the native call actually succeeded" (it returns
  // false if the permission was revoked since). Drives the badge in the
  // timer header, so the student sees confirmation instead of trusting a
  // silent background effect.
  const [focusModeActive, setFocusModeActive] = useState(false);

  // A process kill mid-session (swiped from recents, killed by the OS) skips
  // this effect's cleanup entirely, which would leave DND stuck on forever
  // with nothing left alive to turn it back off. This runs once on mount,
  // before we know whether there's a session to resume, specifically to
  // clear that stuck state — if a session *does* get resumed via
  // `applyRecoveredSession` right after, the effect below reacts to that and
  // re-enables it properly, so this can't fight a legitimate resume.
  useEffect(() => {
    disableStudyFocus();
  }, []);

  // Do Not Disturb tracks `isActive`, not `isPaused` — pausing mid-session
  // shouldn't flicker the phone's notification filter on and off. The
  // cleanup function is what guarantees this gets turned back off: on
  // `handleComplete` (isActive -> false), on unmount (leaving the screen
  // mid-session), and if the toggle itself gets switched off from Settings.
  useEffect(() => {
    if (!focusModeEnabled) {
      setFocusModeActive(false);
      return;
    }
    if (step === 'timer' && isActive) {
      setFocusModeActive(enableStudyFocus());
    } else {
      disableStudyFocus();
      setFocusModeActive(false);
    }
    return () => {
      disableStudyFocus();
      setFocusModeActive(false);
    };
  }, [focusModeEnabled, step, isActive]);

  const handleStartPress = () => {
    if (!selectedSubject) return;
    // The manual reminder exists because the app couldn't silence the phone
    // itself — if focus mode is on and actually granted, it's about to do
    // that for real, so asking the student to do it by hand is redundant.
    if (hideFocusReminder || (focusModeEnabled && hasDndPermission())) {
      startSession(rhythm);
      return;
    }
    setFocusSheetVisible(true);
  };

  const confirmFocusSheet = () => {
    setFocusSheetVisible(false);
    startSession(rhythm);
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

      /**
       * Work only. This used to be `duration*60 − timeLeft`, i.e. everything
       * the clock had run, which with cycles would have handed the student XP
       * for their breaks. And it isn't only XP: the same number goes to
       * `addSession` as `duration`, where it feeds the streak's daily total,
       * `totalTime` in the stats, and the badge checks. One number, four
       * places — so it gets computed once, from the work half of each cycle.
       */
      const active =
        activeRhythmRef.current || normalizeRhythm({ work: duration, rest: 0, blocks: 1 });
      const elapsedSeconds = sessionStartRef.current
        ? Math.floor(
            (Date.now() - sessionStartRef.current - pausedMsRef.current + skippedMsRef.current) /
              1000
          )
        : 0;
      const minutesSpent = Math.floor(phaseAt(elapsedSeconds, active).workDone / 60);
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
        // Snapshotted before addSession's optimistic update overwrites the
        // store — otherwise there'd be no way to tell a rank/level the
        // student just reached from one they already held.
        const previousRank = useUserStore.getState().gamification.rank;
        const previousLevel = useUserStore.getState().gamification.level;
        // Only a streak that actually moved earns the pulse on the summary —
        // one that beats every time says nothing.
        const previousStreak = useUserStore.getState().stats.streak;

        const sessionPromise = useUserStore.getState().addSession(user.uid, {
          subjectId: selectedSubject,
          duration: minutesSpent,
          goals,
          focusScore: 5,
          notes: '',
        });

        // The widget only ever refreshed from Inicio's fetch, so finishing a
        // session and not going back to the home tab left it showing the old
        // streak and today's task still pending. Runs after the session is
        // stored, since that's what moves the streak.
        sessionPromise
          .then(async () => {
            const exams = await getUpcomingExams(user.uid, 30).catch(() => []);
            await syncHomeScreenWidgets({
              exams,
              microplans: useUserStore.getState().microplans,
              subjects: useUserStore.getState().subjects,
              streak: useUserStore.getState().stats.streak,
              isPrime: useAuthStore.getState().isPrime,
            });
          })
          .catch((error) => console.warn('Could not refresh the widget', error));

        savedSessionRef.current = sessionPromise
          .then((result) => result?.sessionId ?? null)
          .catch((error) => {
            console.error('Error saving session:', error);
            return null;
          });

        // Separate subscriber on the same promise — doesn't call addSession
        // again, just also reads what it resolved with.
        sessionPromise
          .then((result) => {
            if (!result) return;

            const queue = [];
            if (result.newRank && result.newRank !== previousRank) {
              const rank = RANKS.find((r) => r.title === result.newRank);
              if (rank) queue.push({ type: 'rank', rank });
            }
            (result.unlockedBadges || []).forEach((badgeId) => {
              const badge = BADGES.find((b) => b.id === badgeId);
              if (badge) queue.push({ type: 'badge', badge });
            });
            if (queue.length > 0) setCelebrationQueue(queue);

            // A level-up without a rank change is common enough that a full
            // celebration for each one would get old fast — this gets a
            // quiet line in the summary instead (see renderEnd).
            if (result.newLevel && result.newLevel !== previousLevel) {
              setSummary((prev) => (prev ? { ...prev, newLevel: result.newLevel } : prev));
            }

            if (useUserStore.getState().stats.streak > previousStreak) {
              setSummary((prev) => (prev ? { ...prev, streakUp: true } : prev));
            }
          })
          .catch(() => {});
      }
    },
    // `timeLeft` is gone: the minutes are now worked out from the wall clock
    // and the rhythm, so the once-a-second state no longer rebuilds this.
    [duration, subjects, selectedSubject, goals, user?.uid, taskId]
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

    router.replace('/dashboard');

    // Resetting before navigating is what produced the flash of the empty
    // "Estudiar" screen between the summary and Inicio: these setState calls
    // commit immediately and re-render this screen as `setup`, while
    // router.replace goes through the navigator's own dispatch and lands a
    // frame or two later. Waiting until the transition has settled means the
    // reset happens off-screen, where nobody sees it.
    InteractionManager.runAfterInteractions(() => {
      savedSessionRef.current = null;
      setStep('setup');
      setSummary(null);
      setMood(null);
      setNotes('');
      setGoals([]);
    });
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
    if (goal) setGoals([{ id: Date.now(), text: String(goal), completed: false }]);

    // The plan hands over minutes of work; the rhythm decides how they're cut
    // up. Enough blocks to cover what was assigned, so the task still finishes
    // — the plan sets a budget, not a shape.
    startSession(
      isCyclic(rhythmMode)
        ? { ...rhythm, blocks: Math.max(1, Math.ceil(minutes / rhythm.work)) }
        : { work: minutes, rest: 0, blocks: 1 }
    );
  }, [
    autoStart,
    subjectId,
    paramDuration,
    goal,
    taskId,
    subjects,
    startSession,
    rhythm,
    rhythmMode,
  ]);

  /**
   * The floating "+" is not part of the tab bar — it is absolutely positioned
   * in `app/dashboard/_layout.js` — so the `setOptions` below never reached it
   * and it kept hovering over a running session.
   *
   * Tied to focus as well as to `step` because the timer deliberately keeps
   * running when the screen isn't showing (`freezeOnBlur: false`): the button
   * should come back with the rest of the furniture the moment the student is
   * looking at something else, and disappear again when they return.
   */
  useFocusEffect(
    useCallback(() => {
      setSessionActive(step === 'timer');
      return () => setSessionActive(false);
    }, [step, setSessionActive])
  );

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

    const active =
      activeRhythmRef.current || normalizeRhythm({ work: duration, rest: 0, blocks: 1 });
    const elapsedMs =
      Date.now() - sessionStartRef.current - pausedMsRef.current + skippedMsRef.current;
    const at = phaseAt(Math.floor(elapsedMs / 1000), active);

    setTimeLeft(at.remaining);
    setPhase(at.phase);
    setBlock(at.block);

    // Crossing a boundary, caught here rather than in an effect on `phase`, so
    // it happens at the moment itself and with the numbers already in hand.
    if (!at.finished && at.phase !== lastPhaseRef.current) {
      lastPhaseRef.current = at.phase;

      if (at.phase === 'break') {
        // Going into a break costs nothing to miss — you just keep working —
        // so it gets a nudge, not an announcement. A haptic is not a
        // notification, so the session's own Do Not Disturb never mutes it.
        if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
        if (Platform.OS === 'android') {
          scheduleBreakEndAlert({
            timestamp: Date.now() + at.remaining * 1000,
            subjectName: currentSubject?.name,
            block: Math.min(active.blocks, at.block + 1),
            totalBlocks: active.blocks,
          });
        }
      } else {
        // Back to work. Whatever was booked has either just fired or is no
        // longer wanted.
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
        if (Platform.OS === 'android') cancelBreakEndAlert();
      }
    }

    if (at.finished) handleComplete(false);
    return at.remaining;
  }, [duration, handleComplete, currentSubject]);

  /**
   * Gives back what's left of a break. Implemented by pushing the session
   * forward rather than by moving any pointer: everything is derived from
   * elapsed time, so adding the unused remainder to `skippedMs` lands the
   * session exactly at the start of the next block. The work total doesn't
   * move — only the clock does.
   */
  const skipBreak = useCallback(() => {
    if (!sessionStartRef.current || !activeRhythmRef.current) return;
    const active = activeRhythmRef.current;
    const elapsedMs =
      Date.now() - sessionStartRef.current - pausedMsRef.current + skippedMsRef.current;
    const at = phaseAt(Math.floor(elapsedMs / 1000), active);
    if (at.phase !== 'break' || at.finished) return;

    skippedMsRef.current += at.remaining * 1000;
    if (Platform.OS === 'android') cancelBreakEndAlert();
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    tick();
  }, [tick]);

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
      // The rhythm is all the cycle state there is: which block and which
      // phase are worked back out of the elapsed time on recovery, so there
      // is nothing else to keep in step here.
      rhythm: activeRhythmRef.current,
      skippedMs: skippedMsRef.current,
    };
    AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot)).catch((error) =>
      console.error('[Study] Error persisting session:', error)
    );
    // `phase` is in the deps so a snapshot is written at every crossing too —
    // a skipped break changes `skippedMs`, and losing that would put a
    // recovered session back where the break had been.
  }, [step, isPaused, phase, goals, selectedSubject, duration]);

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

    const active =
      activeRhythmRef.current || normalizeRhythm({ work: duration, rest: 0, blocks: 1 });
    // The progress bar still measures the whole session; only the chronometer
    // switched to the current phase. One figure each, nothing duplicated.
    const totalSeconds = active.work * active.blocks * 60 + active.rest * (active.blocks - 1) * 60;

    const publish = () => {
      const elapsedMs =
        Date.now() - sessionStartRef.current - pausedMsRef.current + skippedMsRef.current;
      const at = phaseAt(Math.floor(elapsedMs / 1000), active);

      if (isPaused) {
        updateStudySessionNotification({
          subjectName: currentSubject?.name,
          goals,
          paused: true,
          remainingSeconds: timeLeft,
          totalSeconds,
          phase: at.phase,
          block: at.block,
          totalBlocks: active.blocks,
        });
      } else {
        updateStudySessionNotification({
          subjectName: currentSubject?.name,
          goals,
          paused: false,
          // End of the current phase, not of the session: the native
          // chronometer and the ring on screen have to be counting the same
          // thing or one of them is lying.
          endTimestamp: Date.now() + at.remaining * 1000,
          elapsedSeconds: Math.floor(elapsedMs / 1000),
          totalSeconds,
          phase: at.phase,
          block: at.block,
          totalBlocks: active.blocks,
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
  }, [step, isPaused, phase, goals, currentSubject, duration]);

  // Action buttons on the notification itself (Pausar/Reanudar, Terminar) —
  // same handlers the on-screen controls use, so behavior can't drift apart.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const unsubscribe = addNotificationActionListener((action) => {
      if (step !== 'timer') return;
      if (action === ACTION.PAUSE) pauseTimer();
      else if (action === ACTION.RESUME) resumeTimer();
      else if (action === ACTION.SKIP) skipBreak();
      else if (action === ACTION.STOP) handleComplete(true);
    });
    return unsubscribe;
  }, [step, pauseTimer, resumeTimer, skipBreak, handleComplete]);

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

        // Worked out from this snapshot's own rhythm rather than from one
        // global ceiling. The old constant was 150 minutes, and a four-block
        // Schedio Study session runs 259 — a perfectly live session was being
        // thrown away as stale.
        const active = normalizeRhythm(
          snapshot.rhythm || { work: snapshot.duration, rest: 0, blocks: 1 }
        );
        if (elapsedSinceStart > staleAfterMs(active)) {
          return;
        }

        const elapsedSeconds = Math.floor(
          (elapsedSinceStart - (snapshot.pausedMs || 0) + (snapshot.skippedMs || 0)) / 1000
        );

        if (phaseAt(elapsedSeconds, active).finished) {
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
      setCelebrationQueue(null);
      flash.value = 0;
    }
  }, [step, flash]);

  // ── Render: setup ──

  const renderSetup = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeInDown.duration(320)}>
          <Text style={styles.screenTitle}>Estudiar</Text>
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

        {/* Ritmo — "ritmo" and not "método", which to a student also means the
            technique itself, nor "plan", which is a screen. */}
        <View style={styles.section}>
          <SectionTitle>Ritmo de estudio</SectionTitle>

          <RhythmPicker
            mode={rhythmMode}
            rhythm={rhythm}
            onModeChange={setStudyRhythmMode}
            onRhythmChange={(patch) => setStudyRhythm(rhythmMode, patch)}
            startOpen={!hasSeenRhythmPicker}
          />
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
    </KeyboardAvoidingView>
  );

  // ── Render: timer ──

  const renderTimer = () => {
    const active =
      activeRhythmRef.current || normalizeRhythm({ work: duration, rest: 0, blocks: 1 });
    const onBreak = phase === 'break';
    const blocks = active.blocks;

    // The ring measures the block you're in, not the whole session — the same
    // thing every timer of this kind shows, and better feedback besides. How
    // far along the session is lives in the dots above it.
    const phaseSeconds = (onBreak ? active.rest : active.work) * 60;
    const remainingFraction = phaseSeconds > 0 ? Math.max(0, timeLeft) / phaseSeconds : 0;
    const dashOffset = RING_CIRCUMFERENCE * remainingFraction;
    const reason = reasonBySubject[selectedSubject];

    const ringColor = onBreak
      ? tokens.colors.textPrimary
      : isPanicTask
        ? tokens.colors.danger
        : tokens.colors.accent;

    return (
      <GestureDetector gesture={dragToStop}>
        <Animated.View
          style={[styles.timerContainer, { paddingTop: insets.top + 24 }, surfaceStyle, dragStyle]}
        >
          <StatusBar hidden />

          <View style={styles.timerHeader}>
            <Text style={styles.timerSubject}>{currentSubject?.name || 'Estudio'}</Text>
            <Text style={styles.timerReason}>{reason || 'Sesión enfocada'}</Text>
            {isPanicTask && (
              <View style={styles.panicModeBadge}>
                <Flame size={12} color={tokens.colors.danger} strokeWidth={2} />
                <Text style={styles.panicModeBadgeText}>Modo pánico · repaso urgente</Text>
              </View>
            )}
            {focusModeActive && (
              <View style={styles.focusModeBadge}>
                <BellOff size={12} color={tokens.colors.accent} strokeWidth={2} />
                <Text style={styles.focusModeBadgeText}>Modo enfoque activo</Text>
              </View>
            )}
          </View>

          {blocks > 1 ? (
            <View style={styles.blockDots}>
              {Array.from({ length: blocks }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.blockDot,
                    i + 1 < block && styles.blockDotDone,
                    i + 1 === block && styles.blockDotNow,
                  ]}
                />
              ))}
            </View>
          ) : null}

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
                stroke={ringColor}
                // Keeps its phase colour when paused but drops right back:
                // it still says *what* is stopped without pretending anything
                // is moving.
                strokeOpacity={isPaused ? 0.35 : 1}
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
              <Text style={[styles.timeDisplay, isPaused && styles.timeDisplayPaused]}>
                {formatTime(timeLeft)}
              </Text>
              <Text style={styles.timeState}>
                {isPaused ? 'EN PAUSA' : onBreak ? 'DESCANSO' : isPanicTask ? 'PÁNICO' : 'ENFOQUE'}
              </Text>
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

          {/* Each phase keeps only what belongs to it. Objectives during a
              break would be half-finished work asking for attention in the one
              stretch that exists for not giving it any. */}
          {onBreak ? (
            <Animated.View entering={FadeIn.duration(220)} style={styles.breakBlock}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={skipBreak}
                accessibilityRole="button"
                style={styles.skipBreak}
              >
                <Text style={styles.skipBreakText}>Saltar descanso</Text>
              </TouchableOpacity>
              <Text style={styles.breakTip}>{breakTipFor(block)}</Text>
            </Animated.View>
          ) : goals.length > 0 ? (
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

              {/* Split so the reward lands before the report. Both used to
                  enter together on the same 90 ms step, which gave the XP no
                  more weight than the line of text underneath it. */}
              <View style={styles.statRow}>
                <Animated.View
                  entering={ZoomIn.duration(420).springify().damping(11)}
                  style={styles.statCell}
                >
                  <StatTile countTo={summary.xpEarned} prefix="+" label="XP ganado" accent />
                </Animated.View>
                <Animated.View
                  entering={FadeInDown.duration(460).delay(180)}
                  style={styles.statCell}
                >
                  <StatTile
                    value={String(stats?.streak ?? 0)}
                    label="Días de racha"
                    pulse={!!summary.streakUp}
                  />
                </Animated.View>
              </View>

              <Animated.Text
                entering={FadeInDown.duration(460).delay(180)}
                style={styles.endSummaryLine}
              >
                {summary.subjectName} · {summary.minutes} min estudiados · {summary.completedGoals}/
                {summary.totalGoals} objetivos completados
              </Animated.Text>

              {summary.newLevel ? (
                <Animated.Text
                  entering={FadeInDown.duration(460).delay(220)}
                  style={styles.levelUpLine}
                >
                  Subiste a nivel {summary.newLevel}
                </Animated.Text>
              ) : null}

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

        {settled && celebrationQueue ? (
          <AchievementCelebration
            queue={celebrationQueue}
            onFinish={() => setCelebrationQueue(null)}
          />
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {step === 'setup' && renderSetup()}
      {step === 'timer' && renderTimer()}
      {step === 'end' && renderEnd()}

      {/* The tick writes the preference there and then rather than on
          "Empezar sesión". It used to be staged in local state and only
          committed by that button, so ticking the box and then dismissing the
          sheet — a change of mind about starting, not about the reminder —
          threw the choice away and the sheet came back next time. */}
      <FocusReminderSheet
        visible={focusSheetVisible}
        onClose={() => setFocusSheetVisible(false)}
        onStart={confirmFocusSheet}
        dontShow={hideFocusReminder}
        onToggleDontShow={() => setHideFocusReminder(!hideFocusReminder)}
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
  flex: {
    flex: 1,
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
  durationPhraseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  durationPhrase: {
    fontFamily: font.semibold,
    fontSize: 13,
    color: tokens.colors.textSecondary,
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
    paddingVertical: 0,
    borderRadius: tokens.radius.btn,
    backgroundColor: tokens.colors.background,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    fontFamily: font.regular,
    fontSize: 15,
    color: tokens.colors.textPrimary,
    textAlignVertical: 'center',
    includeFontPadding: false,
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
  checkRowLabelWrap: {
    flex: 1,
  },
  checkRowLabel: {
    fontFamily: font.regular,
    fontSize: 15,
    color: tokens.colors.textPrimary,
  },
  // The strike is drawn separately now, so this only dims.
  checkRowLabelDim: {
    color: tokens.colors.textSecondary,
  },
  strike: {
    position: 'absolute',
    height: 1.5,
    borderRadius: 1,
    backgroundColor: tokens.colors.textSecondary,
    transformOrigin: 'left',
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
    backgroundColor: tokens.colors.surfaceCard,
  },
  swipeAction: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 10,
    backgroundColor: tokens.colors.danger,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 18,
  },
  swipeContent: {
    borderRadius: 10,
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
  focusModeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: tokens.colors.accentSoftBg,
    borderWidth: 1,
    borderColor: tokens.colors.accentSoftBorder,
    borderRadius: tokens.radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginTop: 10,
  },
  focusModeBadgeText: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: tokens.colors.accent,
  },
  panicModeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(216, 96, 74, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(216, 96, 74, 0.3)',
    borderRadius: tokens.radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginTop: 10,
  },
  panicModeBadgeText: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: tokens.colors.danger,
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
  timeDisplayPaused: { color: tokens.colors.textSecondary },
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

  // Session progress, since the ring is busy measuring the current block.
  blockDots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 18,
  },
  blockDot: {
    width: 7,
    height: 7,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.borderDefault,
  },
  blockDotDone: { backgroundColor: tokens.colors.accent },
  blockDotNow: { backgroundColor: tokens.colors.textPrimary },

  breakBlock: {
    width: '100%',
    marginTop: 22,
    flex: 1,
    alignItems: 'center',
  },
  skipBreak: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
  },
  skipBreakText: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
  breakTip: {
    marginTop: 18,
    maxWidth: 240,
    textAlign: 'center',
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.textSecondary,
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
  statCell: {
    flex: 1,
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
  // Deliberately quiet — a level-up happens most sessions, so it gets a line
  // here rather than the full celebration a rank-up or badge gets.
  levelUpLine: {
    fontFamily: font.semibold,
    fontSize: 13,
    color: tokens.colors.accent,
    textAlign: 'center',
    marginTop: 8,
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
