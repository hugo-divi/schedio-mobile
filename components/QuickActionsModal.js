import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import {
  CalendarPlus,
  Star,
  FileText,
  Package,
  Play,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Lock,
} from 'lucide-react-native';

import { tokens } from '../theme/tokens';
import useUserStore from '../store/userStore';
import useAuthStore from '../store/authStore';
import BottomSheet from './ui/BottomSheet';
import Button from './ui/Button';
import { PremiumBadge } from './ui/Chip';

const font = tokens.typography.families.inter;

const VIEW_MAIN = 'main';
const VIEW_NOTE = 'note';
const VIEW_PICK_EXAM = 'pick_exam';
const VIEW_GRADE = 'grade';

// ── Pieces ──────────────────────────────────────────────────────────────────

function SheetHeader({ title, onBack }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <TouchableOpacity
          onPress={onBack}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <ChevronLeft size={20} color={tokens.colors.textPrimary} strokeWidth={1.75} />
        </TouchableOpacity>
      ) : null}
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

function ActionRow({ icon: Icon, label, desc, locked, disabled, onPress }) {
  const dim = locked || disabled;
  return (
    <TouchableOpacity
      activeOpacity={dim ? 1 : 0.7}
      onPress={dim ? undefined : onPress}
      disabled={dim}
      style={styles.row}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!dim }}
    >
      <View style={styles.rowIcon}>
        <Icon
          size={19}
          strokeWidth={1.75}
          color={dim ? tokens.colors.textDisabled : tokens.colors.textSecondary}
        />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, dim && { color: tokens.colors.textDisabled }]}>{label}</Text>
        {desc ? <Text style={styles.rowDesc}>{desc}</Text> : null}
      </View>
      {locked ? (
        // PremiumBadge wraps its children in a Text, so the padlock goes
        // beside the badge rather than inside it.
        <View style={styles.lockGroup}>
          <Lock size={12} color={tokens.colors.premiumText} strokeWidth={2} />
          <PremiumBadge>Prime</PremiumBadge>
        </View>
      ) : disabled ? null : (
        <ChevronRight size={18} strokeWidth={1.75} color={tokens.colors.textSecondary} />
      )}
    </TouchableOpacity>
  );
}

// ── Sheet ───────────────────────────────────────────────────────────────────

export default function QuickActionsModal({ visible, onClose, onAddExam, onAddFile }) {
  const router = useRouter();
  const isPrime = useAuthStore((state) => state.isPrime);

  const [view, setView] = useState(VIEW_MAIN);
  const [exams, setExams] = useState([]);
  const [noteContent, setNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [selectedExam, setSelectedExam] = useState(null);
  const [gradeInput, setGradeInput] = useState('');
  const [weightInput, setWeightInput] = useState('100');
  const [gradeError, setGradeError] = useState('');
  const [savingGrade, setSavingGrade] = useState(false);

  // Loaded when the sheet opens rather than when the app starts: these two
  // queries used to run on every launch for a sheet that often never opens.
  const loadExams = useCallback(async () => {
    try {
      const { auth } = await import('../services/firebase');
      const user = auth.currentUser;
      if (!user) return;

      const { getCompletedExams, getPendingExams } = await import('../services/exams');
      const [completedRes, pendingRes] = await Promise.all([
        getCompletedExams(user.uid, 20),
        getPendingExams(user.uid),
      ]);

      const combined = [...pendingRes, ...completedRes];
      const unique = Array.from(new global.Map(combined.map((e) => [e.id, e])).values());
      setExams(unique);
    } catch (e) {
      console.warn('Could not load exams for quick action', e);
    }
  }, []);

  useEffect(() => {
    if (visible) loadExams();
  }, [visible, loadExams]);

  const ungraded = exams.filter((e) => !e.grade && e.grade !== 0);

  const close = () => {
    setView(VIEW_MAIN);
    setNoteContent('');
    setGradeInput('');
    setWeightInput('100');
    setGradeError('');
    setSelectedExam(null);
    onClose();
  };

  const back = () => {
    setGradeError('');
    setView(view === VIEW_GRADE ? VIEW_PICK_EXAM : VIEW_MAIN);
  };

  // ── Actions ──

  const saveNote = async () => {
    if (!noteContent.trim()) return;
    setSavingNote(true);
    try {
      const { auth } = await import('../services/firebase');
      await useUserStore.getState().addQuickNote(auth.currentUser.uid, noteContent.trim());
      close();
    } catch (e) {
      console.error('Failed to save note', e);
      Alert.alert('Error', 'No se pudo guardar el apunte.');
    } finally {
      setSavingNote(false);
    }
  };

  const saveGrade = async () => {
    const num = parseFloat(gradeInput.replace(',', '.'));
    const weight = parseFloat(weightInput.replace(',', '.')) / 100;

    if (isNaN(num) || num < 0 || num > 10) {
      setGradeError('Introduce una nota entre 0 y 10.');
      return;
    }
    if (isNaN(weight) || weight <= 0) {
      setGradeError('Introduce un peso válido (por ejemplo, 100).');
      return;
    }

    setSavingGrade(true);
    try {
      const { updateExam } = await import('../services/exams');
      await updateExam(selectedExam.id, {
        grade: num,
        weight,
        gradeAddedAt: new Date().toISOString(),
        completed: true,
      });

      const { auth } = await import('../services/firebase');
      await useUserStore.getState().updateAverageGrade(auth.currentUser.uid);
      useUserStore.getState().triggerExamRefresh();
      loadExams();

      close();
      Alert.alert(
        'Nota guardada',
        `Has registrado un ${num} (${(weight * 100).toFixed(0)}%) en ${selectedExam.name}.`
      );
    } catch {
      Alert.alert('Error', 'No se pudo guardar la nota del examen.');
    } finally {
      setSavingGrade(false);
    }
  };

  const deleteExam = (exam) =>
    Alert.alert('Eliminar examen', `¿Seguro que quieres eliminar "${exam.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            const { deleteExam: remove } = await import('../services/exams');
            await remove(exam.id);
            const { auth } = await import('../services/firebase');
            await useUserStore.getState().loadUserData(auth.currentUser.uid);
            useUserStore.getState().triggerExamRefresh();
            loadExams();
          } catch {
            Alert.alert('Error', 'No se pudo eliminar el examen.');
          }
        },
      },
    ]);

  // ── Render ──

  return (
    <BottomSheet visible={visible} onClose={close}>
      {view === VIEW_MAIN ? (
        <>
          <SheetHeader title="Acciones rápidas" />
          <View style={styles.list}>
            <ActionRow
              icon={CalendarPlus}
              label="Añadir examen o tarea"
              desc="Y el plan se reorganiza solo"
              onPress={() => {
                close();
                onAddExam();
              }}
            />
            <ActionRow
              icon={Star}
              label="Nota de examen"
              desc={
                ungraded.length > 0
                  ? `${ungraded.length} sin calificar`
                  : 'No tienes exámenes pendientes de nota'
              }
              disabled={ungraded.length === 0}
              onPress={() => setView(VIEW_PICK_EXAM)}
            />
            <ActionRow
              icon={FileText}
              label="Apunte rápido"
              desc="Guarda una idea antes de que se vaya"
              onPress={() => setView(VIEW_NOTE)}
            />
            <ActionRow
              icon={Package}
              label="Subir a la mochila"
              desc="Apuntes, fotos o PDFs"
              onPress={() => {
                close();
                onAddFile();
              }}
            />
            <ActionRow
              icon={Play}
              label="Empezar sesión de estudio"
              desc="Elige materia y tiempo"
              onPress={() => {
                close();
                router.push('/dashboard/study');
              }}
            />
            {/* Inert on purpose, like the planner on the Plan screen: CLAUDE.md
                puts the coach outside the initial launch. */}
            <ActionRow
              icon={Sparkles}
              label="IA Schedio"
              desc={isPrime ? 'Próximamente' : 'Próximamente · incluido en Prime'}
              locked
            />
          </View>
        </>
      ) : null}

      {view === VIEW_NOTE ? (
        <>
          <SheetHeader title="Apunte rápido" onBack={back} />
          <TextInput
            style={styles.noteInput}
            placeholder="¿Qué tienes en mente?"
            placeholderTextColor={tokens.colors.textDisabled}
            multiline
            autoFocus
            value={noteContent}
            onChangeText={setNoteContent}
          />
          <View style={{ marginTop: 20 }}>
            <Button
              title="Guardar apunte"
              fullWidth
              loading={savingNote}
              disabled={!noteContent.trim()}
              onPress={saveNote}
            />
          </View>
        </>
      ) : null}

      {view === VIEW_PICK_EXAM ? (
        <>
          <SheetHeader title="Calificar examen" onBack={back} />
          {ungraded.length === 0 ? (
            <Text style={styles.empty}>Todos tus exámenes ya tienen nota registrada.</Text>
          ) : (
            <>
              <View style={styles.list}>
                {ungraded.map((exam) => (
                  <TouchableOpacity
                    key={exam.id}
                    activeOpacity={0.7}
                    onPress={() => {
                      setSelectedExam(exam);
                      setGradeInput('');
                      setWeightInput('100');
                      setView(VIEW_GRADE);
                    }}
                    onLongPress={() => deleteExam(exam)}
                    style={styles.row}
                  >
                    <View style={styles.rowBody}>
                      <Text style={styles.rowLabel}>{exam.name}</Text>
                      <Text style={styles.rowDesc}>
                        {new Date(exam.date).toLocaleDateString('es-ES', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </Text>
                    </View>
                    <ChevronRight
                      size={18}
                      strokeWidth={1.75}
                      color={tokens.colors.textSecondary}
                    />
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.hint}>Mantén pulsado un examen para eliminarlo.</Text>
            </>
          )}
        </>
      ) : null}

      {view === VIEW_GRADE && selectedExam ? (
        <>
          <SheetHeader title={selectedExam.name} onBack={back} />
          <Text style={styles.gradeLead}>Introduce la nota y cuánto pesa en la materia.</Text>

          <View style={styles.gradeRow}>
            <View style={[styles.gradeField, { flex: 2 }]}>
              <Text style={styles.gradeLabel}>Nota (0-10)</Text>
              <TextInput
                style={[styles.gradeInput, gradeError && styles.gradeInputError]}
                placeholder="8,5"
                placeholderTextColor={tokens.colors.textDisabled}
                keyboardType="decimal-pad"
                autoFocus
                maxLength={4}
                value={gradeInput}
                onChangeText={(t) => {
                  setGradeInput(t);
                  setGradeError('');
                }}
              />
            </View>
            <View style={[styles.gradeField, { flex: 1 }]}>
              <Text style={styles.gradeLabel}>Peso %</Text>
              <TextInput
                style={styles.gradeInput}
                placeholder="100"
                placeholderTextColor={tokens.colors.textDisabled}
                keyboardType="numeric"
                maxLength={3}
                value={weightInput}
                onChangeText={(t) => {
                  setWeightInput(t);
                  setGradeError('');
                }}
              />
            </View>
          </View>

          {gradeError ? <Text style={styles.error}>{gradeError}</Text> : null}

          <View style={{ marginTop: 20 }}>
            <Button
              title="Guardar nota"
              fullWidth
              loading={savingGrade}
              disabled={!gradeInput}
              onPress={saveGrade}
            />
          </View>
        </>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: -8,
    marginBottom: 4,
  },
  back: {
    width: 32,
    height: 32,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontFamily: font.bold,
    fontSize: 20,
    color: tokens.colors.textPrimary,
    marginLeft: 8,
  },

  list: {
    gap: 8,
    marginTop: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: tokens.radius.btn,
    backgroundColor: tokens.colors.surfaceHover,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowLabel: {
    fontFamily: font.medium,
    fontSize: 15,
    color: tokens.colors.textPrimary,
  },
  rowDesc: {
    fontFamily: font.regular,
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
  lockGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hint: {
    fontFamily: font.regular,
    fontSize: 12,
    color: tokens.colors.textDisabled,
    marginTop: 10,
  },
  empty: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: tokens.colors.textSecondary,
    marginTop: 16,
  },

  noteInput: {
    minHeight: 110,
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

  gradeLead: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: tokens.colors.textSecondary,
    marginTop: 12,
  },
  gradeRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  gradeField: {
    gap: 6,
  },
  gradeLabel: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
  gradeInput: {
    backgroundColor: tokens.colors.background,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.btn,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: tokens.typography.families.display,
    fontSize: 22,
    letterSpacing: 0.5,
    color: tokens.colors.textPrimary,
  },
  gradeInputError: {
    borderColor: tokens.colors.danger,
  },
  error: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.danger,
    marginTop: 10,
  },
});
