import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Check, X, Plus, Bell } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { addDays, format, isBefore, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

import { auth } from '../services/firebase';
import { tokens } from '../theme/tokens';
import useAuthStore from '../store/authStore';
import useUserStore from '../store/userStore';
import usePreferencesStore from '../store/preferencesStore';
import { requestPermissions } from '../services/notificationService';
import { createExam } from '../services/exams';
import {
  EDUCATION_LEVELS,
  BACHILLERATO_BRANCHES,
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

const font = tokens.typography.families.inter;

const TOTAL_STEPS = 7;
const DURATIONS = [30, 45, 60];

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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const clearUser = useAuthStore((state) => state.clearUser);
  const setNotificationsEnabled = usePreferencesStore((state) => state.setNotificationsEnabled);

  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);

  const [educationLevel, setEducationLevel] = useState(null);
  const [currentGrade, setCurrentGrade] = useState('');
  const [branch, setBranch] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [newSubject, setNewSubject] = useState('');
  const [subjectError, setSubjectError] = useState('');
  const [paletteFor, setPaletteFor] = useState(null);
  const [reviewFrequency, setReviewFrequency] = useState(null);
  const [taskManagement, setTaskManagement] = useState(null);
  const [howSheet, setHowSheet] = useState(false);
  const [notificationsConsent, setNotificationsConsent] = useState(null);
  const [goal, setGoal] = useState(null);
  const [examName, setExamName] = useState('');
  const [examDate, setExamDate] = useState(addDays(new Date(), 7));
  const [goalSubject, setGoalSubject] = useState(null);
  const [duration, setDuration] = useState(45);
  const [when, setWhen] = useState('today');

  // ── Resume where they left off ──

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setReady(true);
      return;
    }
    loadOnboarding(uid).then((saved) => {
      if (saved) {
        if (saved.educationLevel) setEducationLevel(saved.educationLevel);
        if (saved.currentGrade != null) setCurrentGrade(String(saved.currentGrade));
        if (saved.branch) setBranch(saved.branch);
        if (Array.isArray(saved.subjects)) setSubjects(saved.subjects);
        if (saved.reviewFrequency) setReviewFrequency(saved.reviewFrequency);
        if (saved.taskManagement) setTaskManagement(saved.taskManagement);
        if (saved.notificationsConsent != null) setNotificationsConsent(saved.notificationsConsent);
        if (saved.step) setStep(Math.min(TOTAL_STEPS, saved.step));
      }
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
    () => templateFor(educationLevel, branch).filter((n) => !subjects.some((s) => s.name === n)),
    [educationLevel, branch, subjects]
  );

  const canAdvance = () => {
    switch (step) {
      case 1:
        return !!educationLevel && currentGrade.trim() !== '' && !gradeError;
      case 2:
        return subjects.length >= MIN_SUBJECTS;
      case 3:
        return !!reviewFrequency;
      case 4:
        return !!taskManagement;
      case 5:
        return true;
      case 6:
        return notificationsConsent !== null;
      case 7:
        if (goalSubject === null) return false;
        if (goal === 'exam') {
          return (
            examName.trim().length >= 2 && !isBefore(startOfDay(examDate), startOfDay(new Date()))
          );
        }
        return goal === 'session';
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

  const patchFor = useCallback(
    (nextStep) => ({
      step: nextStep,
      educationLevel,
      currentGrade: Number.isNaN(gradeValue) ? null : gradeValue,
      branch,
      subjects,
      reviewFrequency,
      taskManagement,
      notificationsConsent,
    }),
    [
      educationLevel,
      gradeValue,
      branch,
      subjects,
      reviewFrequency,
      taskManagement,
      notificationsConsent,
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
    setStep(next);
  };

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
    setStep(step - 1);
  };

  const finish = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setSaving(true);
    try {
      // Subjects only become real — and get ids — here.
      const created = await completeOnboarding(uid, {
        educationLevel,
        branch,
        currentGrade: Number.isNaN(gradeValue) ? null : gradeValue,
        subjects,
        taskManagement,
      });

      const chosen = created[goalSubject];

      if (goal === 'exam' && chosen) {
        await createExam({
          userId: uid,
          name: examName.trim(),
          subjectId: chosen.id,
          subject: chosen.name,
          date: examDate,
          type: 'exam',
          priority: 5,
          completed: false,
        });
      } else if (goal === 'session' && chosen) {
        // There is no "planned session" in the model; a manual plan task is
        // the closest thing, and tapping it starts the session for real.
        await useUserStore.getState().addManualTask(uid, {
          text: `Estudiar ${chosen.name}`,
          date: (when === 'today' ? new Date() : addDays(new Date(), 1)).toISOString(),
          duration,
          subjectId: chosen.id,
          subjectName: chosen.name,
          subjectColor: chosen.color,
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
                    if (level !== 'Bachillerato') setBranch(null);
                  }}
                />
              ))}
            </View>

            <View style={{ marginTop: 28 }}>
              <Input
                label="Tu nota media actual"
                value={currentGrade}
                onChangeText={setCurrentGrade}
                placeholder="Ej. 6,5"
                keyboardType="decimal-pad"
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
            <Text style={styles.lead}>
              Añade entre {MIN_SUBJECTS} y {MAX_SUBJECTS}. Toca una para cambiarle el color.
            </Text>

            {educationLevel === 'Bachillerato' ? (
              <>
                <Text style={styles.fieldLabel}>Itinerario</Text>
                <View style={styles.pillWrap}>
                  {BACHILLERATO_BRANCHES.map((b) => (
                    <Pill key={b} label={b} selected={branch === b} onPress={() => setBranch(b)} />
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
                  <View key={`${subject.name}-${index}`}>
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
                  </View>
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
              <Text style={styles.estimateRange}>
                {estimate.range[0].toFixed(1).replace('.', ',')} –{' '}
                {estimate.range[1].toFixed(1).replace('.', ',')}
              </Text>
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

            <View style={{ marginTop: 24, gap: 10 }}>
              <Button
                title="Permitir notificaciones"
                fullWidth
                onPress={async () => {
                  const granted = await requestPermissions();
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

      case 7:
        return (
          <>
            <Text style={styles.title}>Empieza con algo concreto</Text>
            <Text style={styles.lead}>Elige una de las dos. Podrás añadir más luego.</Text>

            <View style={styles.pillWrap}>
              <Pill
                label="Crear mi primer examen"
                selected={goal === 'exam'}
                onPress={() => setGoal('exam')}
              />
              <Pill
                label="Planificar una sesión"
                selected={goal === 'session'}
                onPress={() => setGoal('session')}
              />
            </View>

            {goal ? (
              <>
                <Text style={styles.fieldLabel}>Asignatura</Text>
                <View style={styles.chipWrap}>
                  {subjects.map((subject, index) => (
                    <TouchableOpacity
                      key={`${subject.name}-${index}`}
                      activeOpacity={0.8}
                      onPress={() => setGoalSubject(index)}
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
              </>
            ) : null}

            {goal === 'exam' ? (
              <>
                <View style={{ marginTop: 20 }}>
                  <Input
                    label="¿De qué es el examen?"
                    value={examName}
                    onChangeText={setExamName}
                    placeholder="Ej. Tema 4 y 5"
                    autoCapitalize="sentences"
                  />
                </View>
                <Text style={styles.fieldLabel}>¿Cuándo es?</Text>
                <CalendarPicker value={examDate} onChange={setExamDate} />
                {isBefore(startOfDay(examDate), startOfDay(new Date())) ? (
                  <Text style={styles.error}>La fecha no puede estar en el pasado.</Text>
                ) : (
                  <Text style={styles.hint}>
                    {format(examDate, "EEEE d 'de' MMMM", { locale: es })}
                  </Text>
                )}
              </>
            ) : null}

            {goal === 'session' ? (
              <>
                <Text style={styles.fieldLabel}>Duración</Text>
                <View style={styles.pillWrap}>
                  {DURATIONS.map((value) => (
                    <Pill
                      key={value}
                      label={`${value} min`}
                      selected={duration === value}
                      onPress={() => setDuration(value)}
                    />
                  ))}
                </View>
                <Text style={styles.fieldLabel}>¿Cuándo?</Text>
                <View style={styles.pillWrap}>
                  <Pill label="Hoy" selected={when === 'today'} onPress={() => setWhen('today')} />
                  <Pill
                    label="Mañana"
                    selected={when === 'tomorrow'}
                    onPress={() => setWhen('tomorrow')}
                  />
                </View>
              </>
            ) : null}
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
            <View style={[styles.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
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
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View key={step} entering={FadeInDown.duration(280)}>
            {renderStep()}
          </Animated.View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
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

  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
