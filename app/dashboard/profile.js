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
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  LinearTransition,
} from 'react-native-reanimated';
import PrimeLimitSheet from '../../components/PrimeLimitSheet';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { tokens } from '../../theme/tokens';
import useAuthStore from '../../store/authStore';
import useUserStore from '../../store/userStore';
import { calculateXpForLevel, calculateXpForNextLevel } from '../../services/gamification';
import {
  calculateGoldenHour,
  recommendTechnique,
  getWeeklyStats,
  detectStudyPatterns,
  calculateSubjectHealth,
  detectOverloadRisk,
} from '../../services/productivityService';
import { getUpcomingExams } from '../../services/exams';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import BottomSheet from '../../components/ui/BottomSheet';
import SectionTitle from '../../components/ui/SectionTitle';

const font = tokens.typography.families.inter;

const SUBJECT_FALLBACK_COLOR = tokens.colors.textDisabled;

/** The design system's closed subject palette, in the order it defines them. */
const SUBJECT_PALETTE = Object.values(tokens.colors.subjects);

const SWIPE_REVEAL = 88;
const SWIPE_COMMIT = 56;

const initialOf = (name) => (name || '?').charAt(0).toUpperCase();

const formatMinutes = (minutes) => {
  const safe = Math.max(0, Math.round(minutes || 0));
  if (safe < 60) return `${safe} min`;
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
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

function StatTile({ value, label }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SubjectTile({ subject, onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.subjectTile}>
      <View
        style={[styles.subjectAvatar, { backgroundColor: subject.color || SUBJECT_FALLBACK_COLOR }]}
      >
        <Text style={styles.subjectInitial}>{initialOf(subject.name)}</Text>
      </View>
      <View style={styles.subjectBody}>
        <Text style={styles.subjectName} numberOfLines={1}>
          {subject.name}
        </Text>
        <Text style={styles.subjectGrade}>{subject.average || '—'}</Text>
      </View>
    </TouchableOpacity>
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

/** One block inside the analysis sheet. */
function AnalysisBlock({ title, children }) {
  return (
    <View style={styles.analysisBlock}>
      <Text style={styles.analysisTitle}>{title}</Text>
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

// ── Screen ──────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const isPrime = useAuthStore((state) => state.isPrime);

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

  const [analysisSheet, setAnalysisSheet] = useState(false);
  const [noteSheet, setNoteSheet] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [editingNote, setEditingNote] = useState(null);
  const [savingNote, setSavingNote] = useState(false);

  const [subjectSheet, setSubjectSheet] = useState(false);
  const [subjectLimitSheet, setSubjectLimitSheet] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [editSubName, setEditSubName] = useState('');
  const [editSubDifficulty, setEditSubDifficulty] = useState('5');
  const [editSubColor, setEditSubColor] = useState(SUBJECT_PALETTE[0]);
  const [subjectExams, setSubjectExams] = useState([]);
  const [editingExamId, setEditingExamId] = useState(null);
  const [tempGrade, setTempGrade] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
  const analysis = useMemo(() => {
    const sessions = sessionHistory || [];
    const week = getWeeklyStats(sessions);

    const thisWeek = week.reduce((sum, d) => sum + d.minutes, 0);

    // getWeeklyStats only covers seven days, so the comparison window is
    // measured here rather than asking it for something it doesn't do.
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const previousWeek = sessions
      .filter((s) => {
        const age = now - new Date(s.date).getTime();
        return age >= 7 * day && age < 14 * day;
      })
      .reduce((sum, s) => sum + (s.duration || 0), 0);

    const delta =
      previousWeek > 0 ? Math.round(((thisWeek - previousWeek) / previousWeek) * 100) : null;

    let headline;
    if (sessions.length === 0) {
      headline = 'Todavía no hay sesiones que analizar. Completa una y esto se llenará solo.';
    } else if (delta === null) {
      headline = `Llevas ${formatMinutes(thisWeek)} de estudio esta semana. La semana que viene ya podré compararlo.`;
    } else if (delta > 0) {
      headline = `Has estudiado ${formatMinutes(thisWeek)} esta semana, un ${delta}% más que la anterior.`;
    } else if (delta < 0) {
      headline = `Has estudiado ${formatMinutes(thisWeek)} esta semana, un ${Math.abs(delta)}% menos que la anterior.`;
    } else {
      headline = `Has estudiado ${formatMinutes(thisWeek)}, el mismo tiempo que la semana pasada.`;
    }

    const health = calculateSubjectHealth(sessions, subjects, exams).filter((s) => s.health < 70);

    return {
      week,
      thisWeek,
      previousWeek,
      delta,
      headline,
      hasSessions: sessions.length > 0,
      patterns: detectStudyPatterns(sessions),
      goldenHour: calculateGoldenHour(sessions),
      technique: recommendTechnique(sessions),
      overload: detectOverloadRisk(sessions, exams),
      needsAttention: health.slice(0, 3),
    };
  }, [sessionHistory, subjects, exams]);

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
    setEditSubDifficulty(String(subject?.difficulty ?? 5));
    // A subject created before the palette existed keeps whatever colour it
    // has; the picker just doesn't show any of the eight as selected.
    setEditSubColor(subject?.color ?? SUBJECT_PALETTE[0]);
    setSubjectExams([]);
    setEditingExamId(null);
    setSubjectSheet(true);
  };

  const saveSubject = async () => {
    if (!editSubName.trim() || !user?.uid) return;
    const difficulty = parseInt(editSubDifficulty, 10) || 5;
    try {
      const fields = { name: editSubName.trim(), difficulty, color: editSubColor };
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
    try {
      await useUserStore.getState().updateExam(user.uid, examId, { grade: tempGrade });
      setSubjectExams((prev) =>
        prev.map((e) => (e.id === examId ? { ...e, grade: tempGrade } : e))
      );
      setEditingExamId(null);
      setTempGrade('');
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
          {/* Level */}
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
              <View style={[styles.levelFill, { width: `${levelPercent}%` }]} />
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

          {/* Stats */}
          <View style={styles.statsRow}>
            <StatTile value={profile?.averageGrade || '—'} label="Promedio" />
            <StatTile value={String(level)} label="Nivel" />
            <StatTile value={String(xp)} label="XP Total" />
          </View>

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
              <TouchableOpacity activeOpacity={0.7} onPress={() => setAnalysisSheet(true)}>
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
                {subjects.map((subject) => (
                  <SubjectTile
                    key={subject.id}
                    subject={subject}
                    onPress={() => openSubject(subject)}
                  />
                ))}
              </View>
            )}
          </View>

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

      {/* ── Analysis detail ── */}
      <BottomSheet visible={analysisSheet} onClose={() => setAnalysisSheet(false)} title="Análisis">
        {!analysis.hasSessions ? (
          <Text style={[styles.emptyText, { marginTop: 16 }]}>
            Cuando termines tu primera sesión, aquí aparecerá tu ritmo, tus hábitos y las materias
            que necesitan atención.
          </Text>
        ) : (
          <View style={{ marginTop: 16 }}>
            <AnalysisBlock title="Ritmo semanal">
              <Text style={styles.analysisBody}>
                {formatMinutes(analysis.thisWeek)} esta semana
                {analysis.previousWeek > 0
                  ? ` · ${formatMinutes(analysis.previousWeek)} la anterior`
                  : ''}
              </Text>
              <WeekBars days={analysis.week} />
            </AnalysisBlock>

            {analysis.patterns.hasEnoughData ? (
              <AnalysisBlock title="Tus hábitos">
                <Text style={styles.analysisBody}>
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
              </AnalysisBlock>
            ) : null}

            <AnalysisBlock title={`Técnica recomendada · ${analysis.technique.name}`}>
              <Text style={styles.analysisBody}>{analysis.technique.description}</Text>
            </AnalysisBlock>

            {analysis.needsAttention.length > 0 ? (
              <AnalysisBlock title="Materias que necesitan atención">
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
              </AnalysisBlock>
            ) : null}

            <AnalysisBlock title={`Riesgo de sobrecarga · ${analysis.overload.riskLevel}`}>
              <Text style={styles.analysisBody}>{analysis.overload.recommendation}</Text>
              {analysis.overload.reasons.map((reason) => (
                <Text key={reason} style={styles.analysisBullet}>
                  · {reason}
                </Text>
              ))}
            </AnalysisBlock>
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
        avoidKeyboard
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
        avoidKeyboard
      >
        <Text style={styles.fieldLabel}>Nombre</Text>
        <TextInput
          style={styles.input}
          value={editSubName}
          onChangeText={setEditSubName}
          placeholder="Ej. Matemáticas"
          placeholderTextColor={tokens.colors.textDisabled}
        />

        <Text style={styles.fieldLabel}>Dificultad (1-10)</Text>
        <TextInput
          style={styles.input}
          value={editSubDifficulty}
          onChangeText={setEditSubDifficulty}
          keyboardType="numeric"
          maxLength={2}
          placeholder="5"
          placeholderTextColor={tokens.colors.textDisabled}
        />

        {/* A closed palette on purpose: these colours categorise subjects
            across the whole app, so a free colour wheel would let two subjects
            end up indistinguishable. */}
        <Text style={styles.fieldLabel}>Color</Text>
        <View style={styles.colorRow}>
          {SUBJECT_PALETTE.map((color) => {
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
                            }}
                          >
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

  // Subjects
  subjectsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  subjectTile: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
  },
  subjectAvatar: {
    width: 38,
    height: 38,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectInitial: {
    fontFamily: font.bold,
    fontSize: 15,
    color: '#FFFFFF',
  },
  subjectBody: {
    flex: 1,
    minWidth: 0,
  },
  subjectName: {
    fontFamily: font.medium,
    fontSize: 14,
    color: tokens.colors.textPrimary,
  },
  subjectGrade: {
    fontFamily: font.bold,
    fontSize: 15,
    color: tokens.colors.accent,
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
