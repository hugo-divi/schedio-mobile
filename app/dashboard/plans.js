import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Lock,
  Plus,
  Clock,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Check,
  Crown,
  FileText,
  AlertCircle,
  CloudUpload,
} from 'lucide-react-native';
import Animated, { LinearTransition, FadeIn, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { startOfWeek, addDays, isSameDay, isToday, format } from 'date-fns';
import { es } from 'date-fns/locale';

import { tokens } from '../../theme/tokens';
import useUserStore, { FREE_WEEKLY_UPLOADS, PRIME_WEEKLY_UPLOADS } from '../../store/userStore';
import useAuthStore from '../../store/authStore';
import UploadModal from '../../components/UploadModal';
import ResourceList from '../../components/ResourceList';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import BottomSheet from '../../components/ui/BottomSheet';
import SectionTitle from '../../components/ui/SectionTitle';
import { PremiumBadge } from '../../components/ui/Chip';

const font = tokens.typography.families.inter;

// Replaces LayoutAnimation.Presets.easeInEaseOut, which no longer does anything
// under the New Architecture. Built once at module scope so every item shares the
// same config object instead of rebuilding it on each render.
const LIST_TRANSITION = LinearTransition.duration(250);

// The generator plans forward from today (HORIZON_DAYS = 30) and reconcilePlan
// rebuilds from it daily, so there is no past to navigate back into. Free stays
// at this week + next (the "2 semanas" sold in plus.js); Prime can reach into
// week 4 — still safely inside the 30-day horizon the generator already fills,
// so no change to plan generation itself. A true trimester view needs that
// horizon extended and is a separate, bigger piece of work.
const MAX_WEEK_OFFSET_FREE = 1;
const MAX_WEEK_OFFSET_PRIME = 3;

const DURATION_OPTIONS = [15, 30, 45, 60];

const SUBJECT_FALLBACK_COLOR = tokens.colors.textDisabled;
const UNFILED = '__unfiled__';

const initialOf = (name) => (name || '?').charAt(0).toUpperCase();

const weekDays = (offset) => {
  const monday = startOfWeek(addDays(new Date(), offset * 7), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
};

const weekRangeLabel = (days) => {
  const first = days[0];
  const last = days[6];
  const sameMonth = first.getMonth() === last.getMonth();
  const left = format(first, sameMonth ? 'd' : 'd MMM', { locale: es });
  const right = format(last, 'd MMM', { locale: es });
  return `${left} – ${right}`;
};

const minutesOf = (tasks) => tasks.reduce((total, t) => total + (t.duration || 0), 0);

const formatTotal = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${m}min`;
};

/**
 * `planDiagnostics.unscheduled` holds exams with the minutes still owed after
 * the scheduler ran out of room — not tasks. Naming the exam and the shortfall
 * is the whole value of the diagnostic; a bare count told the student nothing
 * they could act on.
 */
const shortfallNote = (unscheduled) => {
  if (unscheduled.length === 1) {
    const [only] = unscheduled;
    const subject = only.subjectName ? ` (${only.subjectName})` : '';
    return `Faltan ${formatTotal(only.minutesShort)} para cubrir ${only.examName}${subject}.`;
  }
  const total = unscheduled.reduce((sum, item) => sum + (item.minutesShort || 0), 0);
  return `Faltan ${formatTotal(total)} para cubrir ${unscheduled.length} exámenes en los días disponibles.`;
};

// ── Pieces ──────────────────────────────────────────────────────────────────

function NavArrow({ direction, disabled, onPress, label }) {
  const Icon = direction === 'left' ? ChevronLeft : ChevronRight;
  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={styles.navArrow}
    >
      <Icon
        size={18}
        strokeWidth={1.75}
        color={disabled ? tokens.colors.textDisabled : tokens.colors.textSecondary}
      />
    </TouchableOpacity>
  );
}

function Segmented({ value, onChange, options }) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <TouchableOpacity
            key={option.key}
            onPress={() => onChange(option.key)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/**
 * The AI planner is deliberately inert. CLAUDE.md puts the coach outside the
 * initial launch, so this advertises it rather than running it — the store
 * still carries `generateAiPlans` for when it ships.
 */
function AiTeaser() {
  return (
    <Card padding={16}>
      <View style={styles.teaserHead}>
        <Lock size={18} strokeWidth={1.75} color={tokens.colors.textDisabled} />
        <Text style={styles.teaserTitle}>Planificar con IA</Text>
        <View style={{ marginLeft: 'auto' }}>
          <PremiumBadge>Prime</PremiumBadge>
        </View>
      </View>
      <Text style={styles.teaserNote}>Próximamente</Text>
      <View style={styles.teaserButton}>
        <Text style={styles.teaserButtonText}>GENERAR</Text>
      </View>
    </Card>
  );
}

function TaskRow({ task, highlighted, onPress, onEdit, onToggle }) {
  const color = task.subjectColor || SUBJECT_FALLBACK_COLOR;
  const meta = [task.subjectName, task.type === 'manual' ? 'suelta' : task.phase]
    .filter(Boolean)
    .join(' · ');

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      onLongPress={onEdit}
      delayLongPress={450}
      style={[
        styles.taskRow,
        highlighted && styles.taskRowHighlighted,
        task.isPanicMode && styles.taskRowPanic,
      ]}
    >
      <View style={[styles.taskAvatar, { backgroundColor: color }]}>
        <Text style={styles.taskInitial}>{initialOf(task.subjectName)}</Text>
      </View>

      <View style={styles.taskBody}>
        <Text style={[styles.taskText, task.completed && styles.taskTextDone]} numberOfLines={2}>
          {task.text}
        </Text>
        <View style={styles.taskMetaRow}>
          {task.isPanicMode ? (
            <AlertCircle size={11} color={tokens.colors.danger} strokeWidth={2} />
          ) : null}
          <Text style={[styles.taskMeta, task.isPanicMode && { color: tokens.colors.danger }]}>
            {meta}
          </Text>
        </View>
      </View>

      <View style={styles.taskDuration}>
        <Clock size={14} strokeWidth={1.75} color={tokens.colors.textSecondary} />
        <Text style={styles.taskDurationText}>{task.duration || 25}′</Text>
      </View>

      {/* Not in the mock, kept on purpose: ticking a task is what awards the XP
          and feeds the plan overrides and the home screen's progress. */}
      <TouchableOpacity
        onPress={onToggle}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: !!task.completed }}
        style={[styles.taskCheck, task.completed && styles.taskCheckOn]}
      >
        {task.completed ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function DayBlock({ day, tasks, highlightId, onPressTask, onEditTask, onToggleTask }) {
  const total = minutesOf(tasks);
  const today = isToday(day);

  return (
    <Animated.View layout={LIST_TRANSITION} style={styles.dayBlock}>
      <View style={[styles.dayPill, today && styles.dayPillToday]}>
        <Text style={[styles.dayLabel, today && { color: tokens.colors.accent }]}>
          {format(day, 'EEEE d', { locale: es })}
        </Text>
        {today ? <Text style={styles.dayToday}>Hoy</Text> : null}
        {total > 0 ? (
          <Text style={[styles.dayTotal, today && { color: tokens.colors.accent }]}>
            {total} min
          </Text>
        ) : null}
      </View>

      {tasks.length === 0 ? (
        <Text style={styles.dayEmpty}>Día libre — sin tareas asignadas</Text>
      ) : (
        <View style={styles.dayTasks}>
          {tasks.map((task) => (
            <Animated.View
              key={task.id}
              layout={LIST_TRANSITION}
              entering={FadeIn.duration(180)}
              exiting={FadeOut.duration(150)}
            >
              <TaskRow
                task={task}
                highlighted={
                  !!highlightId && (task.examId === highlightId || task.id === highlightId)
                }
                onPress={() => onPressTask(task)}
                onEdit={() => onEditTask(task)}
                onToggle={() => onToggleTask(task)}
              />
            </Animated.View>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

function TaskSheet({ visible, onClose, days, subjects, editing, onSave, onDelete }) {
  const [text, setText] = useState('');
  const [date, setDate] = useState(days[0]);
  const [subjectId, setSubjectId] = useState(null);
  const [duration, setDuration] = useState(30);

  // Re-seed every time the sheet opens, so editing one task never shows the
  // previous one's values.
  useEffect(() => {
    if (!visible) return;
    setText(editing?.text ?? '');
    setDate(editing ? new Date(editing.date) : days[0]);
    setSubjectId(editing?.subjectId ?? null);
    setDuration(editing?.duration ?? 30);
  }, [visible, editing, days]);

  const canSave = text.trim().length > 0;

  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard>
      <Text style={styles.sheetTitle}>{editing ? 'Editar tarea' : 'Añadir tarea suelta'}</Text>

      {/* The scheduler's own explanation for a generated task. It already
          computes this; there was nowhere in the UI showing it. */}
      {editing?.reason ? (
        <View style={styles.reasonBox}>
          <Text style={styles.reasonLabel}>Por qué está en tu plan</Text>
          <Text style={styles.reasonText}>{editing.reason}</Text>
        </View>
      ) : null}

      <Text style={styles.fieldLabel}>Tarea</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej. Terminar resumen de Biología"
        placeholderTextColor={tokens.colors.textDisabled}
        value={text}
        onChangeText={setText}
      />

      <Text style={styles.fieldLabel}>Día</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {days.map((day) => {
          const active = isSameDay(day, date);
          return (
            <TouchableOpacity
              key={day.toISOString()}
              onPress={() => setDate(day)}
              activeOpacity={0.8}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextAccent]}>
                {format(day, 'EEE d', { locale: es })}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={styles.fieldLabel}>Materia</Text>
      <View style={styles.chipWrap}>
        {subjects.map((subject) => {
          const active = subject.id === subjectId;
          return (
            <TouchableOpacity
              key={subject.id}
              onPress={() => setSubjectId(active ? null : subject.id)}
              activeOpacity={0.8}
              style={[styles.chip, styles.chipWithDot, active && styles.chipActive]}
            >
              <View
                style={[
                  styles.chipDot,
                  { backgroundColor: subject.color || SUBJECT_FALLBACK_COLOR },
                ]}
              />
              <Text style={[styles.chipText, active && styles.chipTextPrimary]}>
                {subject.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.fieldLabel}>Duración</Text>
      <View style={styles.durationRow}>
        {DURATION_OPTIONS.map((value) => {
          const active = value === duration;
          return (
            <TouchableOpacity
              key={value}
              onPress={() => setDuration(value)}
              activeOpacity={0.8}
              style={[styles.durationChip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextAccent]}>{value} min</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ marginTop: 24 }}>
        <Button
          title={editing ? 'Guardar cambios' : 'Añadir al plan'}
          fullWidth
          disabled={!canSave}
          onPress={() => onSave({ text: text.trim(), date, subjectId, duration })}
        />
      </View>

      {editing ? (
        <View style={{ marginTop: 10 }}>
          <Button
            title="Eliminar del plan"
            variant="secondary"
            fullWidth
            textColor={tokens.colors.danger}
            onPress={onDelete}
          />
        </View>
      ) : null}
    </BottomSheet>
  );
}

function SubjectFolder({ subject, files, expanded, onToggle, onUpload, onDeleteFile }) {
  return (
    <Animated.View layout={LIST_TRANSITION}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onToggle}
        style={styles.folderRow}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <View
          style={[
            styles.folderAvatar,
            { backgroundColor: subject.color || SUBJECT_FALLBACK_COLOR },
          ]}
        >
          <Text style={styles.folderInitial}>{initialOf(subject.name)}</Text>
        </View>
        <View style={styles.folderBody}>
          <Text style={styles.folderName} numberOfLines={1}>
            {subject.name}
          </Text>
          <View style={styles.folderMetaRow}>
            <FileText size={13} strokeWidth={1.75} color={tokens.colors.textSecondary} />
            <Text style={styles.folderMeta}>
              {files.length} {files.length === 1 ? 'material' : 'materiales'}
            </Text>
          </View>
        </View>
        {expanded ? (
          <ChevronDown size={18} strokeWidth={1.75} color={tokens.colors.textSecondary} />
        ) : (
          <ChevronRight size={18} strokeWidth={1.75} color={tokens.colors.textSecondary} />
        )}
      </TouchableOpacity>

      {expanded ? (
        <Animated.View entering={FadeIn.duration(160)} style={styles.folderContent}>
          {files.length > 0 ? (
            <ResourceList resources={files} onDelete={onDeleteFile} isDarkMode />
          ) : (
            <Text style={styles.folderEmpty}>Todavía no hay materiales en esta materia.</Text>
          )}
          {onUpload ? (
            <View style={{ marginTop: 12 }}>
              <Button
                title="Subir material"
                variant="secondary"
                fullWidth
                icon={<CloudUpload size={17} color={tokens.colors.textPrimary} />}
                onPress={onUpload}
              />
            </View>
          ) : null}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function PlansScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const isPrime = useAuthStore((state) => state.isPrime);

  // One selector per key rather than destructuring the store: destructuring
  // subscribed this screen to every write, so it redrew whenever anything at
  // all changed. The action references are stable, so selecting them costs
  // nothing.
  const microplans = useUserStore((state) => state.microplans);
  const storeLoading = useUserStore((state) => state.loading);
  const resources = useUserStore((state) => state.resources);
  const subjects = useUserStore((state) => state.subjects);
  const planDiagnostics = useUserStore((state) => state.planDiagnostics);
  const uploadsHistory = useUserStore((state) => state.uploadsHistory);

  const params = useLocalSearchParams();
  const highlightId = params.highlightId;

  const [tab, setTab] = useState('planes');
  const [weekOffset, setWeekOffset] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [uploadVisible, setUploadVisible] = useState(false);
  const [uploadSubjectId, setUploadSubjectId] = useState(null);
  const [openFolder, setOpenFolder] = useState(null);

  const days = useMemo(() => weekDays(weekOffset), [weekOffset]);

  // Tasks of the visible week, bucketed by day.
  const tasksByDay = useMemo(() => {
    const buckets = days.map(() => []);
    (microplans || []).forEach((task) => {
      if (!task?.date) return;
      const when = new Date(task.date);
      const index = days.findIndex((day) => isSameDay(day, when));
      if (index !== -1) buckets[index].push(task);
    });
    return buckets;
  }, [microplans, days]);

  const weekTotal = useMemo(
    () => tasksByDay.reduce((sum, tasks) => sum + minutesOf(tasks), 0),
    [tasksByDay]
  );

  const weekTaskCount = useMemo(
    () => tasksByDay.reduce((sum, tasks) => sum + tasks.length, 0),
    [tasksByDay]
  );

  // Arriving from the home screen's "ver en el plan": jump to whichever week
  // actually holds the task, otherwise the highlight lands off-screen.
  useEffect(() => {
    if (!highlightId) return;
    const target = (microplans || []).find(
      (task) => task.examId === highlightId || task.id === highlightId
    );
    if (!target?.date) return;
    const nextWeek = weekDays(1);
    if (nextWeek.some((day) => isSameDay(day, new Date(target.date)))) setWeekOffset(1);
  }, [highlightId, microplans]);

  const uploadsUsed = useMemo(() => {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return (uploadsHistory || []).filter((timestamp) => timestamp > oneWeekAgo).length;
  }, [uploadsHistory]);

  // Prime raised the ceiling (15/week) but didn't remove it — still worth showing.
  const uploadLimit = isPrime ? PRIME_WEEKLY_UPLOADS : FREE_WEEKLY_UPLOADS;
  const maxWeekOffset = isPrime ? MAX_WEEK_OFFSET_PRIME : MAX_WEEK_OFFSET_FREE;

  // A lapsed subscription shouldn't leave the view stranded past the free ceiling.
  useEffect(() => {
    setWeekOffset((o) => Math.min(o, maxWeekOffset));
  }, [maxWeekOffset]);

  // Files grouped by the subject they were filed under. Anything uploaded
  // before subjects existed on resources lands in its own group rather than
  // disappearing.
  const folders = useMemo(() => {
    const byId = new Map();
    subjects.forEach((subject) => byId.set(subject.id, { subject, files: [] }));
    byId.set(UNFILED, {
      subject: { id: UNFILED, name: 'Sin materia', color: SUBJECT_FALLBACK_COLOR },
      files: [],
    });

    (resources || []).forEach((resource) => {
      const key = resource.subjectId && byId.has(resource.subjectId) ? resource.subjectId : UNFILED;
      byId.get(key).files.push(resource);
    });

    return Array.from(byId.values()).filter(
      (folder) => folder.subject.id !== UNFILED || folder.files.length > 0
    );
  }, [subjects, resources]);

  useEffect(() => {
    if (user) useUserStore.getState().initDailyMicroplans(user.uid);
  }, [user]);

  // ── Task handlers ──

  const openSession = (task) => {
    // autoStart needs a subject to resolve; a manual task without one would
    // land on the setup screen with the deep-link params silently ignored, so
    // it opens there deliberately instead.
    const params = task.subjectId
      ? {
          subjectId: task.subjectId,
          autoStart: 'true',
          duration: String(task.duration || 25),
          goal: task.text,
          taskId: task.id,
        }
      : {};
    router.push({ pathname: '/dashboard/study', params });
  };

  const toggleTask = (task) => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    useUserStore.getState().completeMicroTask(user?.uid, task.id);
  };

  const openEditor = (task) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    setEditingTask(task);
    setSheetOpen(true);
  };

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setEditingTask(null);
  }, []);

  const saveTask = async ({ text, date, subjectId, duration }) => {
    const subject = subjects.find((s) => s.id === subjectId) || null;
    const fields = {
      text,
      date: date.toISOString(),
      duration,
      subjectId: subject?.id ?? null,
      subjectName: subject?.name ?? 'General',
      subjectColor: subject?.color ?? SUBJECT_FALLBACK_COLOR,
    };

    if (editingTask) {
      await useUserStore.getState().updateMicroTask(user?.uid, editingTask.id, fields);
    } else {
      await useUserStore.getState().addManualTask(user?.uid, fields);
    }
    closeSheet();
  };

  const deleteTask = () => {
    const task = editingTask;
    closeSheet();
    if (task) useUserStore.getState().deleteMicroTask(user?.uid, task.id);
  };

  // ── Mochila handlers ──

  const handleUploadSuccess = async (fileData) => {
    if (!user) return;
    await useUserStore.getState().addResource(user.uid, fileData);
  };

  const deleteResource = (resource) =>
    useUserStore.getState().removeResource(user?.uid, resource.path);

  // ── Render ──

  const renderPlanes = () => (
    <View style={styles.tabBody}>
      <AiTeaser />

      <View>
        <SectionTitle>Planes automáticos</SectionTitle>
        <Text style={styles.sectionNote}>
          Repartidos por prioridad según tus exámenes y entregas. Mantén pulsada una tarea para
          editarla.
        </Text>
      </View>

      <Card padding={16}>
        <View style={styles.totalRow}>
          <Text style={styles.totalValue}>{formatTotal(weekTotal)}</Text>
          <Text style={styles.totalLabel}>
            {weekOffset === 0
              ? 'de estudio planificado esta semana'
              : 'planificado la semana que viene'}
          </Text>
        </View>
        {/* The scheduler is work-conserving, so leftovers are a real finding
            about the week rather than noise. It was only ever logged. */}
        {weekOffset === 0 && planDiagnostics?.unscheduled?.length > 0 ? (
          <Text style={styles.diagnosticsNote}>{shortfallNote(planDiagnostics.unscheduled)}</Text>
        ) : null}
      </Card>

      {storeLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={tokens.colors.accent} />
          <Text style={styles.centeredText}>Generando tu plan…</Text>
        </View>
      ) : weekTaskCount === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Semana sin tareas</Text>
          <Text style={styles.centeredText}>
            Añade exámenes desde el calendario y el plan se genera solo, o crea una tarea suelta.
          </Text>
        </View>
      ) : (
        <View style={styles.days}>
          {days.map((day, index) => (
            <DayBlock
              key={day.toISOString()}
              day={day}
              tasks={tasksByDay[index]}
              highlightId={highlightId}
              onPressTask={openSession}
              onEditTask={openEditor}
              onToggleTask={toggleTask}
            />
          ))}
        </View>
      )}

      <Button
        title="Añadir tarea suelta"
        variant="secondary"
        fullWidth
        icon={<Plus size={17} color={tokens.colors.textPrimary} />}
        onPress={() => {
          setEditingTask(null);
          setSheetOpen(true);
        }}
      />
    </View>
  );

  const renderMochila = () => (
    <View style={styles.tabBody}>
      <View>
        <SectionTitle>Mis materias</SectionTitle>
        <Text style={styles.sectionNote}>Apuntes y materiales guardados por asignatura.</Text>
      </View>

      {folders.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Aún no tienes materias</Text>
          <Text style={styles.centeredText}>
            Añade tus asignaturas y podrás guardar apuntes en cada una.
          </Text>
        </View>
      ) : (
        <View style={styles.folders}>
          {folders.map(({ subject, files }) => (
            <SubjectFolder
              key={subject.id}
              subject={subject}
              files={files}
              expanded={openFolder === subject.id}
              onToggle={() =>
                setOpenFolder((current) => (current === subject.id ? null : subject.id))
              }
              onUpload={
                subject.id === UNFILED
                  ? null
                  : () => {
                      setUploadSubjectId(subject.id);
                      setUploadVisible(true);
                    }
              }
              onDeleteFile={deleteResource}
            />
          ))}
        </View>
      )}

      <Button
        title="Añadir materia"
        variant="secondary"
        fullWidth
        icon={<Plus size={17} color={tokens.colors.textPrimary} />}
        onPress={() => router.push('/dashboard/profile')}
      />

      {/* The mock showed a GB quota. There isn't one: the allowance is a
          number of uploads per rolling week (3 free, 15 Prime), which is
          what this reports. */}
      <View style={styles.quota}>
        <View style={styles.quotaHead}>
          <Text style={styles.quotaText}>
            {uploadsUsed} de {uploadLimit} subidas esta semana
          </Text>
          <Text style={styles.quotaText}>
            {Math.round((Math.min(uploadsUsed, uploadLimit) / uploadLimit) * 100)}%
          </Text>
        </View>
        <View style={styles.quotaTrack}>
          <View
            style={[
              styles.quotaFill,
              {
                width: `${Math.min(100, (uploadsUsed / uploadLimit) * 100)}%`,
              },
            ]}
          />
        </View>
      </View>

      {isPrime ? null : (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push('/plus')}
          style={styles.primeCard}
        >
          <View style={styles.primeIcon}>
            <Crown size={19} strokeWidth={1.75} color={tokens.colors.premiumText} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.primeTitle}>¿Necesitas más almacenamiento?</Text>
            <Text style={styles.primeBody}>Con Prime guardas más apuntes en cada materia.</Text>
          </View>
          <ChevronRight size={18} strokeWidth={1.75} color={tokens.colors.premiumText} />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.screenTitle}>Plan</Text>
          <View style={styles.weekNav}>
            <NavArrow
              direction="left"
              label="Semana anterior"
              disabled={weekOffset <= 0}
              onPress={() => setWeekOffset((o) => Math.max(0, o - 1))}
            />
            <Text style={styles.weekRange}>{weekRangeLabel(days)}</Text>
            <NavArrow
              direction="right"
              label="Semana siguiente"
              disabled={weekOffset >= maxWeekOffset}
              onPress={() => setWeekOffset((o) => Math.min(maxWeekOffset, o + 1))}
            />
          </View>
        </View>

        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { key: 'planes', label: 'Planes' },
            { key: 'mochila', label: 'Mochila' },
          ]}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {tab === 'planes' ? renderPlanes() : renderMochila()}
      </ScrollView>

      <TaskSheet
        visible={sheetOpen}
        onClose={closeSheet}
        days={days}
        subjects={subjects}
        editing={editingTask}
        onSave={saveTask}
        onDelete={deleteTask}
      />

      <UploadModal
        visible={uploadVisible}
        onClose={() => setUploadVisible(false)}
        onUploadSuccess={handleUploadSuccess}
        subjects={subjects}
        initialSubjectId={uploadSubjectId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingBottom: 4,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  screenTitle: {
    fontFamily: font.bold,
    fontSize: tokens.typography.screenTitle.size,
    color: tokens.colors.textPrimary,
  },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  weekRange: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
    minWidth: 96,
    textAlign: 'center',
  },
  navArrow: {
    width: 30,
    height: 30,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Segmented control
  segmented: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.pill,
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: tokens.colors.accent,
  },
  segmentText: {
    fontFamily: font.semibold,
    fontSize: 14,
    color: tokens.colors.textSecondary,
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },

  // Body
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
  },
  tabBody: {
    gap: 32,
  },
  sectionNote: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.textSecondary,
  },

  // AI teaser
  teaserHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  teaserTitle: {
    fontFamily: font.semibold,
    fontSize: 16,
    color: tokens.colors.textSecondary,
  },
  teaserNote: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textDisabled,
    marginBottom: 14,
  },
  teaserButton: {
    paddingVertical: 12,
    borderRadius: tokens.radius.btn,
    backgroundColor: tokens.colors.borderDefault,
    alignItems: 'center',
  },
  teaserButtonText: {
    fontFamily: font.semibold,
    fontSize: 14,
    letterSpacing: 0.6,
    color: tokens.colors.textDisabled,
  },

  // Weekly total
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  totalValue: {
    fontFamily: tokens.typography.families.display,
    fontSize: 40,
    letterSpacing: 0.5,
    color: tokens.colors.textPrimary,
    flexShrink: 0,
  },
  totalLabel: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
  diagnosticsNote: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.premiumText,
    marginTop: 10,
  },

  // Days
  days: {
    gap: 24,
  },
  dayBlock: {
    gap: 10,
  },
  dayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
  },
  dayPillToday: {
    borderColor: tokens.colors.accentSoftBorder,
    backgroundColor: tokens.colors.accentSoftBg,
  },
  dayLabel: {
    fontFamily: font.semibold,
    fontSize: 14,
    color: tokens.colors.textPrimary,
    textTransform: 'capitalize',
  },
  dayToday: {
    fontFamily: font.semibold,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: tokens.colors.accent,
  },
  dayTotal: {
    fontFamily: font.medium,
    fontSize: 12,
    color: tokens.colors.textSecondary,
  },
  dayEmpty: {
    fontFamily: font.regular,
    fontSize: 13,
    color: tokens.colors.textDisabled,
    paddingLeft: 2,
  },
  dayTasks: {
    gap: 8,
  },

  // Task row
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
  },
  // Deep link from the home screen ("ver en el plan") lands on a task.
  taskRowHighlighted: {
    borderColor: tokens.colors.accent,
    backgroundColor: tokens.colors.accentSoftBg,
  },
  taskRowPanic: {
    borderColor: tokens.colors.danger,
  },
  taskAvatar: {
    width: 30,
    height: 30,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskInitial: {
    fontFamily: font.bold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  taskBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  taskText: {
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 19,
    color: tokens.colors.textPrimary,
  },
  taskTextDone: {
    color: tokens.colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  taskMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  taskMeta: {
    fontFamily: font.medium,
    fontSize: 12,
    color: tokens.colors.textSecondary,
  },
  taskDuration: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  taskDurationText: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: tokens.colors.textSecondary,
  },
  taskCheck: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: tokens.colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskCheckOn: {
    backgroundColor: tokens.colors.accent,
    borderColor: tokens.colors.accent,
  },

  // Sheet
  sheetTitle: {
    fontFamily: font.bold,
    fontSize: 20,
    color: tokens.colors.textPrimary,
    marginBottom: 16,
  },
  reasonBox: {
    padding: 12,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.accentSoftBg,
    borderWidth: 1,
    borderColor: tokens.colors.accentSoftBorder,
    marginBottom: 16,
  },
  reasonLabel: {
    fontFamily: font.semibold,
    fontSize: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: tokens.colors.accent,
    marginBottom: 3,
  },
  reasonText: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.textSecondary,
  },
  fieldLabel: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
    marginBottom: 8,
    marginTop: 16,
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
  chipRow: {
    gap: 6,
    paddingRight: 8,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
  },
  chipWithDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  chipActive: {
    backgroundColor: tokens.colors.accentSoftBg,
    borderColor: tokens.colors.accentSoftBorder,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipText: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
    textTransform: 'capitalize',
  },
  chipTextAccent: {
    fontFamily: font.semibold,
    color: tokens.colors.accent,
  },
  chipTextPrimary: {
    color: tokens.colors.textPrimary,
  },
  durationRow: {
    flexDirection: 'row',
    gap: 6,
  },
  durationChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    alignItems: 'center',
  },

  // Mochila
  folders: {
    gap: 8,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
  },
  folderAvatar: {
    width: 38,
    height: 38,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderInitial: {
    fontFamily: font.bold,
    fontSize: 15,
    color: '#FFFFFF',
  },
  folderBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  folderName: {
    fontFamily: font.medium,
    fontSize: 15,
    color: tokens.colors.textPrimary,
  },
  folderMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  folderMeta: {
    fontFamily: font.medium,
    fontSize: 12,
    color: tokens.colors.textSecondary,
  },
  folderContent: {
    paddingTop: 12,
    paddingHorizontal: 4,
  },
  folderEmpty: {
    fontFamily: font.regular,
    fontSize: 13,
    color: tokens.colors.textDisabled,
  },

  // Quota
  quota: {
    gap: 6,
  },
  quotaHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quotaText: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
  quotaTrack: {
    height: 6,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surfaceHover,
    overflow: 'hidden',
  },
  quotaFill: {
    height: '100%',
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.premiumText,
  },

  // Prime card
  primeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.premiumBorder,
    borderRadius: tokens.radius.card,
  },
  primeIcon: {
    width: 38,
    height: 38,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.premiumBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primeTitle: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: tokens.colors.textPrimary,
    marginBottom: 3,
  },
  primeBody: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 18,
    color: tokens.colors.textSecondary,
  },

  // Shared empty / loading
  centered: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: font.semibold,
    fontSize: 16,
    color: tokens.colors.textPrimary,
  },
  centeredText: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
});
