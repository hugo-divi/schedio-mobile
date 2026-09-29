import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
  ActivityIndicator,
  AccessibilityInfo,
  useWindowDimensions,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronDown, Check, X, Plus, Bell, Share2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  FadeIn,
  ZoomIn,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { addDays, isBefore, startOfDay } from 'date-fns';

import { auth } from '../services/firebase';
import { tokens } from '../theme/tokens';
import useAuthStore from '../store/authStore';
import useUserStore from '../store/userStore';
import usePreferencesStore from '../store/preferencesStore';
import { registerForPushNotifications } from '../services/notificationService';
import { canRequestWebPush } from '../services/pwa';
import { createExam } from '../services/exams';
import {
  ACQUISITION_SOURCES,
  EDUCATION_LEVELS,
  BACHILLERATO_BRANCHES,
  BACHILLERATO_YEARS,
  normalizeBranch,
  REGIONS,
  regionLabelFor,
  SUBJECT_COLORS,
  MIN_SUBJECTS,
  MAX_SUBJECTS,
  MIN_SUBJECT_NAME,
  REVIEW_FREQUENCY,
  TASK_MANAGEMENT,
  templateFor,
  estimatePotential,
  loadOnboarding,
  saveOnboardingStep,
  completeOnboarding,
} from '../services/onboarding';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';
import BottomSheet from '../components/ui/BottomSheet';
import { CalendarPicker } from '../components/ui/CalendarPicker';
import OnboardingCalc from '../components/OnboardingCalc';
import OnboardingIntro from '../components/OnboardingIntro';
import OnboardingPaywall from '../components/OnboardingPaywall';
import useLocaleFormat from '../hooks/useLocaleFormat';

const font = tokens.typography.families.inter;

/** Was 7. The eighth is the acquisition question, which used to sit below the
 *  fold of step 5 — competing with the estimated grade, the only screen in the
 *  flow whose whole job is to talk about the student. See `case 8`. */
const TOTAL_STEPS = 8;

/** The system's standard curve (tokens.js) as a Reanimated easing. */
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

/** Step-change motion. Out is quicker than in: the leaving step only has to
 *  clear the way, while the arriving one is what the student reads. */
const OUT_MS = 150;
const IN_MS = 280;

/** The grade counter. Long on purpose — the rise is the point, so it has to
 *  be watchable rather than merely noticed. */
const RANGE_MS = 2500;

/** How far the low figure trails the high one. */
const RANGE_LAG_MS = 260;

/**
 * Quadratic S, not the cubic one and not an ease-out. An ease-out puts ~88% of
 * the climb in the first half and leaves the rest crawling; a cubic S keeps the
 * first ~600 ms almost still. This moves legibly the whole way and still lands
 * softly.
 */
const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
/**
 * Same three the student sees in EventModal, stored the same way. Anything
 * else here would mean the first exam of their life is the one exam whose
 * importance is set on a scale the rest of the app does not use.
 */
const EXAM_PRIORITIES = [
  { key: 3, label: 'Baja' },
  { key: 5, label: 'Normal' },
  { key: 9, label: 'Alta' },
];

const formatGrade = (value) => value.toFixed(1).replace('.', ',');

// ── Pieces ──────────────────────────────────────────────────────────────────

function Choice({ label, desc, selected, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.choice, selected && styles.choiceOn]}
    >
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.choiceLabel}>{label}</Text>
        {desc ? <Text style={styles.choiceDesc}>{desc}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

const oneDecimal = (n) => n.toFixed(1).replace('.', ',');

/**
 * The projected range, counting up from the grade the student actually has.
 *
 * Seeing the number climb is the whole argument of step 5 — a range that is
 * simply printed is a fact, one that rises is a promise about their course.
 *
 * Driven from JS rather than through `useAnimatedProps`: animating text in
 * Reanimated means an AnimatedTextInput and undoing its native padding and
 * baseline, and this screen is otherwise idle, so a plain rAF loop costs
 * nothing and stays readable.
 */
function AnimatedRange({ from, lo, hi }) {
  const [shown, setShown] = useState([from, from]);

  useEffect(() => {
    let frame = null;
    let snap = null;
    let cancelled = false;

    const land = () => {
      if (!cancelled) setShown([lo, hi]);
    };

    const run = () => {
      let start = null;
      const step = (now) => {
        if (cancelled) return;
        if (start === null) start = now;
        const e = now - start;
        // The high figure leads and the low one follows. The other way round
        // the low one overtook mid-climb and the range read backwards
        // ("6,4 - 6,2") for half a second.
        const tHi = Math.min(1, Math.max(0, e / RANGE_MS));
        const tLo = Math.min(1, Math.max(0, (e - RANGE_LAG_MS) / RANGE_MS));
        setShown([
          from + (lo - from) * easeInOutQuad(tLo),
          from + (hi - from) * easeInOutQuad(tHi),
        ]);
        if (e < RANGE_MS + RANGE_LAG_MS) frame = requestAnimationFrame(step);
        else land();
      };
      frame = requestAnimationFrame(step);

      // rAF stops being delivered when the app goes to the background, and
      // resumes with a fresh clock. Without this the number would sit frozen
      // half-way up for as long as the screen stayed open, which is worse
      // than never animating it.
      snap = setTimeout(land, RANGE_MS + RANGE_LAG_MS + 120);
    };

    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) land();
        else run();
      })
      .catch(() => {
        if (!cancelled) run();
      });

    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
      if (snap) clearTimeout(snap);
    };
  }, [from, lo, hi]);

  return (
    <Text
      style={styles.estimateRange}
      accessibilityLabel={`Entre ${oneDecimal(lo)} y ${oneDecimal(hi)}`}
    >
      {oneDecimal(shown[0])} – {oneDecimal(shown[1])}
    </Text>
  );
}

function Pill({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[styles.pill, selected && styles.pillOn]}
    >
      <Text style={[styles.pillText, selected && styles.pillTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function Onboarding() {
  const { formatDate } = useLocaleFormat();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const clearUser = useAuthStore((state) => state.clearUser);
  const setNotificationsEnabled = usePreferencesStore((state) => state.setNotificationsEnabled);

  const { width } = useWindowDimensions();

  // Expo's edge-to-edge stops Android's `adjustResize` from shrinking the JS
  // layout, so a field low on a step (the grade on step 1) was left under the
  // keyboard. Track it and make room ourselves, then scroll the field up.
  const scrollRef = useRef(null);
  const [keyboardPad, setKeyboardPad] = useState(0);

  useEffect(() => {
    // iOS is already handled by the KeyboardAvoidingView below.
    if (Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardPad(Math.max(0, (event?.endCoordinates?.height ?? 0) - insets.bottom));
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardPad(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom]);

  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);

  /** Set when step 7's "Saltar" is used. The skip has to reach `finish` from
   *  step 8 now that the acquisition question sits between the two, so it can
   *  no longer be a plain argument passed at the moment of the tap. */
  const [goalSkipped, setGoalSkipped] = useState(false);

  // Step motion. One view is animated in place rather than two crossing over:
  // Reanimated's `exiting` keeps the leaving step mounted, and inside this
  // ScrollView that stacks it above the arriving one and doubles the content
  // height for the length of the animation.
  const slideX = useSharedValue(0);
  const slideOpacity = useSharedValue(1);
  const slideStyle = useAnimatedStyle(() => ({
    opacity: slideOpacity.value,
    transform: [{ translateX: slideX.value }],
  }));

  const progress = useSharedValue(1 / TOTAL_STEPS);
  const progressStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  /**
   * The two interstitials — the estimate calculation (after step 4) and the
   * Prime offer (after step 5). Neither is a step: they stay out of
   * `TOTAL_STEPS`, out of "Paso X de 7" and out of the saved progress, because
   * counting them would turn a seven-step flow into a nine-step one and make
   * the paywall in particular read as something you have to get through.
   */
  const [calculating, setCalculating] = useState(false);
  const [paywall, setPaywall] = useState(false);

  /** The brand beat before the first question. Only ever true on a genuine
   *  first entry — resolved from storage below, so someone resuming a
   *  half-finished flow gets their next question instead of a title card. */
  const [intro, setIntro] = useState(false);

  const [educationLevel, setEducationLevel] = useState(null);
  const [currentGrade, setCurrentGrade] = useState('');
  const [region, setRegion] = useState(null);
  const [regionSheet, setRegionSheet] = useState(false);
  const [branch, setBranch] = useState(null);
  const [courseYear, setCourseYear] = useState(null);
  /** Whether this 2º de Bachillerato student sits the PAU this year. On by
   *  default the moment they pick 2º — nearly all of them do, so the common
   *  case costs no tap, and seeing it already ticked is how they learn the app
   *  is about to shape itself around the exam. Null outside 2º. */
  const [takesPau, setTakesPau] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [newSubject, setNewSubject] = useState('');
  const [subjectError, setSubjectError] = useState('');
  const [paletteFor, setPaletteFor] = useState(null);
  const [reviewFrequency, setReviewFrequency] = useState(null);
  const [acquisitionSource, setAcquisitionSource] = useState(null);
  const [taskManagement, setTaskManagement] = useState(null);
  const [howSheet, setHowSheet] = useState(false);
  const [notificationsConsent, setNotificationsConsent] = useState(null);

  // Step 6 replaces "Permitir notificaciones" with install instructions on
  // web when the browser can't be asked (see canRequestWebPush) — there's no
  // button there to set `notificationsConsent`, so `canAdvance()` would
  // stay stuck on `null` forever and trap the student on this step.
  useEffect(() => {
    if (
      step === 6 &&
      Platform.OS === 'web' &&
      !canRequestWebPush() &&
      notificationsConsent === null
    ) {
      setNotificationsConsent(false);
      setNotificationsEnabled(false);
    }
  }, [step, notificationsConsent, setNotificationsEnabled]);
  const [examName, setExamName] = useState('');
  const [examDate, setExamDate] = useState(addDays(new Date(), 7));
  const [examPriority, setExamPriority] = useState(5);
  const [goalSubject, setGoalSubject] = useState(null);

  // ── Resume where they left off ──

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      // No account to have saved anything against, so this is a first entry
      // by definition.
      setIntro(true);
      setReady(true);
      return;
    }
    loadOnboarding(uid).then((saved) => {
      if (saved) {
        if (saved.educationLevel) setEducationLevel(saved.educationLevel);
        if (saved.currentGrade != null) setCurrentGrade(String(saved.currentGrade));
        if (saved.region) setRegion(saved.region);
        // Translated on the way in: a flow saved before the modalidades were
        // corrected comes back as "Técnico" or "Ciencias Sociales", which no
        // longer match any pill and would leave the question looking unanswered.
        if (saved.branch) setBranch(normalizeBranch(saved.branch));
        if (saved.courseYear) setCourseYear(saved.courseYear);
        if (saved.takesPau != null) setTakesPau(saved.takesPau);
        if (Array.isArray(saved.subjects)) setSubjects(saved.subjects);
        if (saved.reviewFrequency) setReviewFrequency(saved.reviewFrequency);
        if (saved.acquisitionSource) setAcquisitionSource(saved.acquisitionSource);
        if (saved.taskManagement) setTaskManagement(saved.taskManagement);
        if (saved.notificationsConsent != null) setNotificationsConsent(saved.notificationsConsent);
        if (saved.step) setStep(Math.min(TOTAL_STEPS, saved.step));
      }
      // Decided here rather than from `step`, because `setStep` above has not
      // been applied yet by the time this runs.
      setIntro(!saved?.step || saved.step <= 1);
      setReady(true);
    });
  }, []);

  // ── Validation ──

  const gradeValue = parseFloat(currentGrade.replace(',', '.'));
  const gradeError =
    currentGrade.trim() === ''
      ? ''
      : Number.isNaN(gradeValue) || gradeValue < 0 || gradeValue > 10
        ? 'La nota tiene que estar entre 0 y 10.'
        : '';

  const templates = useMemo(
    () =>
      templateFor(educationLevel, branch, courseYear).filter(
        (n) => !subjects.some((s) => s.name === n)
      ),
    [educationLevel, branch, courseYear, subjects]
  );

  const canAdvance = () => {
    switch (step) {
      case 1:
        return !!educationLevel && !!region && currentGrade.trim() !== '' && !gradeError;
      case 2:
        // The year is required for Bachillerato and the modalidad is not: one
        // tap, and without it nothing about the PAU can be shown to the right
        // students. The modalidad only sharpens the suggestions.
        return (
          subjects.length >= MIN_SUBJECTS && (educationLevel !== 'Bachillerato' || !!courseYear)
        );
      case 3:
        return !!reviewFrequency;
      case 4:
        return !!taskManagement;
      case 5:
        return true;
      case 6:
        return notificationsConsent !== null;
      // One thing to do here, so all of it has to be filled in. The way past
      // it for someone with no dates yet is the opt-out under the form, not a
      // half-empty exam.
      case 7:
        return (
          goalSubject !== null &&
          examName.trim().length >= 2 &&
          !isBefore(startOfDay(examDate), startOfDay(new Date()))
        );
      // The acquisition question is ours, not theirs — it must never be able
      // to trap someone at the last screen of the flow.
      case 8:
        return true;
      default:
        return false;
    }
  };

  const estimate = useMemo(
    () =>
      estimatePotential({
        currentGrade: gradeValue,
        educationLevel,
        reviewFrequency,
        taskManagement,
      }),
    [gradeValue, educationLevel, reviewFrequency, taskManagement]
  );

  useEffect(() => {
    // Spring rather than a hard width swap: the small overshoot pulls the eye
    // to the end of the bar exactly when the step changes, which is the one
    // moment the student cares how much is left. Settles after the slide
    // below on purpose — the bar is what closes the movement.
    progress.value = withSpring(step / TOTAL_STEPS, { damping: 15, stiffness: 120 });
  }, [step, progress]);

  const enterStep = useCallback(
    (next, direction) => {
      setStep(next);
      slideX.value = direction * width * 0.3;
      slideX.value = withTiming(0, { duration: IN_MS, easing: EASE });
      slideOpacity.value = withTiming(1, { duration: IN_MS - 60, easing: EASE });
    },
    [slideOpacity, slideX, width]
  );

  /** `direction` is 1 going forward and -1 going back, so the step leaves on
   *  the side the student is heading away from. */
  const transitionTo = useCallback(
    (next, direction) => {
      slideOpacity.value = withTiming(0, { duration: OUT_MS - 20, easing: EASE });
      slideX.value = withTiming(
        -direction * width * 0.3,
        { duration: OUT_MS, easing: EASE },
        (finished) => {
          if (finished) runOnJS(enterStep)(next, direction);
        }
      );
    },
    [enterStep, slideOpacity, slideX, width]
  );

  const patchFor = useCallback(
    (nextStep) => ({
      step: nextStep,
      educationLevel,
      currentGrade: Number.isNaN(gradeValue) ? null : gradeValue,
      region,
      branch,
      courseYear,
      takesPau,
      subjects,
      reviewFrequency,
      taskManagement,
      notificationsConsent,
      acquisitionSource,
    }),
    [
      educationLevel,
      gradeValue,
      region,
      branch,
      courseYear,
      takesPau,
      subjects,
      reviewFrequency,
      taskManagement,
      notificationsConsent,
      acquisitionSource,
    ]
  );

  // ── Navigation ──

  const goNext = async () => {
    if (!canAdvance() || saving) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync();

    if (step === TOTAL_STEPS) {
      finish();
      return;
    }

    const uid = auth.currentUser?.uid;
    const next = step + 1;

    if (step === 5) {
      // Historical: what we told them when they started, kept as it was said.
      await saveOnboardingStep(uid, {
        ...patchFor(next),
        estimatedRange: estimate.range,
        estimationReason: estimate.reasons,
      });
    } else {
      await saveOnboardingStep(uid, patchFor(next));
    }

    /* The interstitials advance the flow themselves once they are done. The
       step after each one is already saved above, so closing the app mid-way
       resumes there instead of replaying either — which matters most for the
       paywall: one that reappears after being walked away from is nagging. */
    if (step === 4) {
      setCalculating(true);
      return;
    }
    // Prime isn't sold on web — same reasoning as app/plus.js. Falling
    // through to the normal transition below skips straight to step 6, same
    // as tapping "Continuar con la versión gratuita" would.
    if (step === 5 && Platform.OS !== 'web') {
      setPaywall(true);
      return;
    }

    transitionTo(next, 1);
  };

  const afterCalc = useCallback(() => {
    setCalculating(false);
    setStep(5);
  }, []);

  /** Same exit for both buttons: buying and declining differ in what they
   * unlock, not in where the student ends up. */
  const afterPaywall = useCallback(() => {
    setPaywall(false);
    setStep(6);
  }, []);

  const goBack = async () => {
    if (step === 1) {
      // Cancelling would otherwise leave an account signed in with no
      // onboarding and no way back into the flow.
      await auth.signOut().catch(() => {});
      clearUser();
      router.replace('/login');
      return;
    }
    await saveOnboardingStep(auth.currentUser?.uid, patchFor(step - 1));
    transitionTo(step - 1, -1);
  };

  const finish = async () => {
    const skipGoal = goalSkipped;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setSaving(true);
    try {
      // Subjects become real — and get ids — regardless of whether the
      // student skips choosing a first goal.
      const created = await completeOnboarding(uid, {
        educationLevel,
        branch,
        courseYear,
        takesPau,
        currentGrade: Number.isNaN(gradeValue) ? null : gradeValue,
        region,
        subjects,
        taskManagement,
        reviewFrequency,
        estimatedRange: estimate.range,
        estimationReason: estimate.reasons,
        acquisitionSource,
      });

      const chosen = skipGoal ? null : created[goalSubject];

      if (chosen) {
        await createExam({
          userId: uid,
          name: examName.trim(),
          subjectId: chosen.id,
          subject: chosen.name,
          date: examDate,
          type: 'exam',
          // `manualPriority` is the field services/priority.js actually reads
          // (`manualPriority ?? priority`) and the one EventModal writes. This
          // used to store a flat `priority: 5`, which worked only because of
          // that fallback and meant the pick had nowhere to go.
          manualPriority: examPriority,
          completed: false,
          // Lets the guided tour recognise and call out this exact item as
          // "what you just created" instead of speaking generically.
          fromOnboarding: true,
        });
      }

      await useUserStore.getState().loadUserData(uid);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.replace('/dashboard');
    } catch (error) {
      console.error('Onboarding error:', error);
      setSaving(false);
    }
  };

  // ── Subjects ──

  const addSubject = (name) => {
    const clean = (name ?? newSubject).trim();
    if (clean.length < MIN_SUBJECT_NAME) {
      setSubjectError(`El nombre necesita al menos ${MIN_SUBJECT_NAME} caracteres.`);
      return;
    }
    if (subjects.some((s) => s.name.toLowerCase() === clean.toLowerCase())) {
      setSubjectError('Ya tienes esta asignatura.');
      return;
    }
    if (subjects.length >= MAX_SUBJECTS) {
      setSubjectError(`El máximo son ${MAX_SUBJECTS} asignaturas.`);
      return;
    }
    setSubjects((prev) => [
      ...prev,
      { name: clean, color: SUBJECT_COLORS[prev.length % SUBJECT_COLORS.length] },
    ]);
    setNewSubject('');
    setSubjectError('');
  };

  const removeSubject = (index) => {
    setSubjects((prev) => prev.filter((_, i) => i !== index));
    setPaletteFor(null);
    setGoalSubject(null);
  };

  const recolour = (index, color) => {
    setSubjects((prev) => prev.map((s, i) => (i === index ? { ...s, color } : s)));
    setPaletteFor(null);
  };

  if (!ready) {
    return (
      <View style={[styles.container, styles.centred]}>
        <ActivityIndicator color={tokens.colors.accent} />
      </View>
    );
  }

  // ── Steps ──

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <>
            <Text style={styles.title}>¿Dónde estudias?</Text>
            <Text style={styles.lead}>Con esto ajustamos las asignaturas que te sugerimos.</Text>
            <View style={styles.pillWrap}>
              {EDUCATION_LEVELS.map((level) => (
                <Pill
                  key={level}
                  label={level}
                  selected={educationLevel === level}
                  onPress={() => {
                    setEducationLevel(level);
                    if (level !== 'Bachillerato') {
                      setBranch(null);
                      setCourseYear(null);
                      setTakesPau(null);
                    }
                  }}
                />
              ))}
            </View>

            <View style={{ marginTop: 28 }}>
              <Text style={styles.fieldLabel}>¿En qué comunidad estudias?</Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setRegionSheet(true)}
                accessibilityRole="button"
                accessibilityLabel={
                  region ? `Comunidad: ${regionLabelFor(region)}` : 'Elegir comunidad'
                }
                style={[styles.select, region && styles.selectOn]}
              >
                <Text style={region ? styles.selectValue : styles.selectPlaceholder}>
                  {region ? regionLabelFor(region) : 'Elígela en la lista'}
                </Text>
                <ChevronDown size={18} color={tokens.colors.textSecondary} strokeWidth={1.75} />
              </TouchableOpacity>
              <Text style={styles.hint}>
                El temario cambia según la comunidad. Nos sirve para ajustar la app a lo que
                realmente estudias.
              </Text>
            </View>

            <View style={{ marginTop: 28 }}>
              <Input
                label="Tu nota media actual"
                value={currentGrade}
                onChangeText={setCurrentGrade}
                placeholder="Ej. 6,5"
                keyboardType="decimal-pad"
                onFocus={() =>
                  setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150)
                }
              />
              {gradeError ? <Text style={styles.error}>{gradeError}</Text> : null}
              <Text style={styles.hint}>
                Aproximada, la del último curso. Sirve para estimar tu margen de mejora.
              </Text>
            </View>
          </>
        );

      case 2:
        return (
          <>
            <Text style={styles.title}>Tus asignaturas</Text>
            <Text style={[styles.lead, { marginBottom: 6 }]}>
              Añade entre {MIN_SUBJECTS} y {MAX_SUBJECTS}. Toca una para cambiarle el color.
            </Text>
            {/* The cap and the minimum both read as demands, and a student who
                can't remember their full timetable stalls here rather than
                guessing. Naming where they can fix it later is what actually
                unblocks them — a vague "no hay prisa" doesn't. */}
            <Text style={[styles.hint, { marginTop: 0, marginBottom: 20 }]}>
              No hace falta que sea la lista definitiva. Podrás añadir, quitar o cambiar asignaturas
              cuando quieras desde tu perfil.
            </Text>

            {/* Here rather than in step 1, next to "¿Dónde estudias?": both
                answers exist to pick the subjects, and here the suggestions
                below change the moment they tap — the question pays for itself
                on the same screen. Step 1 was already asking four things. */}
            {educationLevel === 'Bachillerato' ? (
              <>
                <Text style={styles.fieldLabel}>Curso</Text>
                <View style={styles.pillWrap}>
                  {BACHILLERATO_YEARS.map((year) => (
                    <Pill
                      key={year}
                      label={`${year}º de Bachillerato`}
                      selected={courseYear === year}
                      onPress={() => {
                        setCourseYear(year);
                        // Ticked on arrival at 2º, but a choice they already
                        // made survives a detour through 1º and back.
                        if (year === 2) setTakesPau((prev) => prev ?? true);
                        else setTakesPau(null);
                      }}
                    />
                  ))}
                </View>

                {courseYear === 2 ? (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      setTakesPau(!takesPau);
                      if (Platform.OS !== 'web') Haptics.selectionAsync();
                    }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: !!takesPau }}
                    style={[styles.choice, styles.pauToggle, takesPau && styles.choiceOn]}
                  >
                    {/* Square, unlike the round radios elsewhere in the flow:
                        this one is ticked on and off, not picked from a set. */}
                    <View style={[styles.radio, styles.checkbox, takesPau && styles.radioOn]}>
                      {takesPau ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.choiceLabel}>Tengo la PAU este año</Text>
                      {/* Says what the tick buys, and on the way out says only
                          what is true — no promise of a setting to undo it that
                          does not exist yet. */}
                      <Text style={styles.choiceDesc}>
                        {takesPau
                          ? 'Adaptaremos Schedio a tu PAU: cuenta atrás, calculadora de nota y plan de repaso.'
                          : 'Sin PAU: no verás la cuenta atrás ni nada relacionado con el examen.'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ) : null}

                <Text style={styles.fieldLabel}>Modalidad</Text>
                <View style={styles.pillWrap}>
                  {BACHILLERATO_BRANCHES.map((b) => (
                    <Pill
                      key={b}
                      label={b}
                      selected={branch === b}
                      // Tapping the chosen one again clears it — it is optional,
                      // and there is no other way back to "not answered".
                      onPress={() => setBranch(branch === b ? null : b)}
                    />
                  ))}
                </View>
              </>
            ) : null}

            <View style={{ marginTop: 20 }}>
              <View style={styles.addRow}>
                <TextInput
                  style={styles.addInput}
                  value={newSubject}
                  onChangeText={(t) => {
                    setNewSubject(t);
                    setSubjectError('');
                  }}
                  onSubmitEditing={() => addSubject()}
                  placeholder="Escribe una asignatura"
                  placeholderTextColor={tokens.colors.textDisabled}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => addSubject()}
                  accessibilityLabel="Añadir asignatura"
                >
                  <Plus size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              {subjectError ? <Text style={styles.error}>{subjectError}</Text> : null}
            </View>

            {subjects.length > 0 ? (
              <View style={styles.chipWrap}>
                {subjects.map((subject, index) => (
                  // The haptic already fires on add; this is the view finally
                  // answering back. It is the control tapped most often in the
                  // whole flow, so the acknowledgement earns its keep here.
                  <Animated.View
                    key={`${subject.name}-${index}`}
                    entering={ZoomIn.springify().damping(14).mass(0.6)}
                  >
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setPaletteFor(paletteFor === index ? null : index)}
                      style={[styles.chip, { borderColor: subject.color }]}
                    >
                      <View style={[styles.chipDot, { backgroundColor: subject.color }]} />
                      <Text style={styles.chipText}>{subject.name}</Text>
                      <TouchableOpacity
                        onPress={() => removeSubject(index)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel={`Quitar ${subject.name}`}
                      >
                        <X size={14} color={tokens.colors.textSecondary} />
                      </TouchableOpacity>
                    </TouchableOpacity>

                    {paletteFor === index ? (
                      <Animated.View entering={FadeIn.duration(140)} style={styles.palette}>
                        {SUBJECT_COLORS.map((color) => (
                          <TouchableOpacity
                            key={color}
                            onPress={() => recolour(index, color)}
                            style={[
                              styles.paletteDot,
                              { backgroundColor: color },
                              subject.color === color && styles.paletteDotOn,
                            ]}
                          />
                        ))}
                      </Animated.View>
                    ) : null}
                  </Animated.View>
                ))}
              </View>
            ) : null}

            {templates.length > 0 ? (
              <>
                <Text style={styles.fieldLabel}>Sugerencias</Text>
                <View style={styles.chipWrap}>
                  {templates.map((name) => (
                    <TouchableOpacity
                      key={name}
                      activeOpacity={0.8}
                      onPress={() => addSubject(name)}
                      style={styles.suggestion}
                    >
                      <Plus size={13} color={tokens.colors.textSecondary} />
                      <Text style={styles.suggestionText}>{name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={styles.hint}>
              {subjects.length} de {MIN_SUBJECTS} mínimas
              {subjects.length >= MIN_SUBJECTS ? ' · ya puedes continuar' : ''}
            </Text>
          </>
        );

      case 3:
        return (
          <>
            <Text style={styles.title}>¿Repasas lo que das en clase?</Text>
            <Text style={styles.lead}>
              No hay respuesta mala. Sirve para saber cuánto te tenemos que avisar.
            </Text>
            <View style={styles.choices}>
              {REVIEW_FREQUENCY.map((option) => (
                <Choice
                  key={option.value}
                  label={option.label}
                  desc={option.desc}
                  selected={reviewFrequency === option.value}
                  onPress={() => setReviewFrequency(option.value)}
                />
              ))}
            </View>
          </>
        );

      case 4:
        return (
          <>
            <Text style={styles.title}>¿Cómo llevas tus tareas?</Text>
            <Text style={styles.lead}>
              Esto decide cuánto tiempo diario damos por bueno al construir tu plan.
            </Text>
            <View style={styles.choices}>
              {TASK_MANAGEMENT.map((option) => (
                <Choice
                  key={option.value}
                  label={option.label}
                  desc={option.desc}
                  selected={taskManagement === option.value}
                  onPress={() => setTaskManagement(option.value)}
                />
              ))}
            </View>
          </>
        );

      case 5:
        return (
          <>
            <Text style={styles.title}>Tu margen con Schedio</Text>
            <Text style={styles.lead}>Una estimación, no una promesa.</Text>

            <Card padding={20}>
              <Text style={styles.estimateLabel}>Ahora</Text>
              <Text style={styles.estimateNow}>
                {Number.isNaN(gradeValue) ? '—' : gradeValue.toFixed(1).replace('.', ',')}
              </Text>
              <View style={styles.divider} />
              <Text style={styles.estimateLabel}>Podrías llegar a</Text>
              {/* Counts up from the grade they actually gave, so the rise is
                  theirs rather than an abstract pair of numbers. */}
              <AnimatedRange
                from={Number.isNaN(gradeValue) ? estimate.range[0] : gradeValue}
                lo={estimate.range[0]}
                hi={estimate.range[1]}
              />
            </Card>

            <View style={styles.reasons}>
              {estimate.reasons.map((reason) => (
                <View key={reason} style={styles.reasonRow}>
                  <View style={styles.reasonDot} />
                  <Text style={styles.reasonText}>{reason}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity onPress={() => setHowSheet(true)} style={{ marginTop: 20 }}>
              <Text style={styles.link}>¿Cómo se calcula esto?</Text>
            </TouchableOpacity>
          </>
        );

      case 6:
        return (
          <>
            <Text style={styles.title}>Que no se te pase nada</Text>
            <Text style={styles.lead}>Esto es lo que te avisaríamos:</Text>

            <View style={styles.choices}>
              {[
                ['Exámenes próximos', 'Te avisamos 3 días y 1 día antes.'],
                ['Vuelta a la app', 'Si llevas días sin abrirla y tienes exámenes cerca.'],
                ['Logros', 'Cuando completas tus objetivos de la semana.'],
              ].map(([label, desc]) => (
                <View key={label} style={styles.infoRow}>
                  <View style={styles.infoIcon}>
                    <Bell size={16} color={tokens.colors.accent} strokeWidth={1.75} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.choiceLabel}>{label}</Text>
                    <Text style={styles.choiceDesc}>{desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* iOS Safari only grants notification permission to a PWA
                already added to the home screen — asking here would just
                fail silently. Point at that step instead of the button, and
                let "Más tarde" carry the flow forward either way; the
                dashboard picks up the ask automatically once the student
                does install (see registerForWebPush). */}
            {Platform.OS === 'web' && !canRequestWebPush() ? (
              <View style={[styles.infoRow, { marginTop: 24 }]}>
                <View style={styles.infoIcon}>
                  <Share2 size={16} color={tokens.colors.accent} strokeWidth={1.75} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.choiceLabel}>Instala Schedio para activar esto</Text>
                  <Text style={styles.choiceDesc}>
                    En Safari, toca Compartir y luego "Añadir a pantalla de inicio". Podrás
                    activarlas después desde Ajustes.
                  </Text>
                </View>
              </View>
            ) : (
              <View style={{ marginTop: 24, gap: 10 }}>
                <Button
                  title="Permitir notificaciones"
                  fullWidth
                  onPress={async () => {
                    // registerForPushNotifications, not requestPermissions: the
                    // latter only asks the OS. The FCM token used to be written
                    // solely from the dashboard, which you reach by finishing
                    // this flow — so an account that said yes here and then
                    // stopped at step 7 had granted permission and still had no
                    // token, leaving it unreachable by every Cloud Function we
                    // run. That is the cohort worth recovering most.
                    //
                    // Guarded because this can throw where the dashboard's
                    // fire-and-forget call could afford not to care: fetching
                    // the token fails on a device with no Play Services, and an
                    // unhandled rejection here would leave `notificationsConsent`
                    // null — which `canAdvance` reads, trapping the student on
                    // this step with no way forward.
                    let granted = false;
                    try {
                      granted = await registerForPushNotifications(auth.currentUser?.uid);
                    } catch (error) {
                      console.warn('[Onboarding] Could not register for push:', error?.message);
                    }
                    setNotificationsConsent(granted);
                    setNotificationsEnabled(granted);
                  }}
                />
                <Button
                  title="Más tarde"
                  variant="secondary"
                  fullWidth
                  onPress={() => {
                    setNotificationsConsent(false);
                    setNotificationsEnabled(false);
                  }}
                />
              </View>
            )}

            {notificationsConsent === false ? (
              <Animated.Text entering={FadeIn.duration(200)} style={styles.warning}>
                Sin notificaciones pierdes lo que más avisa: los recordatorios de examen. Puedes
                activarlas cuando quieras en Ajustes.
              </Animated.Text>
            ) : null}
            {notificationsConsent === true ? (
              <Animated.Text entering={FadeIn.duration(200)} style={styles.ok}>
                Listo. Te avisaremos solo de lo que importa.
              </Animated.Text>
            ) : null}
          </>
        );

      /**
       * One job: the first exam. The screen used to offer a choice between an
       * exam and a "planned session", and the session half never really
       * existed — there is no planned-session in the model, so it wrote a
       * manual task named "Estudiar <asignatura>". Two options where one was
       * real, on the last screen anybody has patience for. Now the form is the
       * screen, with the same fields EventModal collects, and the way out for
       * someone with no dates yet is the opt-out underneath.
       */
      case 7:
        return (
          <>
            <Text style={styles.title}>Añade tu primer examen</Text>
            <Text style={styles.lead}>
              Con una fecha real Schedio ya puede repartirte las sesiones. Podrás añadir más cuando
              quieras.
            </Text>

            <View style={{ marginTop: 22 }}>
              <Input
                label="¿De qué es el examen?"
                value={examName}
                onChangeText={setExamName}
                placeholder="Ej. Tema 4 y 5"
                autoCapitalize="sentences"
              />
            </View>

            <Text style={styles.fieldLabel}>Asignatura</Text>
            <View style={styles.chipWrap}>
              {subjects.map((subject, index) => (
                <TouchableOpacity
                  key={`${subject.name}-${index}`}
                  activeOpacity={0.8}
                  onPress={() => {
                    setGoalSubject(index);
                    if (Platform.OS !== 'web') Haptics.selectionAsync();
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: goalSubject === index }}
                  style={[
                    styles.chip,
                    {
                      borderColor:
                        goalSubject === index ? subject.color : tokens.colors.borderDefault,
                    },
                    goalSubject === index && { backgroundColor: tokens.colors.accentSoftBg },
                  ]}
                >
                  <View style={[styles.chipDot, { backgroundColor: subject.color }]} />
                  <Text style={styles.chipText}>{subject.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>¿Cuándo es?</Text>
            <CalendarPicker value={examDate} onChange={setExamDate} />
            {isBefore(startOfDay(examDate), startOfDay(new Date())) ? (
              <Text style={styles.error}>La fecha no puede estar en el pasado.</Text>
            ) : (
              <Text style={styles.hint}>{formatDate(examDate, 'weekdayLongDayMonth')}</Text>
            )}

            <Text style={styles.fieldLabel}>Importancia</Text>
            <View style={styles.pillWrap}>
              {EXAM_PRIORITIES.map((option) => (
                <Pill
                  key={option.key}
                  label={option.label}
                  selected={examPriority === option.key}
                  onPress={() => {
                    setExamPriority(option.key);
                    if (Platform.OS !== 'web') Haptics.selectionAsync();
                  }}
                />
              ))}
            </View>
            <Text style={styles.hint}>
              Cuenta para decidir a qué le damos prioridad cuando dos exámenes caen juntos.
            </Text>

            {/* Under the form, not in the header. Someone with no dates yet
                has to be able to leave, but the opt-out should read as the
                second option after trying the first — not as an equally
                weighted choice offered before they have seen what is asked. */}
            <TouchableOpacity
              onPress={() => {
                setGoalSkipped(true);
                transitionTo(8, 1);
              }}
              disabled={saving}
              style={styles.optOut}
              accessibilityRole="button"
            >
              <Text style={styles.optOutText}>Todavía no tengo exámenes</Text>
            </TouchableOpacity>
          </>
        );

      case 8:
        return (
          <>
            <Text style={styles.title}>Una última cosa</Text>
            <Text style={styles.lead}>
              Opcional, y no cambia nada de tu plan. Solo nos ayuda a saber dónde encontrar a más
              estudiantes como tú.
            </Text>

            <Text style={[styles.fieldLabel, { marginTop: 26 }]}>¿Cómo llegaste a Schedio?</Text>
            <View style={styles.sourceWrap}>
              {ACQUISITION_SOURCES.map((option) => {
                const selected = acquisitionSource === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    activeOpacity={0.8}
                    // Tapping the chosen one again clears it — the only way
                    // back out of a question that never had to be answered.
                    onPress={() => {
                      setAcquisitionSource(selected ? null : option.value);
                      if (Platform.OS !== 'web') Haptics.selectionAsync();
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={[styles.sourceChip, selected && styles.sourceChipOn]}
                  >
                    <Text style={[styles.sourceChipText, selected && styles.sourceChipTextOn]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={goBack}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel={step === 1 ? 'Cancelar' : 'Volver'}
        >
          {step === 1 ? (
            <X size={22} color={tokens.colors.textSecondary} strokeWidth={1.75} />
          ) : (
            <ChevronLeft size={22} color={tokens.colors.textPrimary} strokeWidth={1.75} />
          )}
        </TouchableOpacity>
        <View style={styles.progress}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, progressStyle]} />
          </View>
          <Text style={styles.progressText}>
            Paso {step} de {TOTAL_STEPS}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.content, { paddingBottom: 32 + keyboardPad }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* No `key={step}`: remounting would hand the job to Reanimated's
              layout animations, and an `exiting` step stays mounted inside
              this ScrollView long enough to stack under the arriving one. A
              single view moved by `slideStyle` cannot do that. */}
          <Animated.View style={slideStyle}>{renderStep()}</Animated.View>
        </ScrollView>

        <View
          style={[styles.footer, { paddingBottom: insets.bottom + 16, marginBottom: keyboardPad }]}
        >
          <Button
            title={step === TOTAL_STEPS ? 'Completar' : 'Siguiente'}
            fullWidth
            loading={saving}
            disabled={!canAdvance()}
            onPress={goNext}
          />
        </View>
      </KeyboardAvoidingView>

      <BottomSheet
        visible={regionSheet}
        onClose={() => setRegionSheet(false)}
        title="¿En qué comunidad estudias?"
        subtitle="Solo para ajustar el temario y las fechas a tu zona."
      >
        <ScrollView style={styles.regionList} showsVerticalScrollIndicator={false}>
          {REGIONS.map((item) => {
            const selected = region === item.code;
            return (
              <TouchableOpacity
                key={item.code}
                activeOpacity={0.8}
                onPress={() => {
                  setRegion(item.code);
                  setRegionSheet(false);
                  if (Platform.OS !== 'web') Haptics.selectionAsync();
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={styles.regionRow}
              >
                <Text style={[styles.regionLabel, selected && styles.regionLabelOn]}>
                  {item.label}
                </Text>
                {selected ? (
                  <Check size={18} color={tokens.colors.accent} strokeWidth={2.5} />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </BottomSheet>

      <BottomSheet
        visible={howSheet}
        onClose={() => setHowSheet(false)}
        title="¿Cómo se calcula?"
        subtitle="Es una estimación, no una promesa."
      >
        <Text style={styles.sheetBody}>
          Partimos de tu nota actual y de lo que nos has contado sobre cómo repasas y cómo llevas
          tus tareas. Cuanto menos ordenado sea tu método hoy, más margen hay por ganar
          organizándolo; y cuanto más alta sea ya tu nota, menos espacio queda por delante.
          {'\n\n'}
          El resultado es un rango, no un número, porque depende de lo que hagas a partir de ahora.
          Si no completas las sesiones del plan, el número no significa nada.
          {'\n\n'}
          Estos pesos son una primera versión, todavía sin calibrar contra resultados reales.
        </Text>
      </BottomSheet>

      {/* Last in the tree so they paint over the header and the footer: neither
          gets a progress bar, a back arrow or a "Siguiente". */}
      {/* Above the step content, not instead of it: the questions mount
          underneath while this plays, so the first frame after it leaves is
          already laid out rather than still measuring. */}
      {intro ? <OnboardingIntro onDone={() => setIntro(false)} /> : null}

      {calculating ? (
        <OnboardingCalc
          onDone={afterCalc}
          subjectCount={subjects.length}
          // "Bachillerato · Ciencias" rather than either half alone: the branch
          // is what makes the line specific to them.
          levelLabel={
            educationLevel === 'Bachillerato' && courseYear
              ? `${courseYear}º de Bachillerato`
              : educationLevel
          }
        />
      ) : null}

      {paywall ? (
        <OnboardingPaywall
          target={formatGrade(estimate.range[1])}
          // The strip at the top of the paywall continues the card they were
          // just reading, so it needs the same three numbers.
          current={Number.isNaN(gradeValue) ? null : formatGrade(gradeValue)}
          range={[formatGrade(estimate.range[0]), formatGrade(estimate.range[1])]}
          onContinueFree={afterPaywall}
          onPurchased={afterPaywall}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.background },
  flex: { flex: 1 },
  centred: { alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progress: { flex: 1, gap: 6, paddingRight: 12 },
  progressTrack: {
    height: 4,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surfaceHover,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accent,
  },
  progressText: { fontFamily: font.medium, fontSize: 12, color: tokens.colors.textSecondary },

  content: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.borderDefault,
  },

  sourceBlock: {
    marginTop: 28,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.borderDefault,
  },
  sourceTitle: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: tokens.colors.textPrimary,
  },
  sourceLead: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.textDisabled,
    marginTop: 2,
    marginBottom: 12,
  },
  sourceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sourceChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.surfaceCard,
  },
  sourceChipOn: {
    borderColor: tokens.colors.accentSoftBorder,
    backgroundColor: tokens.colors.accentSoftBg,
  },
  sourceChipText: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
  sourceChipTextOn: {
    color: tokens.colors.accentSoftText,
  },
  title: { fontFamily: font.bold, fontSize: 24, color: tokens.colors.textPrimary, marginBottom: 6 },
  lead: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 21,
    color: tokens.colors.textSecondary,
    marginBottom: 20,
  },
  fieldLabel: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
    marginTop: 20,
    marginBottom: 8,
  },
  hint: {
    fontFamily: font.regular,
    fontSize: 12,
    color: tokens.colors.textDisabled,
    marginTop: 10,
  },
  error: { fontFamily: font.medium, fontSize: 13, color: tokens.colors.danger, marginTop: 8 },
  warning: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.premiumText,
    marginTop: 16,
  },
  ok: { fontFamily: font.regular, fontSize: 13, color: tokens.colors.trendUp, marginTop: 16 },
  link: { fontFamily: font.semibold, fontSize: 15, color: tokens.colors.accent },

  // Nineteen communities are too many for pills, so the field opens a sheet.
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.btn,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
  },
  selectOn: { borderColor: tokens.colors.accent },
  selectValue: { fontFamily: font.medium, fontSize: 15, color: tokens.colors.textPrimary },
  selectPlaceholder: {
    fontFamily: font.regular,
    fontSize: 15,
    color: tokens.colors.textDisabled,
  },
  // Capped so the sheet scrolls its own list instead of growing past the
  // screen on the shorter phones.
  regionList: { marginTop: 12, maxHeight: 380 },
  regionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderDefault,
  },
  regionLabel: { fontFamily: font.regular, fontSize: 15, color: tokens.colors.textPrimary },
  regionLabelOn: { fontFamily: font.semibold, color: tokens.colors.accent },

  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // The opt-out. Deliberately not a Button and not accent-coloured: it is a
  // way out, not an alternative action, and giving it the same weight as
  // "Siguiente" would turn one clear task into two competing ones.
  optOut: {
    marginTop: 28,
    paddingVertical: 12,
    alignItems: 'center',
  },
  optOutText: {
    fontFamily: font.medium,
    fontSize: 14,
    color: tokens.colors.textSecondary,
    textDecorationLine: 'underline',
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
  },
  pillOn: { backgroundColor: tokens.colors.accentSoftBg, borderColor: tokens.colors.accent },
  pillText: { fontFamily: font.medium, fontSize: 14, color: tokens.colors.textSecondary },
  pillTextOn: { fontFamily: font.semibold, color: tokens.colors.accent },

  choices: { gap: 10, marginTop: 4 },
  choice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
  },
  choiceOn: { borderColor: tokens.colors.accent, backgroundColor: tokens.colors.accentSoftBg },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: tokens.colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioOn: { backgroundColor: tokens.colors.accent, borderColor: tokens.colors.accent },
  checkbox: { borderRadius: 5 },
  pauToggle: { marginTop: 12 },
  choiceLabel: { fontFamily: font.medium, fontSize: 15, color: tokens.colors.textPrimary },
  choiceDesc: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 18,
    color: tokens.colors.textSecondary,
    marginTop: 3,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accentSoftBg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  addRow: { flexDirection: 'row', gap: 8 },
  addInput: {
    flex: 1,
    minWidth: 0,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.btn,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    fontFamily: font.regular,
    fontSize: 15,
    color: tokens.colors.textPrimary,
  },
  addButton: {
    width: 46,
    height: 46,
    borderRadius: tokens.radius.btn,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    backgroundColor: tokens.colors.surfaceCard,
  },
  chipDot: { width: 9, height: 9, borderRadius: 5 },
  chipText: { fontFamily: font.medium, fontSize: 14, color: tokens.colors.textPrimary },
  palette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    padding: 10,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
  },
  paletteDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paletteDotOn: { borderColor: tokens.colors.textPrimary },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: tokens.colors.borderDefault,
  },
  suggestionText: { fontFamily: font.regular, fontSize: 13, color: tokens.colors.textSecondary },

  estimateLabel: {
    fontFamily: font.medium,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: tokens.colors.textSecondary,
  },
  estimateNow: {
    fontFamily: tokens.typography.families.display,
    fontSize: 40,
    letterSpacing: 0.5,
    color: tokens.colors.textPrimary,
    marginTop: 2,
  },
  estimateRange: {
    fontFamily: tokens.typography.families.display,
    fontSize: 40,
    letterSpacing: 0.5,
    color: tokens.colors.accent,
    marginTop: 2,
  },
  divider: { height: 1, backgroundColor: tokens.colors.borderDefault, marginVertical: 16 },
  reasons: { gap: 10, marginTop: 20 },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  reasonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.accent,
    marginTop: 7,
  },
  reasonText: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: tokens.colors.textSecondary,
  },
  sheetBody: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 21,
    color: tokens.colors.textSecondary,
    marginTop: 16,
  },
});
