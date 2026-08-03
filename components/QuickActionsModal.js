import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  TextInput,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import {
  X,
  CalendarPlus,
  FileText,
  Package,
  Sparkles,
  Send,
  Star,
  ChevronRight,
  Check,
  Lock,
} from 'lucide-react-native';
import { tokens } from '../theme/tokens';
import { useRouter } from 'expo-router';
import useUserStore from '../store/userStore';
import useAuthStore from '../store/authStore';

// Sub-views
const VIEW_MAIN = 'main';
const VIEW_NOTE = 'note';
const VIEW_EXAM_GRADE = 'exam_grade';
const VIEW_GRADE_INPUT = 'grade_input';

export default function QuickActionsModal({ visible, onClose, onAddExam, onAddFile }) {
  const router = useRouter();
  const isPrime = useAuthStore((state) => state.isPrime);
  const [view, setView] = useState(VIEW_MAIN);
  const [completedExams, setCompletedExams] = useState([]);
  const [noteContent, setNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [selectedExam, setSelectedExam] = useState(null);
  const [gradeInput, setGradeInput] = useState('');
  const [weightInput, setWeightInput] = useState('100'); // Default 100%
  const [gradeError, setGradeError] = useState('');
  const [savingGrade, setSavingGrade] = useState(false);
  const gradeInputRef = useRef(null);
  const weightInputRef = useRef(null);

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

      // Combine and deduplicate just in case
      const combined = [...pendingRes, ...completedRes];
      const unique = Array.from(new global.Map(combined.map((e) => [e.id, e])).values());

      setCompletedExams(unique);
    } catch (e) {
      console.warn('Could not load exams for quick action', e);
    }
  }, []);

  useEffect(() => {
    if (visible) loadExams();
  }, [visible, loadExams]);

  const examsWithoutGrade = completedExams.filter((e) => !e.grade && e.grade !== 0);

  const handleClose = () => {
    setView(VIEW_MAIN);
    setNoteContent('');
    setGradeInput('');
    setWeightInput('100');
    setGradeError('');
    setSelectedExam(null);
    onClose();
  };

  const handleBack = () => {
    if (view === VIEW_GRADE_INPUT) setView(VIEW_EXAM_GRADE);
    else setView(VIEW_MAIN);
  };

  const handleSaveNote = async () => {
    if (!noteContent.trim()) return;
    setSavingNote(true);
    try {
      const { auth } = await import('../services/firebase');
      await useUserStore.getState().addQuickNote(auth.currentUser.uid, noteContent);
      setSavingNote(false);
      // Close entire modal smoothly — no popup alert
      handleClose();
    } catch (e) {
      console.error('Failed to save note', e);
      setSavingNote(false);
    }
  };

  const handleSaveGrade = async () => {
    const num = parseFloat(gradeInput.replace(',', '.'));
    const weight = parseFloat(weightInput.replace(',', '.')) / 100;

    if (isNaN(num) || num < 0 || num > 10) {
      setGradeError('Introduce una nota entre 0 y 10');
      return;
    }

    if (isNaN(weight) || weight <= 0) {
      setGradeError('Introduce un peso válido (ej. 100%)');
      return;
    }

    setSavingGrade(true);
    try {
      const { updateExam } = await import('../services/exams');
      await updateExam(selectedExam.id, {
        grade: num,
        weight: weight,
        gradeAddedAt: new Date().toISOString(),
        completed: true,
      });

      // Refresh store average and trigger global sync
      const { auth } = await import('../services/firebase');
      await useUserStore.getState().updateAverageGrade(auth.currentUser.uid);
      useUserStore.getState().triggerExamRefresh();
      // The exam just stopped being ungraded, so drop it from the list.
      loadExams();

      setView(VIEW_MAIN);
      setGradeInput('');
      setSelectedExam(null);
      Alert.alert(
        '✓ Nota guardada',
        `Has registrado un ${num} (${(weight * 100).toFixed(0)}%) en ${selectedExam.name}.`
      );
    } catch {
      Alert.alert('Error', 'No se pudo guardar la nota del examen.');
    } finally {
      setSavingGrade(false);
    }
  };

  const handleDeleteExam = (exam) => {
    Alert.alert('Eliminar examen', `¿Estás seguro de que quieres eliminar "${exam.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            const { deleteExam } = await import('../services/exams');
            await deleteExam(exam.id);
            const { auth } = await import('../services/firebase');
            await useUserStore.getState().loadUserData(auth.currentUser.uid);
            useUserStore.getState().triggerExamRefresh();
            loadExams();
          } catch (e) {
            Alert.alert('Error', 'No se pudo eliminar el examen.');
          }
        },
      },
    ]);
  };

  const actions = [
    {
      id: 'exam',
      icon: <CalendarPlus size={22} color="#4A90E2" />,
      label: 'Añadir Examen',
      desc: 'Nuevo examen o evaluación',
      color: '#4A90E2',
      onPress: () => {
        handleClose();
        onAddExam();
      },
    },
    {
      id: 'grade',
      icon: <Star size={22} color="#FF9F0A" />,
      label: 'Nota de Examen',
      desc:
        examsWithoutGrade.length > 0
          ? `${examsWithoutGrade.length} sin calificar`
          : 'Sin exámenes pendientes',
      color: '#FF9F0A',
      onPress: () => setView(VIEW_EXAM_GRADE),
      disabled: examsWithoutGrade.length === 0,
    },
    {
      id: 'note',
      icon: <FileText size={22} color="#30D158" />,
      label: 'Apunte Rápido',
      desc: 'Guarda un pensamiento',
      color: '#30D158',
      onPress: () => setView(VIEW_NOTE),
    },
    {
      id: 'backpack',
      icon: <Package size={22} color="#BF5AF2" />,
      label: 'Archivos',
      desc: 'Sube a tu mochila',
      color: '#BF5AF2',
      onPress: () => {
        handleClose();
        onAddFile();
      },
    },
    {
      id: 'ai',
      icon: <Sparkles size={22} color={isPrime ? '#FFD60A' : '#636366'} />,
      label: 'IA Schedio',
      desc: isPrime ? 'Analiza tus apuntes' : 'Solo para usuarios Prime',
      color: isPrime ? '#FFD60A' : '#636366',
      isPrimeLocked: !isPrime,
      onPress: () => {
        handleClose();
        router.push(isPrime ? '/dashboard/recommendations' : '/plus');
      },
    },
  ];

  const renderHeader = (title, hideClose = false) => (
    <View style={styles.header}>
      {view !== VIEW_MAIN ? (
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <X size={16} color={tokens.colors.textSecondary} />
        </TouchableOpacity>
      ) : (
        <View style={styles.pill} />
      )}
      <Text style={styles.title}>{title}</Text>
      {hideClose ? (
        <View style={styles.pill} />
      ) : (
        <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
          <X size={18} color={tokens.colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <BlurView
          intensity={Platform.OS === 'ios' ? 30 : 80}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <TouchableOpacity style={styles.dismissArea} activeOpacity={1} onPress={handleClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheetWrapper}
        >
          <View style={styles.sheet}>
            {/* ── MAIN VIEW ── */}
            {view === VIEW_MAIN && (
              <>
                <View style={styles.dragHandle} />
                {renderHeader('Acciones Rápidas')}
                {actions.map((action) => (
                  <TouchableOpacity
                    key={action.id}
                    style={[styles.actionRow, action.disabled && styles.actionRowDisabled]}
                    onPress={action.disabled ? undefined : action.onPress}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.actionIcon, { backgroundColor: action.color + '1A' }]}>
                      {action.icon}
                    </View>
                    <View style={styles.actionText}>
                      <Text
                        style={[
                          styles.actionLabel,
                          action.disabled && { color: tokens.colors.textSecondary },
                        ]}
                      >
                        {action.label}
                      </Text>
                      <Text style={styles.actionDesc}>{action.desc}</Text>
                    </View>
                    {action.isPrimeLocked ? (
                      <View style={styles.primeBadge}>
                        <Lock size={10} color="#FFD60A" />
                        <Text style={styles.primeBadgeText}>Prime</Text>
                      </View>
                    ) : !action.disabled ? (
                      <ChevronRight size={18} color={tokens.colors.textSecondary} />
                    ) : null}
                  </TouchableOpacity>
                ))}
              </>
            )}

            {/* ── QUICK NOTE VIEW ── */}
            {view === VIEW_NOTE && (
              <>
                <View style={styles.dragHandle} />
                {renderHeader('Apunte Rápido', true)}
                <TextInput
                  style={styles.noteInput}
                  placeholder="¿Qué tienes en mente?"
                  placeholderTextColor={tokens.colors.textSecondary}
                  multiline
                  autoFocus
                  value={noteContent}
                  onChangeText={setNoteContent}
                  selectionColor={tokens.colors.primary}
                />
                <TouchableOpacity
                  style={[styles.primaryBtn, !noteContent.trim() && styles.primaryBtnDisabled]}
                  onPress={handleSaveNote}
                  disabled={!noteContent.trim() || savingNote}
                  activeOpacity={0.8}
                >
                  <Send size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>
                    {savingNote ? 'Guardando...' : 'Guardar Nota'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── PICK EXAM VIEW ── */}
            {view === VIEW_EXAM_GRADE && (
              <>
                <View style={styles.dragHandle} />
                {renderHeader('Calificar Examen')}
                {examsWithoutGrade.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Star
                      size={36}
                      color={tokens.colors.textSecondary}
                      style={{ marginBottom: 12, opacity: 0.3 }}
                    />
                    <Text style={styles.emptyText}>
                      Todos los exámenes ya tienen nota registrada.
                    </Text>
                  </View>
                ) : (
                  <ScrollView style={styles.examList} showsVerticalScrollIndicator={false}>
                    {examsWithoutGrade.map((exam) => (
                      <TouchableOpacity
                        key={exam.id}
                        style={styles.examRow}
                        onPress={() => {
                          setSelectedExam(exam);
                          setView(VIEW_GRADE_INPUT);
                        }}
                        onLongPress={() => handleDeleteExam(exam)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.examDot} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.examName}>{exam.name}</Text>
                          <Text style={styles.examDate}>
                            {new Date(exam.date).toLocaleDateString('es-ES', {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </Text>
                        </View>
                        <ChevronRight size={16} color={tokens.colors.textSecondary} />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </>
            )}

            {/* ── GRADE INPUT VIEW ── */}
            {view === VIEW_GRADE_INPUT && selectedExam && (
              <>
                <View style={styles.dragHandle} />
                <Text style={styles.gradeLabel}>Introduce la nota y su peso en la materia</Text>
                <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
                  <TouchableOpacity
                    style={[
                      styles.gradeInputWrapper,
                      { flex: 2 },
                      gradeError && styles.gradeInputError,
                    ]}
                    activeOpacity={1}
                    onPress={() => gradeInputRef.current?.focus()}
                  >
                    <Text style={styles.miniLabel}>NOTA (0-10)</Text>
                    <TextInput
                      ref={gradeInputRef}
                      style={styles.gradeInput}
                      placeholder="8.5"
                      placeholderTextColor={tokens.colors.textSecondary}
                      keyboardType="decimal-pad"
                      autoFocus
                      value={gradeInput}
                      onChangeText={(t) => {
                        setGradeInput(t);
                        setGradeError('');
                      }}
                      maxLength={4}
                      selectionColor={tokens.colors.primary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.gradeInputWrapper, { flex: 1 }]}
                    activeOpacity={1}
                    onPress={() => weightInputRef.current?.focus()}
                  >
                    <Text style={styles.miniLabel}>PESO %</Text>
                    <TextInput
                      ref={weightInputRef}
                      style={styles.gradeInput}
                      placeholder="100"
                      placeholderTextColor={tokens.colors.textSecondary}
                      keyboardType="numeric"
                      value={weightInput}
                      onChangeText={(t) => {
                        setWeightInput(t);
                        setGradeError('');
                      }}
                      maxLength={3}
                      selectionColor={tokens.colors.primary}
                    />
                  </TouchableOpacity>
                </View>
                {gradeError ? <Text style={styles.errorText}>{gradeError}</Text> : null}
                <TouchableOpacity
                  style={[styles.primaryBtn, !gradeInput && styles.primaryBtnDisabled]}
                  onPress={handleSaveGrade}
                  disabled={!gradeInput || savingGrade}
                  activeOpacity={0.8}
                >
                  <Check size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>
                    {savingGrade ? 'Guardando...' : 'Guardar Nota'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* Safe area spacing */}
            <View style={{ height: 24 }} />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheetWrapper: {
    // KeyboardAvoidingView wrapper
  },
  sheet: {
    backgroundColor: '#0A0A0A',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
  },
  dragHandle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  pill: {
    width: 32,
    height: 32,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Action rows
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    gap: 14,
  },
  actionRowDisabled: {
    opacity: 0.4,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    flex: 1,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  actionDesc: {
    fontSize: 12,
    color: tokens.colors.textSecondary,
    fontWeight: '500',
  },
  primeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 214, 10, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 214, 10, 0.25)',
  },
  primeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFD60A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Note view
  noteInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 18,
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 24,
    height: 130,
    textAlignVertical: 'top',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  // Exam list
  examList: {
    maxHeight: 240,
  },
  examRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  examDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF9F0A',
  },
  examName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  examDate: {
    fontSize: 12,
    color: tokens.colors.textSecondary,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  // Grade input
  gradeLabel: {
    fontSize: 14,
    color: tokens.colors.textSecondary,
    fontWeight: '600',
    marginBottom: 14,
    textAlign: 'center',
  },
  gradeInputWrapper: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 12,
    height: 70,
    justifyContent: 'center',
  },
  miniLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: tokens.colors.textSecondary,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  gradeInput: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    padding: 0,
  },
  gradeInputError: {
    borderColor: '#FF453A',
    borderWidth: 1,
  },
  errorText: {
    color: '#FF453A',
    fontSize: 13,
    marginTop: 10,
    fontWeight: '600',
  },
  // Primary button
  primaryBtn: {
    backgroundColor: tokens.colors.primary,
    borderRadius: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 4,
  },
  primaryBtnDisabled: {
    opacity: 0.4,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: tokens.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 20,
  },
});
