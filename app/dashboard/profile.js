import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'expo-router';
import {
  Star,
  Settings as Gear,
  Pencil,
  Plus,
  Trash2,
  FileText,
  TrendingUp,
  Check,
  X,
  User as UserIcon,
  BadgeCheck,
  ChevronRight,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  runOnJS,
  LinearTransition,
  FadeInDown,
  Easing,
} from 'react-native-reanimated';
import PrimeLimitSheet from '../../components/PrimeLimitSheet';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { tokens } from '../../theme/tokens';
import useAuthStore from '../../store/authStore';
import useUserStore from '../../store/userStore';
import usePrimeIntentStore, { PRIME_INTENTS } from '../../store/primeIntentStore';
import {
  calculateXpForLevel,
  calculateXpForNextLevel,
  BADGES,
  getIcon,
} from '../../services/gamification';
import { softBg } from '../../utils/color';
import { buildAnalysis } from '../../services/productivityService';
import { getUpcomingExams } from '../../services/exams';
import { EDUCATION_LEVELS, REGIONS, regionLabelFor } from '../../services/onboarding';
import { getSubjectColors } from '../../services/permissions';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import Slider from '@react-native-community/slider';
import BottomSheet from '../../components/ui/BottomSheet';
import SectionTitle from '../../components/ui/SectionTitle';

const font = tokens.typography.families.inter;

const SUBJECT_FALLBACK_COLOR = tokens.colors.textDisabled;

const SWIPE_REVEAL = 88;
const SWIPE_COMMIT = 56;

const initialOf = (name) => (name || '?').charAt(0).toUpperCase();

/** Una nota, con un decimal y coma — como se escribe en español. */
const formatGrade = (value) => Number(value).toFixed(1).replace('.', ',');

/**
 * La nota objetivo, de 5 a 10 y sin decimales a propósito: un objetivo es una
 * intención, no una predicción. La etiqueta es lo que hace que el número
 * signifique algo — un 8 suelto no dice nada, "Notable" sí.
 */
const TARGET_MIN = 5;
const TARGET_MAX = 10;
const TARGET_LABELS = {
  5: 'Aprobar',
  6: 'Aprobar holgado',
  7: 'Buena nota',
  8: 'Notable',
  9: 'Sobresaliente',
  10: 'Matrícula',
};

/**
 * Tres niveles en vez del campo numérico de antes, que no validaba nada (cabía
 * un 99) y pedía distinguir un 6 de un 7 en tu propia asignatura, que nadie
 * sabe hacer.
 *
 * Se siguen guardando como número dentro de la escala 1-10 que ya usa
 * `normalizeDifficulty` en services/priority.js — así el algoritmo no se toca
 * y las materias que ya tengan cualquier valor del 1 al 10 siguen valiendo:
 * el selector solo marca el nivel más cercano.
 */
const DIFFICULTY_LEVELS = [
  { label: 'Fácil', value: 3 },
  { label: 'Normal', value: 5 },
  { label: 'Difícil', value: 8 },
];
const difficultyLevelOf = (value) => {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return 5;
  if (raw <= 4) return 3;
  if (raw <= 6) return 5;
  return 8;
};

const formatNoteDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date
    .toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase()
    .replace(/\./g, '');
};

// ── Pieces ──────────────────────────────────────────────────────────────────

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
 * Una materia en la cuadrícula.
 *
 * Antes enseñaba la media y nada más — un número suelto, que no dice si vas
 * bien. Ahora enseña una **distancia**: dónde estás y dónde quieres llegar,
 * con la barra entre las dos. Un 6,8 no significa lo mismo para quien va a por
 * un 7 que para quien va a por matrícula.
 *
 * El tic de "objetivo alcanzado" es verde y va en la esquina, no en el color
 * de la materia: Química ya es verde, así que el color no puede ser la señal.
 */
/**
 * Ancho de una ficha de materia.
 *
 * Se calcula en pixeles en vez de dejarlo en `width: '48%'` + `flexGrow`, que
 * es lo que habia y salia mal: las fichas se repartian de tres en tres y tan
 * estrechas que no cabia ni el nombre. Con `flexWrap` un porcentaje solo
 * decide en que linea cae cada elemento, y el `flexGrow` volvia a repartir
 * despues el sobrante entre las que hubieran entrado.
 *
 * `body` en esta pantalla tiene 20 de padding a cada lado y la cuadricula 12
 * de hueco, asi que dos columnas salen de restar eso y partir por dos. Es
 * aritmetica cerrada: no depende de que el padre resuelva un porcentaje.
 */
const BODY_PADDING = 20;
const SUBJECT_GRID_GAP = 12;
export const subjectTileWidth = (screenWidth) =>
  (screenWidth - BODY_PADDING * 2 - SUBJECT_GRID_GAP) / 2;

function SubjectTile({ subject, onPress, index = 0, width }) {
  const color = subject.color || SUBJECT_FALLBACK_COLOR;
  const average = Number(subject.average);
  const hasAverage = Number.isFinite(average) && average > 0;
  const target = Number(subject.targetGrade);
  const hasTarget = Number.isFinite(target) && target > 0;
  const reached = hasTarget && hasAverage && average >= target;
  const progress = hasTarget && hasAverage ? Math.min(100, (average / target) * 100) : 0;

  return (
    // Staggered rather than all at once: the grid used to appear as a single
    // block, which reads as a screenshot instead of a screen being built.
    // Capped at 6 so a student with twenty subjects isn't waiting on a queue.
    <Animated.View
      style={{ width }}
      entering={FadeInDown.duration(320).delay(Math.min(index, 6) * 45)}
    >
      <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.subjectTile}>
        {reached ? (
          <View style={styles.subjectReached}>
            <Check size={12} color={tokens.colors.background} strokeWidth={3} />
          </View>
        ) : null}

        <View style={[styles.subjectAvatar, { backgroundColor: color }]}>
          <Text style={styles.subjectInitial}>{initialOf(subject.name)}</Text>
        </View>

        <Text style={styles.subjectName} numberOfLines={2}>
          {subject.name}
        </Text>

        {!hasAverage ? (
          <>
            <Text style={styles.subjectGrade}>—</Text>
            <Text style={styles.subjectHint}>Sin notas todavía</Text>
          </>
        ) : hasTarget ? (
          <>
            <View style={styles.subjectGradeRow}>
              <Text style={styles.subjectGrade}>{formatGrade(average)}</Text>
              <Text style={styles.subjectArrow}>→</Text>
              <Text style={styles.subjectTarget}>{target}</Text>
            </View>
            <View style={styles.subjectBar}>
              <View
                style={[
                  styles.subjectBarFill,
                  {
                    width: `${progress}%`,
                    backgroundColor: reached ? tokens.colors.success : color,
                  },
                ]}
              />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.subjectGrade}>{formatGrade(average)}</Text>
            <Text style={styles.subjectHint}>Sin objetivo</Text>
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

/** Row that slides left to reveal a delete action. */
function SwipeToDelete({ onDelete, children }) {
  const dx = useSharedValue(0);

  const pan = Gesture.Pan()
    // Only claim the gesture once it's clearly horizontal, so the sheet's own
    // scroll keeps its vertical drag.
    .activeOffsetX([-14, 14])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      dx.value = Math.min(0, Math.max(event.translationX, -SWIPE_REVEAL));
    })
    .onEnd(() => {
      if (dx.value < -SWIPE_COMMIT) {
        dx.value = withTiming(-400, { duration: 180 }, (finished) => {
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

function NoteRow({ note, last, onDelete, onEdit }) {
  return (
    <View style={[styles.noteRow, last && { borderBottomWidth: 0 }]}>
      <TouchableOpacity
        style={styles.noteBody}
        activeOpacity={0.7}
        onLongPress={onEdit}
        delayLongPress={400}
        accessibilityRole="button"
        accessibilityHint="Mantén pulsado para editar el apunte"
      >
        <Text style={styles.noteText}>{note.content}</Text>
        <Text style={styles.noteDate}>{formatNoteDate(note.createdAt)}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onDelete}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Eliminar apunte"
        style={styles.noteDelete}
      >
        <Trash2 size={18} color={tokens.colors.danger} />
      </TouchableOpacity>
    </View>
  );
}

/**
 * The XP bar, filling to its value instead of arriving at it.
 *
 * Same reasoning as the XP counter on the session summary: a bar that is
 * simply *there* reads as a static fact, one that fills reads as progress the
 * student made. Runs once on mount and then follows any later change.
 */
function LevelFill({ percent }) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withDelay(
      160,
      withTiming(percent, { duration: 780, easing: Easing.out(Easing.cubic) })
    );
  }, [percent, width]);

  const style = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return <Animated.View style={[styles.levelFill, style]} />;
}

/**
 * Earned badges, as a strip under the level card.
 *
 * Deliberately not folded into the level card itself — that one already holds
 * the level number, the title, the XP, a progress bar and two labels, and this
 * would be the seventh thing in it. It's also read-only on purpose: the detail
 * (including what's still locked and how to get it) already exists in
 * `ranks.js`, so this points there instead of becoming a second badge screen.
 */
function BadgeStrip({ unlockedIds, onPress }) {
  const unlocked = BADGES.filter((badge) => unlockedIds.includes(badge.id));

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Insignias: ${unlocked.length} de ${BADGES.length}`}
    >
      <Card padding={16}>
        <View style={styles.badgeStripHead}>
          <Text style={styles.badgeStripTitle}>Insignias</Text>
          <Text style={styles.badgeStripCount}>
            {unlocked.length} de {BADGES.length}
          </Text>
        </View>

        {unlocked.length === 0 ? (
          <Text style={styles.badgeStripEmpty}>
            Aún no tienes ninguna. Estudia un rato y caerá la primera.
          </Text>
        ) : (
          <View style={styles.badgeStripRow}>
            {unlocked.map((badge) => {
              const Icon = getIcon(badge.icon);
              return (
                <View
                  key={badge.id}
                  style={[styles.badgeStripIcon, { backgroundColor: softBg(badge.color) }]}
                >
                  <Icon size={18} color={badge.color} fill={badge.color} strokeWidth={1.75} />
                </View>
              );
            })}
          </View>
        )}
      </Card>
    </TouchableOpacity>
  );
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const tileWidth = subjectTileWidth(screenWidth);
  const user = useAuthStore((state) => state.user);
  const isPrime = useAuthStore((state) => state.isPrime);
  // Prime's 20-subject cap needs more than the free eight tones, or two
  // materias would end up sharing a colour — see services/permissions.js.
  const subjectPalette = useMemo(() => getSubjectColors({ isPrime }), [isPrime]);

  // One selector per key rather than destructuring the store: destructuring
  // subscribed this screen — the biggest in the app — to every write, so it
  // redrew whenever anything at all changed. Action references are stable.
  const profile = useUserStore((state) => state.profile);
  const gamification = useUserStore((state) => state.gamification);
  const subjects = useUserStore((state) => state.subjects);
  const maxSubjects = useUserStore((state) => state.maxSubjects());
  const sessionHistory = useUserStore((state) => state.sessionHistory);

  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [exams, setExams] = useState([]);

  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);

  const [noteSheet, setNoteSheet] = useState(false);
  const [academicSheet, setAcademicSheet] = useState(false);
  // Two views in one sheet, the same shape QuickActionsModal uses: the region
  // list is 19 rows and would bury the course pills if both were on screen.
  const [academicView, setAcademicView] = useState('main');
  const [draftCourse, setDraftCourse] = useState(null);
  const [draftRegion, setDraftRegion] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [editingNote, setEditingNote] = useState(null);
  const [savingNote, setSavingNote] = useState(false);

  const [subjectSheet, setSubjectSheet] = useState(false);
  const [subjectLimitSheet, setSubjectLimitSheet] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [editSubName, setEditSubName] = useState('');
  // Número dentro de la escala 1-10 de services/priority.js, no un índice de
  // los tres niveles — ver DIFFICULTY_LEVELS.
  const [editSubDifficulty, setEditSubDifficulty] = useState(5);
  // `null` es un valor con significado: "sin objetivo puesto". El algoritmo
  // distingue eso de un objetivo bajo (riskFactor cae a su rama de antes).
  const [editSubTarget, setEditSubTarget] = useState(null);
  const [editSubColor, setEditSubColor] = useState(subjectPalette[0]);
  const [subjectExams, setSubjectExams] = useState([]);
  const [editingExamId, setEditingExamId] = useState(null);
  const [tempGrade, setTempGrade] = useState('');
  // El peso se editaba solo al crear la nota (QuickActionsModal / GradeModal) y
  // luego ya no se podía tocar, aunque es lo que decide cuánto pesa cada nota
  // en la media que se enseña arriba.
  const [tempWeight, setTempWeight] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reopens the subject form after a Prime purchase that was triggered by
  // hitting the subject cap. The form's own state is untouched — this screen
  // is a mounted tab — so whatever they had typed before the limit
  // interrupted them is still in the fields.
  //
  // Keyed off the store rather than focus: the intent is only fulfilled as the
  // paywall leaves (see app/plus.js), so this runs while it is dismissing —
  // the sheet is in place by the time the student can see this screen again.
  const primeReason = usePrimeIntentStore((state) => state.reason);
  const primeFulfilled = usePrimeIntentStore((state) => state.fulfilled);
  useEffect(() => {
    if (primeReason === PRIME_INTENTS.SUBJECTS && primeFulfilled) {
      usePrimeIntentStore.getState().clearIntent();
      setSubjectSheet(true);
    }
  }, [primeReason, primeFulfilled]);

  // ── Derived ──

  const level = gamification?.level || 1;
  const xp = gamification?.xp || 0;

  // The XP curve is quadratic (xp = level² × 100), so the old `xp % 1000`
  // arithmetic here was simply wrong — it showed a bar against a level width
  // that does not exist. These are the same helpers the home screen uses.
  const levelFloor = calculateXpForLevel(level);
  const levelCeiling = calculateXpForNextLevel(level);
  const levelSpan = Math.max(1, levelCeiling - levelFloor);
  const xpIntoLevel = Math.max(0, xp - levelFloor);
  const levelPercent = Math.min(100, Math.round((xpIntoLevel / levelSpan) * 100));

  /**
   * Everything here comes out of services/productivityService, which until now
   * no screen imported: the profile showed three hand-written sentences with
   * invented percentages in its place.
   */
  // Only `headline` is read here now — the rest is rendered by
  // app/dashboard/analysis.js, off this same shared builder.
  const analysis = useMemo(
    () => buildAnalysis({ sessions: sessionHistory || [], subjects, exams }),
    [sessionHistory, subjects, exams]
  );

  // ── Data loading ──

  const loadNotes = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const { db } = await import('../../services/firebase');
      const { collection, getDocs, orderBy, query } = await import('firebase/firestore');
      const q = query(collection(db, 'users', user.uid, 'notes'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.warn('Could not load notes', e);
    } finally {
      setNotesLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    useUserStore.getState().loadUserData(user.uid);
    useUserStore.getState().updateAverageGrade(user.uid);
    if ((sessionHistory || []).length === 0) {
      useUserStore.getState().loadSessionHistory(user.uid);
    }
    loadNotes();
    // Exams feed the subject health and the overload risk. A failure here must
    // not take the screen down with it.
    getUpcomingExams(user.uid, 30)
      .then(setExams)
      .catch((error) => console.warn('Could not load exams for the analysis', error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, loadNotes]);

  useEffect(() => {
    if (profile?.displayName) setNewName(profile.displayName);
  }, [profile?.displayName]);

  useEffect(() => {
    if (!selectedSubject || !user?.uid) return;
    let cancelled = false;
    import('../../services/exams')
      .then(({ getCompletedExams }) => getCompletedExams(user.uid, 50))
      .then((all) => {
        if (!cancelled) setSubjectExams(all.filter((e) => e.subjectId === selectedSubject.id));
      })
      .catch((error) => console.warn('Could not load subject exams', error));
    return () => {
      cancelled = true;
    };
  }, [selectedSubject, user?.uid]);

  // ── Handlers ──

  const saveName = async () => {
    if (!newName.trim() || !user?.uid) return;
    await useUserStore.getState().updateProfile(user.uid, { displayName: newName.trim() });
    setIsEditingName(false);
  };

  const openAcademic = () => {
    setDraftCourse(profile?.course || null);
    setDraftRegion(profile?.region || null);
    setAcademicView('main');
    setAcademicSheet(true);
  };

  // Nota media a propósito fuera: se recalcula sola con las notas de los
  // exámenes (`updateAverageGrade`), así que un campo editable aquí sería un
  // valor que la app pisa en cuanto el alumno califica el siguiente examen.
  const saveAcademic = async () => {
    if (!user?.uid) return;
    await useUserStore.getState().updateProfile(user.uid, {
      course: draftCourse || null,
      region: draftRegion || null,
    });
    setAcademicSheet(false);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled && user?.uid) {
      useUserStore.getState().setUserPhoto(user.uid, result.assets[0].uri);
    }
  };

  const openSubject = (subject) => {
    setSelectedSubject(subject);
    setEditSubName(subject?.name ?? '');
    setEditSubDifficulty(difficultyLevelOf(subject?.difficulty));
    setEditSubTarget(
      Number.isFinite(Number(subject?.targetGrade)) && Number(subject?.targetGrade) > 0
        ? Number(subject.targetGrade)
        : null
    );
    // A subject created before the palette existed keeps whatever colour it
    // has; the picker just doesn't show any of the swatches as selected.
    setEditSubColor(subject?.color ?? subjectPalette[0]);
    setSubjectExams([]);
    setEditingExamId(null);
    setSubjectSheet(true);
  };

  const saveSubject = async () => {
    if (!editSubName.trim() || !user?.uid) return;
    const difficulty = Number(editSubDifficulty) || 5;
    try {
      const fields = {
        name: editSubName.trim(),
        difficulty,
        color: editSubColor,
        // `null` y no borrar el campo: es lo que lee `riskFactor` para decidir
        // si mide la distancia al objetivo o vuelve a su comportamiento de
        // antes, y quitar un objetivo tiene que poder deshacer eso.
        targetGrade: editSubTarget,
      };
      if (selectedSubject) {
        await useUserStore.getState().editSubject(user.uid, selectedSubject.id, fields);
      } else {
        await useUserStore.getState().addSubject(user.uid, fields);
      }
      setSubjectSheet(false);
    } catch (error) {
      if (error.code === 'SUBJECT_LIMIT_REACHED') {
        setSubjectSheet(false);
        if (isPrime) {
          // Prime's own cap (20) is an anti-abuse ceiling, not a marketing
          // moment — a plain alert, no upsell.
          Alert.alert(
            'Límite de materias alcanzado',
            `Has llegado al máximo de ${maxSubjects} materias.`
          );
        } else {
          setSubjectLimitSheet(true);
        }
        return;
      }
      console.error('[Profile] Error saving subject:', error);
      Alert.alert('Error', 'No se pudo guardar la materia.');
    }
  };

  const saveExamGrade = async (examId) => {
    if (!user?.uid || !tempGrade.trim()) return;
    // Un peso vacío no es cero: es "déjalo como estaba". Guardarlo como 0
    // sacaría la nota de la media sin que nadie lo pidiera.
    const parsedWeight = parseFloat(tempWeight.replace(',', '.'));
    const weight = Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : null;
    try {
      const fields = weight === null ? { grade: tempGrade } : { grade: tempGrade, weight };
      await useUserStore.getState().updateExam(user.uid, examId, fields);
      setSubjectExams((prev) => prev.map((e) => (e.id === examId ? { ...e, ...fields } : e)));
      setEditingExamId(null);
      setTempGrade('');
      setTempWeight('');
    } catch {
      Alert.alert('Error', 'No se pudo actualizar la nota.');
    }
  };

  const deleteSubject = async () => {
    if (!selectedSubject || !user?.uid) return;
    setIsDeleting(true);
    try {
      await useUserStore.getState().removeSubject(user.uid, selectedSubject.id);
      setConfirmDeleteOpen(false);
      setSubjectSheet(false);
      setSelectedSubject(null);
    } catch {
      Alert.alert('Error', 'No se pudo eliminar la materia.');
    } finally {
      setIsDeleting(false);
    }
  };

  const openNoteSheet = (note = null) => {
    setEditingNote(note);
    setNoteDraft(note?.content ?? '');
    setNoteSheet(true);
  };

  const saveNote = async () => {
    const content = noteDraft.trim();
    if (!content || !user?.uid) return;
    setSavingNote(true);
    try {
      if (editingNote) {
        await useUserStore.getState().updateQuickNote(user.uid, editingNote.id, content);
      } else {
        await useUserStore.getState().addQuickNote(user.uid, content);
      }
      setNoteDraft('');
      setEditingNote(null);
      setNoteSheet(false);
      await loadNotes();
    } catch {
      Alert.alert('Error', 'No se pudo guardar el apunte.');
    } finally {
      setSavingNote(false);
    }
  };

  const deleteExamFromHistory = async (exam) => {
    if (!user?.uid) return;
    // Optimistic: the row has already slid away by the time this runs.
    setSubjectExams((prev) => prev.filter((e) => e.id !== exam.id));
    try {
      const { deleteExam } = await import('../../services/exams');
      await deleteExam(exam.id);
      // The exam carried a grade, so the subject average and anything derived
      // from the exam list have to be rebuilt.
      await useUserStore.getState().updateAverageGrade(user.uid);
      useUserStore.getState().triggerExamRefresh();
    } catch {
      setSubjectExams((prev) =>
        [...prev, exam].sort((a, b) => new Date(b.date) - new Date(a.date))
      );
      Alert.alert('Error', 'No se pudo eliminar el examen.');
    }
  };

  const deleteNote = async (noteId) => {
    if (!user?.uid) return;
    try {
      const { db } = await import('../../services/firebase');
      const { doc, deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'users', user.uid, 'notes', noteId));
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch {
      Alert.alert('Error', 'No se pudo eliminar el apunte.');
    }
  };

  // ── Render ──

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity activeOpacity={0.8} onPress={pickImage} style={styles.avatarWrap}>
            {profile?.photoURL ? (
              <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarEmpty]}>
                <UserIcon size={30} color={tokens.colors.textSecondary} />
              </View>
            )}
            <View style={styles.avatarBadge}>
              <Pencil size={12} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          <View style={styles.headerBody}>
            {isEditingName ? (
              <View style={styles.nameEditRow}>
                <TextInput
                  style={styles.nameInput}
                  value={newName}
                  onChangeText={setNewName}
                  autoFocus
                  placeholder="Tu nombre"
                  placeholderTextColor={tokens.colors.textDisabled}
                  onSubmitEditing={saveName}
                />
                <TouchableOpacity
                  onPress={saveName}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Check size={20} color={tokens.colors.accent} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setIsEditingName(true)}
                style={styles.nameRow}
              >
                <Text style={styles.userName} numberOfLines={1}>
                  {profile?.displayName || 'Usuario'}
                </Text>
                {isPrime ? (
                  <BadgeCheck
                    size={17}
                    color={tokens.colors.premiumText}
                    fill={tokens.colors.premiumBg}
                    strokeWidth={2}
                    accessibilityLabel="Cuenta Prime"
                  />
                ) : null}
                <Pencil size={16} color={tokens.colors.textSecondary} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/dashboard/ranks')}
              style={styles.rankPill}
            >
              <Star size={13} color={tokens.colors.accent} fill={tokens.colors.accent} />
              <Text style={styles.rankText}>{gamification?.rank || 'Novato'}</Text>
            </TouchableOpacity>
          </View>

          {/* The settings screen existed but nothing in the app linked to it,
              which meant there was no way to log out. */}
          <IconButton onPress={() => router.push('/settings')} accessibilityLabel="Ajustes">
            <Gear size={18} color={tokens.colors.textSecondary} />
          </IconButton>
        </View>

        <View style={styles.body}>
          {/* Level — same rank ladder the header pill opens. */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/dashboard/ranks')}
            accessibilityRole="button"
            accessibilityLabel="Ver rango del estudiante"
          >
            <Card padding={20}>
              <View style={styles.levelRow}>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelNumber}>{level}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.levelTitle}>Nivel del Estudiante</Text>
                  <Text style={styles.levelSub}>
                    <Text style={styles.levelXp}>{xp}</Text> XP acumulados
                  </Text>
                </View>
              </View>

              <View style={styles.levelTrack}>
                <LevelFill percent={levelPercent} />
              </View>
              <View style={styles.levelLabels}>
                <Text style={styles.levelLabel}>
                  {xpIntoLevel} / {levelSpan} XP
                </Text>
                <Text style={[styles.levelLabel, { color: tokens.colors.accent }]}>
                  {levelPercent}%
                </Text>
              </View>
            </Card>
          </TouchableOpacity>

          <BadgeStrip
            unlockedIds={gamification?.badges || []}
            onPress={() => router.push('/dashboard/ranks')}
          />

          {/* Potential — the estimate given at the end of onboarding, brought
              back here instead of being shown once and forgotten. Only
              accounts onboarded after this shipped have it. */}
          {profile?.estimatedRange ? (
            <View>
              <SectionTitle>Tu potencial</SectionTitle>
              <View style={styles.statsRow}>
                <StatTile
                  value={
                    profile.grade != null ? Number(profile.grade).toFixed(1).replace('.', ',') : '—'
                  }
                  label="Nota de partida"
                />
                {profile.averageGrade > 0 ? (
                  <StatTile value={profile.averageGrade} label="Ahora mismo" />
                ) : null}
                <StatTile
                  value={`${profile.estimatedRange[0].toFixed(1).replace('.', ',')}–${profile.estimatedRange[1]
                    .toFixed(1)
                    .replace('.', ',')}`}
                  label="Podrías llegar a"
                  accent
                />
              </View>

              {Array.isArray(profile.estimationReason) && profile.estimationReason.length > 0 ? (
                <View style={styles.reasons}>
                  {profile.estimationReason.map((reason) => (
                    <View key={reason} style={styles.reasonRow}>
                      <View style={styles.reasonDot} />
                      <Text style={styles.reasonText}>{reason}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Analysis */}
          <View>
            <SectionTitle>Análisis de Desempeño</SectionTitle>
            <Card padding={20}>
              <View style={styles.projectionHead}>
                <View style={styles.projectionIcon}>
                  <TrendingUp size={20} color={tokens.colors.trendUp} />
                </View>
                <Text style={styles.projectionTitle}>Proyección Académica</Text>
              </View>
              <Text style={styles.projectionBody}>{analysis.headline}</Text>
              <View style={styles.divider} />
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push('/dashboard/analysis')}
              >
                <Text style={styles.projectionLink}>Ver detalles completos →</Text>
              </TouchableOpacity>
            </Card>
          </View>

          {/* Subjects */}
          <View>
            <SectionTitle
              right={
                <IconButton onPress={() => openSubject(null)} accessibilityLabel="Añadir materia">
                  <Plus size={18} color={tokens.colors.textSecondary} />
                </IconButton>
              }
            >
              Mis Materias
            </SectionTitle>

            {subjects.length > 0 && (
              <Text style={styles.subjectsCounter}>
                {subjects.length} de {maxSubjects} materias
              </Text>
            )}

            {subjects.length === 0 ? (
              <Card padding={20}>
                <Text style={styles.emptyText}>
                  Aún no tienes materias. Añade las de tu curso y el plan empezará a organizarse
                  solo.
                </Text>
              </Card>
            ) : (
              <View style={styles.subjectsGrid}>
                {subjects.map((subject, index) => (
                  <SubjectTile
                    key={subject.id}
                    subject={subject}
                    index={index}
                    width={tileWidth}
                    onPress={() => openSubject(subject)}
                  />
                ))}
              </View>
            )}
          </View>

          {/* Course and region were answered once in onboarding and then locked
              away forever, even though both change (you pass a year, you move)
              and both steer the planner. Sits just above Notes now — pulled up
              from beside the level card, where it outranked sections students
              actually come back to. */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={openAcademic}
            accessibilityRole="button"
            accessibilityLabel="Editar tus datos académicos"
          >
            <Card padding={16}>
              <View style={styles.academicHead}>
                <Text style={styles.academicTitle}>Datos académicos</Text>
                <Pencil size={15} color={tokens.colors.textSecondary} />
              </View>
              <Text style={styles.academicValue}>
                {profile?.course || 'Sin curso'}
                {' · '}
                {regionLabelFor(profile?.region) || 'Sin comunidad'}
              </Text>
            </Card>
          </TouchableOpacity>

          {/* Notes */}
          <View>
            <SectionTitle
              right={
                <IconButton onPress={() => openNoteSheet()} accessibilityLabel="Nuevo apunte">
                  <FileText size={18} color={tokens.colors.textSecondary} />
                </IconButton>
              }
            >
              Mis Apuntes Rápidos
            </SectionTitle>

            <Card padding={16}>
              {notesLoading ? (
                <ActivityIndicator color={tokens.colors.textSecondary} />
              ) : notes.length === 0 ? (
                // The section used to return null when empty, so it simply
                // vanished and the button to create one was nowhere near it.
                <Text style={styles.emptyText}>
                  Nada apuntado todavía. Usa el botón de arriba para guardar una idea rápida.
                </Text>
              ) : (
                notes.map((note, index) => (
                  <NoteRow
                    key={note.id}
                    note={note}
                    last={index === notes.length - 1}
                    onDelete={() => deleteNote(note.id)}
                    onEdit={() => openNoteSheet(note)}
                  />
                ))
              )}
            </Card>
          </View>
        </View>
      </ScrollView>

      {/* ── Academic data ── */}
      <BottomSheet
        visible={academicSheet}
        onClose={() => setAcademicSheet(false)}
        title={academicView === 'region' ? '¿En qué comunidad estudias?' : 'Datos académicos'}
        subtitle={
          academicView === 'region'
            ? 'El temario cambia según la comunidad.'
            : 'Tu plan se recalcula con lo que elijas aquí.'
        }
      >
        {academicView === 'region' ? (
          <View>
            {REGIONS.map((item) => {
              const selected = draftRegion === item.code;
              return (
                <TouchableOpacity
                  key={item.code}
                  activeOpacity={0.8}
                  onPress={() => {
                    setDraftRegion(item.code);
                    setAcademicView('main');
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
          </View>
        ) : (
          <View style={{ gap: 22 }}>
            <View>
              <Text style={styles.academicFieldLabel}>Curso</Text>
              <View style={styles.pillWrap}>
                {EDUCATION_LEVELS.map((level) => {
                  const selected = draftCourse === level;
                  return (
                    <TouchableOpacity
                      key={level}
                      activeOpacity={0.8}
                      onPress={() => setDraftCourse(level)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      style={[styles.pill, selected && styles.pillOn]}
                    >
                      <Text style={[styles.pillText, selected && styles.pillTextOn]}>{level}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={styles.academicFieldLabel}>Comunidad</Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setAcademicView('region')}
                accessibilityRole="button"
                style={styles.select}
              >
                <Text style={draftRegion ? styles.selectValue : styles.selectPlaceholder}>
                  {regionLabelFor(draftRegion) || 'Elígela en la lista'}
                </Text>
                <ChevronRight size={18} color={tokens.colors.textSecondary} strokeWidth={1.75} />
              </TouchableOpacity>
            </View>

            {/* Nota media no está aquí a propósito: la calcula la app a partir
                de las notas de los exámenes, así que un campo editable sería
                un valor que se pisa solo. */}
            <Text style={styles.academicNote}>
              Tu nota media no se edita: se calcula sola con las notas que vas poniendo a tus
              exámenes.
            </Text>

            <Button title="Guardar" fullWidth onPress={saveAcademic} />
          </View>
        )}
      </BottomSheet>

      {/* ── New note ── */}
      <BottomSheet
        visible={noteSheet}
        onClose={() => {
          setNoteSheet(false);
          setEditingNote(null);
        }}
        title={editingNote ? 'Editar apunte' : 'Nuevo apunte'}
      >
        <TextInput
          style={styles.noteInput}
          placeholder="Algo que no quieres olvidar…"
          placeholderTextColor={tokens.colors.textDisabled}
          value={noteDraft}
          onChangeText={setNoteDraft}
          multiline
          autoFocus
        />
        <View style={{ marginTop: 20 }}>
          <Button
            title={editingNote ? 'Guardar cambios' : 'Guardar apunte'}
            fullWidth
            loading={savingNote}
            disabled={!noteDraft.trim()}
            onPress={saveNote}
          />
        </View>
      </BottomSheet>

      {/* ── Subject ── */}
      <BottomSheet
        visible={subjectSheet}
        onClose={() => setSubjectSheet(false)}
        title={selectedSubject ? 'Gestionar materia' : 'Nueva materia'}
      >
        <Text style={styles.fieldLabel}>Nombre</Text>
        <TextInput
          style={styles.input}
          value={editSubName}
          onChangeText={setEditSubName}
          placeholder="Ej. Matemáticas"
          placeholderTextColor={tokens.colors.textDisabled}
        />

        {/* La nota que quieres sacar. Un deslizador y no botones porque son
            seis valores (5 a 10) y en una fila de botones no caben legibles.
            Sin decimales: un objetivo es una intención, no una predicción. */}
        <Text style={styles.fieldLabel}>Nota que quieres sacar</Text>
        <View style={styles.targetHead}>
          <Text style={styles.targetValue}>{editSubTarget ?? '—'}</Text>
          <Text style={styles.targetLabel}>
            {editSubTarget ? TARGET_LABELS[editSubTarget] : 'sin objetivo'}
          </Text>
          {editSubTarget ? (
            <TouchableOpacity onPress={() => setEditSubTarget(null)} accessibilityRole="button">
              <Text style={styles.targetClear}>quitar</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Slider
          minimumValue={TARGET_MIN}
          maximumValue={TARGET_MAX}
          step={1}
          value={editSubTarget ?? 7}
          onValueChange={(value) => setEditSubTarget(Math.round(value))}
          minimumTrackTintColor={tokens.colors.accent}
          maximumTrackTintColor={tokens.colors.surfaceHover}
          thumbTintColor={tokens.colors.accent}
          accessibilityLabel="Nota que quieres sacar"
        />
        <View style={styles.targetTicks}>
          {[5, 6, 7, 8, 9, 10].map((n) => (
            <Text key={n} style={styles.targetTick}>
              {n}
            </Text>
          ))}
        </View>
        {selectedSubject && Number(selectedSubject.average) > 0 ? (
          <Text style={styles.targetGap}>
            {editSubTarget
              ? Number(selectedSubject.average) >= editSubTarget
                ? 'Ya estás en tu objetivo.'
                : `Te faltan ${formatGrade(editSubTarget - Number(selectedSubject.average))} para llegar al ${editSubTarget}.`
              : `Tu media es ${formatGrade(selectedSubject.average)}, sin objetivo puesto.`}
          </Text>
        ) : null}
        <Text style={styles.targetHelp}>
          Cámbialo cuando quieras: en octubre nadie sabe lo que le va a costar una asignatura.
        </Text>

        {/* Tres niveles y no un 1-10: el campo numérico no validaba nada (cabía
            un 99) y nadie distingue un 6 de un 7 en su propia asignatura. Se
            guarda igual como número en la escala que ya usa el algoritmo. */}
        <Text style={styles.fieldLabel}>Dificultad</Text>
        <View style={styles.difficultyRow}>
          {DIFFICULTY_LEVELS.map((level) => {
            const active = editSubDifficulty === level.value;
            return (
              <TouchableOpacity
                key={level.value}
                onPress={() => setEditSubDifficulty(level.value)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.difficultyOption, active && styles.difficultyOptionOn]}
              >
                <Text style={[styles.difficultyText, active && styles.difficultyTextOn]}>
                  {level.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.targetHelp}>
          Ajusta cuántas sesiones te prepara el plan para sus exámenes.
        </Text>

        {/* A closed palette on purpose: these colours categorise subjects
            across the whole app, so a free colour wheel would let two subjects
            end up indistinguishable. Prime unlocks 12 more so its higher
            subject cap doesn't run out of them. */}
        <Text style={styles.fieldLabel}>Color</Text>
        <View style={styles.colorRow}>
          {subjectPalette.map((color) => {
            const active = color === editSubColor;
            return (
              <TouchableOpacity
                key={color}
                onPress={() => setEditSubColor(color)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.colorDot, { backgroundColor: color }, active && styles.colorDotOn]}
              >
                {active ? <Check size={15} color="#FFFFFF" strokeWidth={3} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>

        {selectedSubject ? (
          <>
            <View style={styles.divider} />
            <View style={styles.gradesHead}>
              <Text style={styles.gradesTitle}>Historial de notas</Text>
              <View style={styles.avgBadge}>
                <Text style={styles.avgBadgeText}>{selectedSubject.average || '—'}</Text>
              </View>
            </View>

            {subjectExams.length === 0 ? (
              <Text style={styles.emptyText}>No hay exámenes registrados aún.</Text>
            ) : (
              <>
                {subjectExams.map((exam) => (
                  <Animated.View key={exam.id} layout={LinearTransition.duration(200)}>
                    <SwipeToDelete onDelete={() => deleteExamFromHistory(exam)}>
                      <View style={styles.examRow}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.examName} numberOfLines={1}>
                            {exam.name}
                          </Text>
                          <Text style={styles.examDate}>
                            {new Date(exam.date).toLocaleDateString('es-ES', {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </Text>
                        </View>

                        {editingExamId === exam.id ? (
                          <View style={styles.examEdit}>
                            <TextInput
                              style={styles.gradeInput}
                              value={tempGrade}
                              onChangeText={setTempGrade}
                              keyboardType="numeric"
                              autoFocus
                              accessibilityLabel="Nota"
                            />
                            <TextInput
                              style={styles.weightInput}
                              value={tempWeight}
                              onChangeText={setTempWeight}
                              keyboardType="numeric"
                              placeholder="%"
                              placeholderTextColor={tokens.colors.textDisabled}
                              accessibilityLabel="Peso de la nota, en porcentaje"
                            />
                            <TouchableOpacity
                              onPress={() => saveExamGrade(exam.id)}
                              style={styles.examBtn}
                            >
                              <Check size={18} color={tokens.colors.trendUp} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => setEditingExamId(null)}
                              style={styles.examBtn}
                            >
                              <X size={18} color={tokens.colors.danger} />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.examGrade}
                            onPress={() => {
                              setEditingExamId(exam.id);
                              setTempGrade(String(exam.grade || ''));
                              setTempWeight(exam.weight ? String(exam.weight) : '');
                            }}
                          >
                            {exam.weight ? (
                              <Text style={styles.examWeight}>{exam.weight}%</Text>
                            ) : null}
                            <Text style={styles.examGradeText}>{exam.grade || '—'}</Text>
                            <Pencil size={12} color={tokens.colors.textSecondary} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </SwipeToDelete>
                  </Animated.View>
                ))}
                <Text style={styles.swipeHint}>
                  Desliza un examen a la izquierda para eliminarlo.
                </Text>
              </>
            )}
          </>
        ) : null}

        <View style={{ marginTop: 24 }}>
          <Button
            title="Guardar cambios"
            fullWidth
            disabled={!editSubName.trim()}
            onPress={saveSubject}
          />
        </View>

        {selectedSubject ? (
          <View style={{ marginTop: 10 }}>
            <Button
              title="Eliminar materia"
              variant="secondary"
              fullWidth
              textColor={tokens.colors.danger}
              onPress={() => setConfirmDeleteOpen(true)}
            />
          </View>
        ) : null}
      </BottomSheet>

      {/* ── Delete confirmation ── */}
      <BottomSheet
        visible={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="¿Eliminar materia?"
        subtitle={`Se borrará ${selectedSubject?.name || 'la materia'} y el progreso asociado. Esta acción no se puede deshacer.`}
      >
        <View style={styles.confirmActions}>
          <View style={{ flex: 1 }}>
            <Button
              title="Cancelar"
              variant="secondary"
              fullWidth
              onPress={() => setConfirmDeleteOpen(false)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title="Eliminar"
              variant="danger"
              fullWidth
              loading={isDeleting}
              onPress={deleteSubject}
            />
          </View>
        </View>
      </BottomSheet>

      <PrimeLimitSheet
        visible={subjectLimitSheet}
        onClose={() => setSubjectLimitSheet(false)}
        title={`Has alcanzado el límite de ${maxSubjects} materias`}
        description="Con Schedio Prime puedes añadir todas las materias que necesites y organizar tu curso completo en un solo lugar."
        onUpgrade={() => {
          setSubjectLimitSheet(false);
          // Remembers what they were doing, so the paywall can thank them for
          // the right thing and the sheet below can reopen after paying.
          usePrimeIntentStore.getState().startIntent(PRIME_INTENTS.SUBJECTS);
          router.push('/plus');
        }}
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
    paddingBottom: 40,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    paddingHorizontal: 20,
  },
  avatarWrap: {
    width: 64,
    height: 64,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: tokens.radius.pill,
  },
  avatarEmpty: {
    backgroundColor: tokens.colors.surfaceHover,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accent,
    borderWidth: 2,
    borderColor: tokens.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBody: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  userName: {
    fontFamily: font.bold,
    fontSize: 24,
    color: tokens.colors.textPrimary,
    flexShrink: 1,
  },
  nameInput: {
    flex: 1,
    fontFamily: font.bold,
    fontSize: 22,
    color: tokens.colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.accent,
    paddingVertical: 2,
  },
  rankPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accentSoftBg,
    borderWidth: 1,
    borderColor: tokens.colors.accentSoftBorder,
  },
  rankText: {
    fontFamily: font.semibold,
    fontSize: 13,
    color: tokens.colors.accentSoftText,
  },

  // Body
  body: {
    gap: 32,
    paddingHorizontal: 20,
    paddingTop: 24,
  },

  // Level card
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 18,
  },
  levelBadge: {
    width: 64,
    height: 64,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelNumber: {
    fontFamily: tokens.typography.families.display,
    fontSize: 38,
    letterSpacing: 0.5,
    color: '#FFFFFF',
  },
  levelTitle: {
    fontFamily: font.semibold,
    fontSize: 17,
    color: tokens.colors.textPrimary,
  },
  levelSub: {
    fontFamily: font.regular,
    fontSize: 14,
    color: tokens.colors.textSecondary,
    marginTop: 2,
  },
  levelXp: {
    fontFamily: tokens.typography.families.display,
    fontSize: 18,
    color: tokens.colors.textPrimary,
  },
  levelTrack: {
    height: 8,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surfaceHover,
    overflow: 'hidden',
  },
  levelFill: {
    height: '100%',
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accent,
  },
  levelLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  badgeStripHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  badgeStripTitle: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: tokens.colors.textPrimary,
  },
  badgeStripCount: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
  badgeStripRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badgeStripIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  academicHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  academicTitle: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: tokens.colors.textPrimary,
  },
  academicValue: {
    fontFamily: font.regular,
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
  academicNote: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.textDisabled,
  },
  academicFieldLabel: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
    marginBottom: 10,
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.surfaceCard,
  },
  pillOn: {
    borderColor: tokens.colors.accentSoftBorder,
    backgroundColor: tokens.colors.accentSoftBg,
  },
  pillText: {
    fontFamily: font.medium,
    fontSize: 14,
    color: tokens.colors.textPrimary,
  },
  pillTextOn: {
    color: tokens.colors.accentSoftText,
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: tokens.radius.card,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.surfaceCard,
  },
  selectValue: {
    fontFamily: font.medium,
    fontSize: 14,
    color: tokens.colors.textPrimary,
  },
  selectPlaceholder: {
    fontFamily: font.regular,
    fontSize: 14,
    color: tokens.colors.textDisabled,
  },
  regionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderDefault,
  },
  regionLabel: {
    fontFamily: font.regular,
    fontSize: 15,
    color: tokens.colors.textPrimary,
  },
  regionLabelOn: {
    fontFamily: font.semibold,
    color: tokens.colors.accent,
  },
  badgeStripEmpty: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.textSecondary,
  },
  levelLabel: {
    fontFamily: tokens.typography.families.display,
    fontSize: 16,
    letterSpacing: 0.5,
    color: tokens.colors.textSecondary,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 16,
    paddingHorizontal: 8,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
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
  },

  // Projection
  projectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  projectionIcon: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.pill,
    backgroundColor: 'rgba(90, 185, 138, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(90, 185, 138, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectionTitle: {
    fontFamily: font.semibold,
    fontSize: 17,
    color: tokens.colors.textPrimary,
    flex: 1,
  },
  projectionBody: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
    color: tokens.colors.textSecondary,
  },
  projectionLink: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: tokens.colors.accent,
  },
  divider: {
    height: 1,
    backgroundColor: tokens.colors.borderDefault,
    marginVertical: 16,
  },

  // Potential
  reasons: { gap: 10, marginTop: 12 },
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

  // Subjects
  // Objetivo y dificultad, dentro de la hoja de materia
  targetHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  targetValue: {
    fontFamily: tokens.typography.families.display,
    fontSize: 32,
    lineHeight: 32,
    color: tokens.colors.accent,
  },
  targetLabel: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
  targetClear: {
    fontFamily: font.regular,
    fontSize: 12,
    color: tokens.colors.textDisabled,
    textDecorationLine: 'underline',
  },
  targetTicks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    marginTop: -4,
  },
  targetTick: {
    fontFamily: font.regular,
    fontSize: 11,
    color: tokens.colors.textDisabled,
  },
  targetGap: {
    fontFamily: font.medium,
    fontSize: 12.5,
    color: tokens.colors.textPrimary,
    marginTop: 10,
  },
  targetHelp: {
    fontFamily: font.regular,
    fontSize: 11.5,
    lineHeight: 17,
    color: tokens.colors.textDisabled,
    marginTop: 8,
  },
  difficultyRow: {
    flexDirection: 'row',
    gap: 6,
  },
  difficultyOption: {
    flex: 1,
    paddingVertical: 10,
    // Pastilla, no `btn`: en esta app una opcion seleccionable se dibuja
    // redonda -- lo hacen Chip, las pildoras de la barra y los chips de
    // asignatura. A 8px sobre 40 de alto se leia como un rectangulo y
    // desentonaba con todo lo demas.
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surfaceHover,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  difficultyOptionOn: {
    backgroundColor: tokens.colors.accentSoftBg,
    borderColor: tokens.colors.accentSoftBorder,
  },
  difficultyText: {
    fontFamily: font.medium,
    fontSize: 12.5,
    color: tokens.colors.textSecondary,
  },
  difficultyTextOn: {
    fontFamily: font.semibold,
    color: tokens.colors.accent,
  },

  subjectsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  // Vertical, no en fila: la ficha ya no lleva solo un número, lleva la media,
  // el objetivo y la barra entre los dos, y en fila no caben sin apretarse.
  subjectTile: {
    // El ancho lo pone el componente con subjectTileWidth(); aqui solo va lo
    // que no depende de la pantalla.
    padding: 14,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
  },
  // El tic va en la esquina y es verde siempre: el color de la materia no
  // puede ser la señal de "objetivo alcanzado" porque hay materias verdes.
  subjectReached: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 20,
    height: 20,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  subjectInitial: {
    fontFamily: font.bold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  subjectName: {
    fontFamily: font.medium,
    fontSize: 13.5,
    lineHeight: 18,
    color: tokens.colors.textPrimary,
    marginBottom: 8,
    // Dos líneas fijas para que las fichas de una fila queden a la misma
    // altura tenga la materia un nombre corto o largo.
    minHeight: 36,
  },
  subjectGradeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  subjectGrade: {
    fontFamily: tokens.typography.families.display,
    fontSize: 24,
    lineHeight: 24,
    color: tokens.colors.textPrimary,
  },
  subjectArrow: {
    fontFamily: font.regular,
    fontSize: 12,
    color: tokens.colors.textDisabled,
  },
  subjectTarget: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: tokens.colors.textSecondary,
  },
  subjectBar: {
    height: 3,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surfaceHover,
    marginTop: 9,
    overflow: 'hidden',
  },
  subjectBarFill: {
    height: '100%',
    borderRadius: tokens.radius.pill,
  },
  // Dorado, no gris: "sin objetivo" es algo que se puede arreglar, no un
  // estado neutro. Es lo que le da destino al paso 5 del onboarding.
  subjectHint: {
    fontFamily: font.medium,
    fontSize: 11,
    color: tokens.colors.premiumText,
    marginTop: 7,
  },

  // Notes
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderDefault,
  },
  noteBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  noteText: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 21,
    color: tokens.colors.textPrimary,
  },
  noteDate: {
    fontFamily: font.medium,
    fontSize: 12,
    letterSpacing: 0.3,
    color: tokens.colors.textSecondary,
  },
  noteDelete: {
    padding: 4,
  },
  noteInput: {
    minHeight: 96,
    marginTop: 16,
    padding: 14,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.background,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    fontFamily: font.regular,
    fontSize: 15,
    color: tokens.colors.textPrimary,
    textAlignVertical: 'top',
  },

  // Analysis sheet
  analysisBlock: {
    marginBottom: 22,
  },
  analysisTitle: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: tokens.colors.textPrimary,
    marginBottom: 6,
  },
  analysisBody: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 21,
    color: tokens.colors.textSecondary,
  },
  analysisBullet: {
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
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },

  // Subject sheet
  fieldLabel: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    backgroundColor: tokens.colors.background,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.btn,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: font.regular,
    fontSize: 15,
    color: tokens.colors.textPrimary,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorDot: {
    width: 34,
    height: 34,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotOn: {
    borderColor: tokens.colors.textPrimary,
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
  gradesHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  gradesTitle: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: tokens.colors.textPrimary,
  },
  avgBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accentSoftBg,
    borderWidth: 1,
    borderColor: tokens.colors.accentSoftBorder,
  },
  avgBadgeText: {
    fontFamily: font.bold,
    fontSize: 13,
    color: tokens.colors.accentSoftText,
  },
  examRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderDefault,
  },
  examName: {
    fontFamily: font.medium,
    fontSize: 14,
    color: tokens.colors.textPrimary,
  },
  examDate: {
    fontFamily: font.regular,
    fontSize: 12,
    color: tokens.colors.textSecondary,
    marginTop: 1,
  },
  examGrade: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  examGradeText: {
    fontFamily: font.bold,
    fontSize: 15,
    color: tokens.colors.textPrimary,
  },
  examEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gradeInput: {
    width: 46,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: tokens.radius.btn,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    fontFamily: font.medium,
    fontSize: 14,
    color: tokens.colors.textPrimary,
    textAlign: 'center',
  },
  // Más estrecho que el de la nota a propósito: es un dato secundario, y así
  // los dos campos caben en la fila sin empujar los botones fuera.
  weightInput: {
    width: 40,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: tokens.radius.btn,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    fontFamily: font.regular,
    fontSize: 13,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
  examWeight: {
    fontFamily: font.regular,
    fontSize: 11,
    color: tokens.colors.textDisabled,
    backgroundColor: tokens.colors.surfaceHover,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    overflow: 'hidden',
  },
  examBtn: {
    padding: 4,
  },

  // Shared
  emptyText: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: tokens.colors.textSecondary,
  },
  subjectsCounter: {
    fontFamily: font.regular,
    fontSize: 12,
    color: tokens.colors.textSecondary,
    marginTop: -6,
    marginBottom: 8,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
});
