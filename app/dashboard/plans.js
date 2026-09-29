import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import PlanOnboarding from '../../components/PlanOnboarding';
import {
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
  CalendarDays,
  Target,
} from 'lucide-react-native';
import Animated, { LinearTransition, FadeIn, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { startOfWeek, addDays, isSameDay, isToday, format } from 'date-fns';

import { tokens } from '../../theme/tokens';
import { planReasonsFor, STUDY_PHASES } from '../../services/microplanService';
import { getUpcomingExams } from '../../services/exams';
import {
  dayLoadWidth,
  examProgressFor,
  examSessionsFor,
  examVerdictFor,
  daysUntilLabel,
} from '../../services/planPresentation';
import { daysBetween } from '../../services/priority';
import useUserStore, { FREE_WEEKLY_UPLOADS, PRIME_WEEKLY_UPLOADS } from '../../store/userStore';
import useAuthStore from '../../store/authStore';
import usePrimeIntentStore, { PRIME_INTENTS, PRIME_ORIGINS } from '../../store/primeIntentStore';
import UploadModal from '../../components/UploadModal';
import ResourceList from '../../components/ResourceList';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import BottomSheet from '../../components/ui/BottomSheet';
import SectionTitle from '../../components/ui/SectionTitle';
import useLocaleFormat from '../../hooks/useLocaleFormat';
import { formatDate } from '../../services/localeFormat';

const font = tokens.typography.families.inter;

// Replaces LayoutAnimation.Presets.easeInEaseOut, which no longer does anything
// under the New Architecture. Built once at module scope so every item shares the
// same config object instead of rebuilding it on each render.
const LIST_TRANSITION = LinearTransition.duration(250);

// The generator plans forward from today and reconcilePlan rebuilds from it
// daily, so there is no past to navigate back into. Free stays at this week +
// next (the "2 semanas" sold in plus.js).
//
// These are *calendar week* offsets, not rolling days, so how far ahead an
// offset reaches depends on today's weekday: on a Monday, offset 3 ends 27 days
// out; on a Sunday it ends at 21. Offset 4 is what guarantees a full four weeks
// ahead in every case, and HORIZON_DAYS was raised to 35 to back it — at offset
// 3 against a 30-day horizon the generator was filling days no screen could
// reach. A true trimester view is a separate, bigger piece of work.
const MAX_WEEK_OFFSET_FREE = 1;
const MAX_WEEK_OFFSET_PRIME = 4;

const DURATION_OPTIONS = [15, 30, 45, 60];

const SUBJECT_FALLBACK_COLOR = tokens.colors.textDisabled;
const UNFILED = '__unfiled__';

const initialOf = (name) => (name || '?').charAt(0).toUpperCase();

const weekDays = (offset) => {
  const monday = startOfWeek(addDays(new Date(), offset * 7), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
};

const weekRangeLabel = (days, language) => {
  const first = days[0];
  const last = days[6];
  const sameMonth = first.getMonth() === last.getMonth();
  const left = formatDate(first, sameMonth ? 'day' : 'dayMonth', language);
  const right = formatDate(last, 'dayMonth', language);
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

function TaskRow({ task, highlighted, onPress, onEdit, onToggle }) {
  const color = task.subjectColor || SUBJECT_FALLBACK_COLOR;
  // `reason` es la frase que ya explica el porqué de la tarea (services/
  // microplanService.js `explain()`) — es la misma que se ve al mantener
  // pulsada la tarjeta. Sin ella (tareas sueltas, restos antiguos), se cae a
  // la materia y la fase, que es lo que había antes.
  const meta =
    task.reason ||
    [task.subjectName, task.type === 'manual' ? 'suelta' : task.phase].filter(Boolean).join(' · ');

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
        <View style={styles.taskTitleRow}>
          <Text style={[styles.taskText, task.completed && styles.taskTextDone]} numberOfLines={2}>
            {task.text}
          </Text>
          {task.isOptional ? (
            <View style={styles.optionalBadge}>
              <Text style={styles.optionalBadgeText}>Opcional</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.taskMetaRow}>
          {task.isPanicMode ? (
            <AlertCircle size={11} color={tokens.colors.danger} strokeWidth={2} />
          ) : null}
          <Text
            style={[styles.taskMeta, task.isPanicMode && { color: tokens.colors.danger }]}
            numberOfLines={1}
          >
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

/**
 * La tira de siete días de la semana visible. Sustituye a la lista vertical
 * de días: se elige uno y todo lo demás (ahora / hoy / esta semana) gira en
 * torno a él. Paginar de semana sigue siendo cosa del `NavArrow` del
 * encabezado — esta tira solo elige un día *dentro* de la semana ya visible,
 * por eso no lleva sus propias flechas como en la maqueta: hubiese sido un
 * segundo mecanismo de navegación haciendo el mismo trabajo que el de arriba.
 */
function DayStrip({ days, tasksByDay, selectedIndex, onSelect }) {
  const { formatDate: formatDateLocal, language } = useLocaleFormat();
  return (
    <View style={styles.dayStrip}>
      {days.map((day, index) => {
        const active = index === selectedIndex;
        const minutes = minutesOf(tasksByDay[index]);
        const width = dayLoadWidth(minutes);
        return (
          <TouchableOpacity
            key={day.toISOString()}
            onPress={() => onSelect(index)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.dayCell, active && styles.dayCellActive]}
          >
            <Text style={[styles.dayCellDow, active && styles.dayCellTextActive]}>
              {formatDateLocal(day, 'weekdayNarrow')}
            </Text>
            <Text style={[styles.dayCellNum, active && styles.dayCellTextActive]}>
              {format(day, 'd')}
            </Text>
            <View
              style={[
                styles.dayCellLoad,
                { width: width || 7 },
                width === 0 && styles.dayCellLoadEmpty,
                active && styles.dayCellLoadActive,
              ]}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Alternador Día/Examen. Dos botones con icono, sin texto — igual que en la
 * maqueta: el icono ya dice qué vista es cada uno una vez que se ha tocado
 * una vez. */
function ViewToggle({ value, onChange }) {
  return (
    <View style={styles.viewToggle}>
      <TouchableOpacity
        onPress={() => onChange('day')}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Ver por día"
        accessibilityState={{ selected: value === 'day' }}
        style={[styles.viewToggleBtn, value === 'day' && styles.viewToggleBtnActive]}
      >
        <CalendarDays
          size={15}
          strokeWidth={2}
          color={value === 'day' ? tokens.colors.textPrimary : tokens.colors.textSecondary}
        />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onChange('exam')}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Ver por examen"
        accessibilityState={{ selected: value === 'exam' }}
        style={[styles.viewToggleBtn, value === 'exam' && styles.viewToggleBtnActive]}
      >
        <Target
          size={15}
          strokeWidth={2}
          color={value === 'exam' ? tokens.colors.textPrimary : tokens.colors.textSecondary}
        />
      </TouchableOpacity>
    </View>
  );
}

/**
 * La sección "ahora": lo único que hay que decidir para arrancar. Tres
 * estados — día libre, día ya completado, o la siguiente tarea pendiente con
 * su botón Empezar. El CTA nunca desaparece: en los dos primeros casos ofrece
 * adelantar la próxima sesión pendiente de la semana en vez de dejar la
 * pantalla sin un siguiente paso.
 */
function NowCard({ state, task, onStart, onPull, canPull }) {
  if (state === 'rest') {
    return (
      <View style={styles.nowCard}>
        <Text style={styles.nowTitle}>Día de descanso</Text>
        <Text style={styles.nowWhy}>
          Te lo has ganado. Si te apetece, puedes adelantar trabajo.
        </Text>
        {canPull ? (
          <TouchableOpacity
            onPress={onPull}
            activeOpacity={0.85}
            style={styles.ctaGhost}
            accessibilityRole="button"
          >
            <Text style={styles.ctaGhostText}>Adelantar una sesión</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  if (state === 'empty') {
    return (
      <View style={styles.nowCard}>
        <Text style={styles.nowTitle}>Sin tareas este día</Text>
        <Text style={styles.nowWhy}>
          No hay nada planificado. Puedes adelantar trabajo si quieres.
        </Text>
        {canPull ? (
          <TouchableOpacity
            onPress={onPull}
            activeOpacity={0.85}
            style={styles.ctaGhost}
            accessibilityRole="button"
          >
            <Text style={styles.ctaGhostText}>Adelantar una sesión</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  if (state === 'done') {
    return (
      <View style={styles.nowCard}>
        <Text style={styles.nowTitle}>Día completado</Text>
        <Text style={styles.nowWhy}>Puedes parar aquí.</Text>
        {canPull ? (
          <TouchableOpacity
            onPress={onPull}
            activeOpacity={0.85}
            style={styles.ctaGhost}
            accessibilityRole="button"
          >
            <Text style={styles.ctaGhostText}>Adelantar la siguiente</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  const color = task.subjectColor || SUBJECT_FALLBACK_COLOR;
  return (
    <View style={[styles.nowCard, styles.nowCardActive]}>
      <View style={styles.nowHead}>
        <View style={[styles.nowDot, { backgroundColor: color }]} />
        <Text style={styles.nowSubject} numberOfLines={1}>
          {task.subjectName}
        </Text>
        <Text style={styles.nowMinutes}>{task.duration} min</Text>
      </View>
      <Text style={styles.nowTitle}>{task.text}</Text>
      {task.reason ? <Text style={styles.nowWhy}>{task.reason}</Text> : null}
      <TouchableOpacity
        onPress={onStart}
        activeOpacity={0.9}
        style={styles.ctaPrimary}
        accessibilityRole="button"
      >
        <Text style={styles.ctaPrimaryText}>Empezar · {task.duration} min</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Una fila de "esta semana": otro día que no es el seleccionado, resumido en
 * una línea — materias, no puntos, y sus minutos. Tocarla salta a ese día. */
function WeekRow({ label, isRest, isToday: dayIsToday, allDone, subjectNames, minutes, onPress }) {
  if (isRest) {
    return (
      <View style={[styles.weekRow, styles.weekRowRest]}>
        <Text style={styles.weekRowDay}>{label}</Text>
        <Text style={styles.weekRowRestText}>descanso</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.weekRow, dayIsToday && styles.weekRowToday]}
    >
      <Text style={[styles.weekRowDay, dayIsToday && styles.weekRowDayToday]}>{label}</Text>
      <Text style={[styles.weekRowNames, allDone && styles.weekRowNamesDone]} numberOfLines={1}>
        {subjectNames}
        {allDone ? ' · hecho' : ''}
      </Text>
      <Text style={styles.weekRowMinutes}>{minutes}′</Text>
    </TouchableOpacity>
  );
}

/** Una tarjeta de examen, para la vista "por examen": sesiones hechas/totales,
 * la barra de progreso, la pista de las cuatro fases y, debajo, en qué fase
 * está y qué le queda. */
function ExamCard({ exam, onPress }) {
  const color = exam.subjectColor || SUBJECT_FALLBACK_COLOR;
  const pct =
    exam.totalSessions > 0 ? Math.round((exam.doneSessions / exam.totalSessions) * 100) : 0;

  // Era un `View`: tenía todo el aspecto de algo pulsable y no hacía nada.
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ver las sesiones de ${exam.name}`}
      style={[styles.examCard, exam.ready && styles.examCardReady, exam.hot && styles.examCardHot]}
    >
      <View style={styles.examHead}>
        <View style={[styles.examDot, { backgroundColor: color }]} />
        <Text style={styles.examName} numberOfLines={1}>
          {exam.name}
        </Text>
        <Text style={[styles.examDate, exam.hot && styles.examDateHot]}>{exam.dateLabel}</Text>
      </View>

      <View style={styles.examSessionsRow}>
        <Text style={styles.examSessionsValue}>
          {exam.notStarted ? 'Sin empezar' : `${exam.doneSessions} de ${exam.totalSessions}`}
        </Text>
        {exam.ready ? (
          <Text style={styles.examReadyTag}>preparado</Text>
        ) : !exam.notStarted ? (
          <Text style={styles.examSessionsLabel}>sesiones hechas</Text>
        ) : null}
      </View>

      <View style={styles.examTrack}>
        <View
          style={[
            styles.examTrackFill,
            { width: `${exam.notStarted ? 2 : pct}%`, backgroundColor: color },
          ]}
        />
      </View>

      <View style={styles.examPhaseTrack}>
        {STUDY_PHASES.map((phase, index) => (
          <View
            key={phase}
            style={[
              styles.examPhaseDot,
              index < exam.phaseIndex && styles.examPhaseDotDone,
              index === exam.phaseIndex && styles.examPhaseDotAt,
            ]}
          />
        ))}
      </View>

      <View style={styles.examFooter}>
        <Text style={styles.examFooterLeft} numberOfLines={1}>
          {exam.phaseLabel}
        </Text>
        <Text style={styles.examFooterRight} numberOfLines={1}>
          {exam.footerRight}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

/**
 * El detalle de un examen: las dos preguntas que la tarjeta no contesta.
 *
 * "3 de 8 sesiones" no dice *cuándo* son las otras cinco, y el plan está
 * ordenado por día, así que esa lista no existe en ninguna otra pantalla. El
 * veredicto de abajo es el otro dato que la app calculaba y se guardaba: si
 * el trabajo cabe o no en los días que quedan.
 */
function ExamDetailSheet({ visible, onClose, detail }) {
  if (!detail) return null;
  const color = detail.subjectColor || SUBJECT_FALLBACK_COLOR;
  const verdictStyle = {
    ready: styles.verdictReady,
    ontrack: styles.verdictOnTrack,
    behind: styles.verdictBehind,
    short: styles.verdictShort,
    none: styles.verdictNone,
  }[detail.verdict.kind];

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.detailHead}>
        <View style={[styles.examDot, { backgroundColor: color }]} />
        <Text style={styles.detailTitle} numberOfLines={2}>
          {detail.name}
        </Text>
      </View>
      <Text style={styles.detailSubtitle}>
        {detail.subjectName ? `${detail.subjectName} · ` : ''}
        {detail.dateLabel}
      </Text>

      <Text style={styles.detailSectionLabel}>Tus sesiones</Text>

      {detail.sessions.length === 0 ? (
        <Text style={styles.detailEmpty}>
          Todavía no hay ninguna sesión colocada para este examen.
        </Text>
      ) : (
        <View style={styles.detailList}>
          {detail.sessions.map((session) => (
            <View key={session.id} style={styles.detailRow}>
              <Text
                style={[
                  styles.detailDay,
                  session.isToday && styles.detailDayToday,
                  session.overdue && styles.detailDayOverdue,
                ]}
              >
                {session.dayLabel}
              </Text>
              <View style={styles.detailRowMain}>
                <Text
                  style={[styles.detailPhase, session.completed && styles.detailDone]}
                  numberOfLines={1}
                >
                  {session.phaseLabel || 'Sesión'}
                </Text>
                {session.text ? (
                  <Text style={styles.detailText} numberOfLines={2}>
                    {session.text}
                  </Text>
                ) : null}
              </View>
              {session.completed ? (
                <Check size={15} color={tokens.colors.success} strokeWidth={2.5} />
              ) : (
                <Text style={[styles.detailMinutes, session.overdue && styles.detailDayOverdue]}>
                  {session.minutes}′
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      <View style={[styles.verdictBox, verdictStyle]}>
        <Text style={styles.verdictText}>{detail.verdict.text}</Text>
      </View>
    </BottomSheet>
  );
}

function TaskSheet({ visible, onClose, days, subjects, editing, onSave, onDelete }) {
  const { formatDate: formatDateLocal, language } = useLocaleFormat();
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
    <BottomSheet visible={visible} onClose={onClose}>
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
                {formatDateLocal(day, 'weekdayShortDay')}
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
  const { formatDate: formatDateLocal, language } = useLocaleFormat();
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
  const profile = useUserStore((state) => state.profile);

  /**
   * La primera entrada a Planes pregunta tres cosas antes de ensenar nada.
   *
   * Va DETRAS del tour a proposito: los dos se lanzan sobre una cuenta recien
   * hecha y encadenarlos sin condicion los pisaria. Y se corta en cuanto el
   * perfil dice que ya se vio, con un estado local ademas del campo guardado
   * para que la pantalla cambie en el momento y no cuando Firestore conteste.
   */
  const [planOnboardingDone, setPlanOnboardingDone] = useState(false);
  const showPlanOnboarding =
    !planOnboardingDone && !!profile?.hasSeenTour && !profile?.hasSeenPlanOnboarding;

  // No hay una lista de exámenes compartida en el store (cada pantalla la pide
  // por su cuenta, igual que hace Inicio o Perfil); este contador es la señal
  // para volver a pedirla cuando algo la cambia en otro sitio.
  const examRefreshTrigger = useUserStore((state) => state.examRefreshTrigger);

  const params = useLocalSearchParams();
  const highlightId = params.highlightId;

  const [tab, setTab] = useState('planes');
  const [weekOffset, setWeekOffset] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [uploadVisible, setUploadVisible] = useState(false);

  // Reopens the upload sheet after a Prime purchase that the weekly upload
  // limit triggered from the Mochila — the sheet has to close to show the
  // paywall, and without this the student would have to find the button and
  // pick the file again immediately after paying.
  const primeReason = usePrimeIntentStore((state) => state.reason);
  const primeOrigin = usePrimeIntentStore((state) => state.origin);
  const primeFulfilled = usePrimeIntentStore((state) => state.fulfilled);
  useEffect(() => {
    if (
      primeReason === PRIME_INTENTS.MOCHILA &&
      primeOrigin === PRIME_ORIGINS.MOCHILA_TAB &&
      primeFulfilled
    ) {
      usePrimeIntentStore.getState().clearIntent();
      setUploadVisible(true);
    }
  }, [primeReason, primeOrigin, primeFulfilled]);
  const [uploadSubjectId, setUploadSubjectId] = useState(null);
  const [openFolder, setOpenFolder] = useState(null);
  const [planInfoSheet, setPlanInfoSheet] = useState(false);

  // Día / examen — qué se ve dentro de la pestaña Planes.
  const [view, setView] = useState('day');
  // Qué día de la semana visible está abierto. Se recoloca cuando cambia la
  // semana (ver el efecto más abajo), así que no hace falta sincronizarlo a
  // mano en cada sitio que cambia `weekOffset`.
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  const planReasons = useMemo(
    () =>
      planReasonsFor({
        organizationLevel: profile?.organizationLevel,
        reviewFrequency: profile?.reviewFrequency,
      }),
    [profile?.organizationLevel, profile?.reviewFrequency]
  );

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

  // Los días libres del alumno. Mismo valor por defecto que ya usa el
  // planificador (services/microplanService.js) cuando el perfil no trae
  // ninguno — así "es descanso" significa lo mismo aquí que en el algoritmo
  // que decidió no ponerle tareas ese día.
  // El planificador ya no trata ningun dia como inhabil: el fin de semana se
  // planifica como cualquier otro dia. Lo que antes se llamaba "descanso" vive
  // ahora en la racha (dias libres), donde lo unico que hace es que no pase
  // nada si ese dia no cumples. Por eso aqui ya no hay estado de descanso.

  const selectedDay = days[selectedDayIndex] || days[0];
  const selectedDayTasks = tasksByDay[selectedDayIndex] || [];
  const pendingToday = useMemo(
    () => selectedDayTasks.filter((task) => !task.completed),
    [selectedDayTasks]
  );
  const doneCountToday = selectedDayTasks.length - pendingToday.length;
  const remainingMinutesToday = minutesOf(pendingToday);

  // Estado de la tarjeta "ahora": descanso, sin tareas, completado, o la
  // siguiente pendiente.
  const nowState =
    selectedDayTasks.length === 0 ? 'empty' : pendingToday.length === 0 ? 'done' : 'active';

  // El día más próximo (dentro de la semana visible) con algo pendiente, para
  // "adelantar". Solo busca en los días ya cargados: la paginación de semana
  // sigue siendo el mecanismo para ir más lejos, así que no hace falta un
  // salto que cruce semanas.
  const pullTargetIndex = useMemo(() => {
    for (let i = selectedDayIndex + 1; i < tasksByDay.length; i += 1) {
      if (tasksByDay[i].some((task) => !task.completed)) return i;
    }
    return -1;
  }, [tasksByDay, selectedDayIndex]);

  const weekDoneMinutes = useMemo(
    () =>
      tasksByDay.reduce(
        (sum, tasks) =>
          sum + tasks.filter((t) => t.completed).reduce((s, t) => s + (t.duration || 0), 0),
        0
      ),
    [tasksByDay]
  );

  // Una fila por cada día que no es el seleccionado: materias (sin repetir),
  // si es descanso, si ya está todo hecho.
  const weekRows = useMemo(
    () =>
      days
        .map((day, index) => {
          if (index === selectedDayIndex) return null;
          const tasks = tasksByDay[index];
          const label = formatDateLocal(day, 'weekdayLong');
          if (tasks.length === 0) return null;
          const names = Array.from(new Set(tasks.map((t) => t.subjectName).filter(Boolean))).join(
            ', '
          );
          return {
            key: day.toISOString(),
            index,
            label,
            isRest: false,
            isToday: isToday(day),
            allDone: tasks.every((t) => t.completed),
            subjectNames: names,
            minutes: minutesOf(tasks),
          };
        })
        .filter(Boolean),
    [days, tasksByDay, selectedDayIndex]
  );

  /**
   * Qué día abrir: por un enlace desde Inicio ("ver en el plan") o, si no hay
   * ninguno, hoy — y si hoy no cae en la semana visible, el primer día.
   *
   * Un único efecto en vez de dos separados. Tenerlos aparte producía una
   * carrera real: el salto del enlace fijaba el día correcto y, un render
   * después, el efecto que recolocaba el día al cambiar de semana lo pisaba
   * con "hoy" — porque cambiar de semana es exactamente lo que ese mismo
   * salto también hace. Aquí, cuando el objetivo no está en la semana visible
   * el efecto cambia de semana y se vuelve a ejecutar solo (depende de
   * `days`), esta vez encontrándolo.
   */
  useEffect(() => {
    if (highlightId) {
      const target = (microplans || []).find(
        (task) => task.examId === highlightId || task.id === highlightId
      );
      if (target?.date) {
        const targetDate = new Date(target.date);
        const index = days.findIndex((day) => isSameDay(day, targetDate));
        if (index !== -1) {
          setView('day');
          setSelectedDayIndex(index);
          return;
        }
        // Todavía no es la semana correcta: saltar y dejar que este mismo
        // efecto se repita con `days` ya actualizado.
        if (weekOffset === 0) {
          const nextWeek = weekDays(1);
          if (nextWeek.some((day) => isSameDay(day, targetDate))) {
            setWeekOffset(1);
            return;
          }
        }
      }
    }
    const todayIndex = days.findIndex((day) => isToday(day));
    setSelectedDayIndex(todayIndex === -1 ? 0 : todayIndex);
  }, [days, highlightId, microplans, weekOffset]);

  // ── Vista por examen ──
  //
  // No hay una lista de exámenes en el store: se pide igual que en Inicio o
  // Perfil, y se vuelve a pedir cuando `examRefreshTrigger` cambia (un examen
  // creado, editado o calificado en cualquier otra pantalla).
  const [examsList, setExamsList] = useState([]);
  useEffect(() => {
    if (!user || view !== 'exam') return;
    let cancelled = false;
    getUpcomingExams(user.uid, 20)
      .then((list) => {
        if (!cancelled) setExamsList(list);
      })
      .catch((error) => console.warn('No se pudieron cargar los exámenes', error));
    return () => {
      cancelled = true;
    };
  }, [user, view, examRefreshTrigger]);

  const todaysExamIds = useMemo(() => {
    const todayIndex = days.findIndex((day) => isToday(day));
    if (todayIndex === -1) return new Set();
    return new Set(
      tasksByDay[todayIndex].filter((t) => !t.completed && t.examId).map((t) => t.examId)
    );
  }, [days, tasksByDay]);

  // El cálculo en sí vive en services/planPresentation.js — pura función,
  // sin React Native, verificable con Node en scripts/check-plan-screen.mjs.
  const examsWithProgress = useMemo(
    () => examsList.map((exam) => examProgressFor({ exam, subjects, microplans, todaysExamIds })),
    [examsList, subjects, microplans, todaysExamIds]
  );

  // ── Detalle de un examen ──
  //
  // Se guarda el id, no el objeto: así el detalle se recalcula solo cuando el
  // plan cambia (una sesión marcada desde otra pantalla, una regeneración) en
  // vez de quedarse congelado con la foto del momento en que se abrió.
  //
  // `detailOpen` va aparte del id a propósito, igual que en TaskSheet: si al
  // cerrar se borrara el id, el contenido desaparecería de golpe y el sheet no
  // llegaría a animar su salida.
  const [detailExamId, setDetailExamId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const examDetail = useMemo(() => {
    if (!detailExamId) return null;
    const exam = examsList.find((e) => e.id === detailExamId);
    if (!exam) return null;
    const sessions = examSessionsFor({ exam, microplans, language });
    const daysUntil = daysBetween(new Date(), exam.date);
    return {
      id: exam.id,
      name: exam.name,
      subjectName: subjects.find((s) => s.id === exam.subjectId)?.name || '',
      subjectColor: subjects.find((s) => s.id === exam.subjectId)?.color,
      dateLabel: daysUntilLabel(daysUntil),
      sessions,
      verdict: examVerdictFor({ sessions, daysUntil, planDiagnostics, examId: exam.id }),
    };
  }, [detailExamId, examsList, microplans, subjects, planDiagnostics]);

  // Se cuenta sobre los materiales vivos, igual que `canUpload` en el store:
  // borrar un archivo devuelve la subida de esa semana.
  const uploadsUsed = useMemo(() => {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return (resources || []).filter((resource) => {
      const at = Date.parse(resource?.createdAt);
      return Number.isFinite(at) && at > oneWeekAgo;
    }).length;
  }, [resources]);

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

  // Was a plain mount-only effect ([user] never changes during a session), so
  // a plan generated yesterday kept showing until the app was fully killed
  // and relaunched — the only thing that re-ran it. initDailyMicroplans
  // itself already gates on the date (see its `shouldGenerate` check), so
  // re-running it on every return to the tab is safe: it's a no-op except
  // right after the day actually rolls over.
  useFocusEffect(
    useCallback(() => {
      if (user) useUserStore.getState().initDailyMicroplans(user.uid);
    }, [user])
  );

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

  const pullForward = () => {
    if (pullTargetIndex === -1) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    setSelectedDayIndex(pullTargetIndex);
  };

  // ── Mochila handlers ──

  const handleUploadSuccess = async (fileData) => {
    if (!user) return;
    const saved = await useUserStore.getState().addResource(user.uid, fileData);
    // El archivo esta en Storage, pero sin ficha no aparece en la Mochila: hay
    // que decirlo, porque antes la tarjeta se quedaba en pantalla y el material
    // se esfumaba al siguiente arranque.
    if (!saved) {
      Alert.alert(
        'No se pudo guardar',
        'El archivo se subió pero no quedó registrado en tu Mochila. Vuelve a intentarlo.'
      );
    }
  };

  const deleteResource = (resource) =>
    useUserStore.getState().removeResource(user?.uid, resource.path);

  // ── Render ──

  const renderPlanes = () => {
    if (storeLoading) {
      return (
        <View style={styles.tabBody}>
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={tokens.colors.accent} />
            <Text style={styles.centeredText}>Generando tu plan…</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.tabBody}>
        <View style={styles.planesHeadRow}>
          <View style={{ flex: 1 }}>
            <SectionTitle>Planes automáticos</SectionTitle>
          </View>
          <ViewToggle value={view} onChange={setView} />
        </View>

        {view === 'day' ? (
          weekTaskCount === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyTitle}>Semana sin tareas</Text>
              <Text style={styles.centeredText}>
                Añade exámenes desde el calendario y el plan se genera solo, o crea una tarea
                suelta.
              </Text>
            </View>
          ) : (
            <>
              <DayStrip
                days={days}
                tasksByDay={tasksByDay}
                selectedIndex={selectedDayIndex}
                onSelect={setSelectedDayIndex}
              />

              {/* 1 · el paso accionable, primero — antes de cualquier lista. */}
              <NowCard
                state={nowState}
                task={pendingToday[0]}
                onStart={() => openSession(pendingToday[0])}
                onPull={pullForward}
                canPull={pullTargetIndex !== -1}
              />

              <View>
                <View style={styles.capRow}>
                  <Text style={styles.cap}>
                    {isToday(selectedDay)
                      ? 'todo el día'
                      : formatDateLocal(selectedDay, 'weekdayLongDay')}
                  </Text>
                  <Text style={styles.capEm}>
                    {doneCountToday} de {selectedDayTasks.length} ·{' '}
                    {formatTotal(remainingMinutesToday)} restantes
                  </Text>
                </View>

                {selectedDayTasks.length > 0 ? (
                  <View style={styles.dayTasksCard}>
                    {selectedDayTasks.map((task, index) => (
                      <Animated.View
                        key={task.id}
                        layout={LIST_TRANSITION}
                        entering={FadeIn.duration(180)}
                        exiting={FadeOut.duration(150)}
                        style={index > 0 && styles.taskDivider}
                      >
                        <TaskRow
                          task={task}
                          highlighted={
                            !!highlightId &&
                            (task.examId === highlightId || task.id === highlightId)
                          }
                          onPress={() => openSession(task)}
                          onEdit={() => openEditor(task)}
                          onToggle={() => toggleTask(task)}
                        />
                      </Animated.View>
                    ))}
                  </View>
                ) : null}

                <View style={{ marginTop: 10 }}>
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
              </View>

              {/* 2 · la semana, sin cambiar de vista. */}
              <View>
                {/* "esta semana" es literal solo en weekOffset 0. Con Prime se
                    puede mirar hasta 4 semanas por delante (MAX_WEEK_OFFSET_PRIME),
                    así que llamarlo siempre "esta semana" habría sido falso para
                    cualquiera que pagina hacia delante — el código anterior ya
                    distinguía esto para el total, y aquí hace falta lo mismo. */}
                <Text style={styles.cap}>
                  {weekOffset === 0 ? 'esta semana' : `semana del ${weekRangeLabel(days)}`}
                </Text>
                <View style={styles.weeklyRow}>
                  <Text style={styles.weeklyValue}>{formatTotal(weekTotal)}</Text>
                  <Text style={styles.weeklyLabel}>planificados</Text>
                  <Text style={styles.weeklyDone}>{formatTotal(weekDoneMinutes)} hechos</Text>
                </View>
                {planDiagnostics?.unscheduled?.length > 0 ? (
                  <Text style={styles.diagnosticsNote}>
                    {shortfallNote(planDiagnostics.unscheduled)}
                  </Text>
                ) : null}
                <TouchableOpacity onPress={() => setPlanInfoSheet(true)} style={{ marginTop: 8 }}>
                  <Text style={styles.link}>¿Por qué mi plan es así?</Text>
                </TouchableOpacity>

                {weekRows.length > 0 ? (
                  <View style={{ marginTop: 10, gap: 6 }}>
                    {weekRows.map((row) => (
                      <WeekRow
                        key={row.key}
                        label={row.label}
                        isRest={row.isRest}
                        isToday={row.isToday}
                        allDone={row.allDone}
                        subjectNames={row.subjectNames}
                        minutes={row.minutes}
                        onPress={() => setSelectedDayIndex(row.index)}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            </>
          )
        ) : (
          // 3 · los exámenes, siempre visibles — su propia vista, ninguno
          // escondido detrás de nada.
          <View>
            {examsWithProgress.length === 0 ? (
              <View style={styles.centered}>
                <Text style={styles.emptyTitle}>Sin exámenes por delante</Text>
                <Text style={styles.centeredText}>
                  En cuanto añadas uno, aparecerá aquí con sus sesiones.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {examsWithProgress.map((exam) => (
                  <ExamCard
                    key={exam.id}
                    exam={exam}
                    onPress={() => {
                      setDetailExamId(exam.id);
                      setDetailOpen(true);
                    }}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

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

      {/* Prime isn't sold on web yet — same reasoning as the settings.js
          banner and PrimeLimitSheet's button. */}
      {isPrime || Platform.OS === 'web' ? null : (
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

  if (showPlanOnboarding) {
    return (
      <PlanOnboarding
        // Se guarda al cerrar la tercera pregunta (`done: false`) y otra vez al
        // llegar al final. Marcar "visto" solo en el segundo caso es lo que
        // hace que abandonar a medias no cuente como haberlo pasado.
        onFinish={(answers, { done }) => {
          useUserStore.getState().savePlanSurvey(user?.uid, answers, { markSeen: done });
          if (done) setPlanOnboardingDone(true);
        }}
        onOpenStreak={() => router.push('/dashboard/streak')}
        // Irse a poner objetivos cierra el flujo: ya no queda ningun paso
        // detras, y volver de Perfil para ver una pantalla de "listo" seria
        // hacerle dar un rodeo para nada.
        onOpenSubjects={() => {
          useUserStore.getState().savePlanSurvey(user?.uid, null, { markSeen: true });
          setPlanOnboardingDone(true);
          router.push('/dashboard/profile');
        }}
      />
    );
  }

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

      <ExamDetailSheet
        visible={detailOpen && Boolean(examDetail)}
        onClose={() => setDetailOpen(false)}
        detail={examDetail}
      />

      <UploadModal
        visible={uploadVisible}
        onClose={() => setUploadVisible(false)}
        onUploadSuccess={handleUploadSuccess}
        intentOrigin={PRIME_ORIGINS.MOCHILA_TAB}
        subjects={subjects}
        initialSubjectId={uploadSubjectId}
      />

      <BottomSheet
        visible={planInfoSheet}
        onClose={() => setPlanInfoSheet(false)}
        title="Tu plan, explicado"
        subtitle="Sale de dos respuestas que ya diste en el alta."
      >
        <Text style={styles.planInfoBody}>
          Cada día tienes un presupuesto de{' '}
          {planDiagnostics?.dailyCapacity ? `${planDiagnostics.dailyCapacity} min` : 'un tiempo'}, y
          el repaso se reparte antes o después según cómo sueles llevarlo.
        </Text>
        <View style={styles.reasons}>
          {planReasons.map((reason) => (
            <View key={reason} style={styles.reasonRow}>
              <View style={styles.reasonDot} />
              <Text style={styles.reasonText}>{reason}</Text>
            </View>
          ))}
        </View>
      </BottomSheet>
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
    alignItems: 'center',
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

  diagnosticsNote: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.premiumText,
    marginTop: 10,
  },
  link: { fontFamily: font.semibold, fontSize: 13, color: tokens.colors.accent },
  planInfoBody: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 21,
    color: tokens.colors.textSecondary,
    marginBottom: 16,
  },

  // Cabecera de la pestaña Planes: título + alternador Día/Examen
  planesHeadRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  viewToggle: {
    flexDirection: 'row',
    gap: 3,
    padding: 3,
    backgroundColor: tokens.colors.surfaceCard,
    borderRadius: tokens.radius.pill,
  },
  viewToggleBtn: {
    width: 30,
    height: 26,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewToggleBtnActive: {
    backgroundColor: tokens.colors.surfaceHover,
  },

  // Tira de los 7 días de la semana
  dayStrip: {
    flexDirection: 'row',
    gap: 4,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: tokens.radius.btn,
    backgroundColor: tokens.colors.surfaceCard,
  },
  dayCellActive: {
    backgroundColor: tokens.colors.accentSoftBg,
    borderWidth: 1,
    borderColor: tokens.colors.accentSoftBorder,
  },
  dayCellDow: {
    fontFamily: font.medium,
    fontSize: 9,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: tokens.colors.textDisabled,
  },
  dayCellNum: {
    fontFamily: font.semibold,
    fontSize: 13,
    color: tokens.colors.textPrimary,
    marginTop: 1,
    marginBottom: 5,
  },
  dayCellTextActive: {
    color: tokens.colors.accent,
  },
  dayCellLoad: {
    height: 3,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.textDisabled,
  },
  dayCellLoadEmpty: {
    backgroundColor: tokens.colors.surfaceHover,
  },
  dayCellLoadActive: {
    backgroundColor: tokens.colors.accent,
  },

  // Tarjeta "ahora"
  nowCard: {
    padding: 14,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
  },
  nowCardActive: {
    borderColor: tokens.colors.accentSoftBorder,
  },
  nowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 9,
  },
  nowDot: {
    width: 9,
    height: 9,
    borderRadius: tokens.radius.pill,
  },
  nowSubject: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 12,
    color: tokens.colors.textSecondary,
  },
  nowMinutes: {
    fontFamily: font.medium,
    fontSize: 12,
    color: tokens.colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  nowTitle: {
    fontFamily: font.semibold,
    fontSize: 15,
    lineHeight: 20,
    color: tokens.colors.textPrimary,
  },
  nowWhy: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 17,
    color: tokens.colors.textDisabled,
    marginTop: 5,
  },
  ctaPrimary: {
    marginTop: 13,
    paddingVertical: 13,
    borderRadius: tokens.radius.btn,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
  },
  ctaPrimaryText: {
    fontFamily: font.semibold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  ctaGhost: {
    marginTop: 13,
    paddingVertical: 11,
    borderRadius: tokens.radius.btn,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    alignItems: 'center',
  },
  ctaGhostText: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },

  // Cabeceras de sección tipo "cap" (etiqueta pequeña en mayúsculas + extra)
  capRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cap: {
    fontFamily: font.semibold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: tokens.colors.textDisabled,
    marginBottom: 10,
  },
  capEm: {
    fontFamily: font.medium,
    fontSize: 12,
    color: tokens.colors.textSecondary,
    textTransform: 'none',
    letterSpacing: 0,
  },

  // Tarjeta de tareas del día seleccionado — una sola tarjeta con divisores,
  // como la maqueta, en vez de una tarjeta por tarea.
  dayTasksCard: {
    paddingHorizontal: 14,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    overflow: 'hidden',
  },
  // `surfaceHover` en vez de `background`: la maqueta usa un divisor más claro
  // que el fondo de la pantalla (#2E2E2E sobre una tarjeta #242424) — con el
  // fondo puro (#191919) la línea salía demasiado dura contra la tarjeta.
  taskDivider: {
    borderTopWidth: 1,
    borderTopColor: tokens.colors.surfaceHover,
  },

  // Total semanal + filas de "esta semana"
  weeklyRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    padding: 14,
    backgroundColor: tokens.colors.surfaceCard,
    borderRadius: tokens.radius.card,
  },
  weeklyValue: {
    fontFamily: tokens.typography.families.display,
    fontSize: 26,
    color: tokens.colors.textPrimary,
  },
  weeklyLabel: {
    fontFamily: font.medium,
    fontSize: 12,
    color: tokens.colors.textSecondary,
  },
  weeklyDone: {
    marginLeft: 'auto',
    fontFamily: font.medium,
    fontSize: 11,
    color: tokens.colors.textDisabled,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: tokens.colors.surfaceCard,
    borderRadius: tokens.radius.btn,
  },
  weekRowRest: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
  },
  weekRowToday: {
    borderWidth: 1,
    borderColor: tokens.colors.accentSoftBorder,
  },
  weekRowDay: {
    width: 62,
    fontFamily: font.medium,
    fontSize: 12,
    color: tokens.colors.textSecondary,
    textTransform: 'capitalize',
  },
  weekRowDayToday: {
    color: tokens.colors.accent,
  },
  weekRowRestText: {
    fontFamily: font.regular,
    fontSize: 12,
    color: tokens.colors.textDisabled,
  },
  weekRowNames: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 12.5,
    color: tokens.colors.textPrimary,
  },
  weekRowNamesDone: {
    color: tokens.colors.textDisabled,
  },
  weekRowMinutes: {
    fontFamily: font.medium,
    fontSize: 11,
    color: tokens.colors.textDisabled,
    fontVariant: ['tabular-nums'],
  },

  // Vista por examen
  examCard: {
    padding: 13,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.surfaceCard,
  },
  examCardReady: {
    borderWidth: 1,
    borderColor: tokens.colors.accentSoftBorder,
  },
  examCardHot: {
    borderWidth: 1,
    borderColor: 'rgba(216, 96, 74, 0.4)',
  },
  examHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  examDot: {
    width: 9,
    height: 9,
    borderRadius: tokens.radius.pill,
  },
  examName: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textPrimary,
  },
  examDate: {
    fontFamily: font.medium,
    fontSize: 11,
    color: tokens.colors.textSecondary,
  },
  examDateHot: {
    color: tokens.colors.danger,
  },
  examSessionsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 9,
    marginBottom: 7,
  },
  examSessionsValue: {
    fontFamily: tokens.typography.families.display,
    fontSize: 20,
    color: tokens.colors.textPrimary,
  },
  examSessionsLabel: {
    fontFamily: font.regular,
    fontSize: 11,
    color: tokens.colors.textDisabled,
  },
  examReadyTag: {
    fontFamily: font.medium,
    fontSize: 10.5,
    color: tokens.colors.accent,
  },
  examTrack: {
    height: 4,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surfaceHover,
    overflow: 'hidden',
  },
  examTrackFill: {
    height: '100%',
    borderRadius: tokens.radius.pill,
  },
  examPhaseTrack: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 9,
  },
  examPhaseDot: {
    flex: 1,
    height: 3,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surfaceHover,
  },
  examPhaseDotDone: {
    backgroundColor: tokens.colors.textDisabled,
  },
  examPhaseDotAt: {
    backgroundColor: tokens.colors.accent,
  },
  examFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
  },
  examFooterLeft: {
    flexShrink: 1,
    fontFamily: font.medium,
    fontSize: 10.5,
    color: tokens.colors.textDisabled,
  },
  examFooterRight: {
    fontFamily: font.medium,
    fontSize: 10.5,
    color: tokens.colors.textDisabled,
  },

  // Task row
  // Filas planas dentro de una única tarjeta agrupada (dayTasksCard) — como en
  // la maqueta, un divisor entre tareas en vez de una tarjeta por tarea. Antes
  // cada fila llevaba su propio fondo y borde; se quitó al pasar a la tarjeta
  // agrupada, porque una tarjeta dentro de otra tarjeta se veía como un error
  // de doble borde, no como una lista.
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  // Deep link from the home screen ("ver en el plan") lands on a task.
  taskRowHighlighted: {
    marginHorizontal: -14,
    paddingHorizontal: 14,
    backgroundColor: tokens.colors.accentSoftBg,
  },
  taskRowPanic: {
    marginHorizontal: -14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(216, 96, 74, 0.1)',
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
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  taskText: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 19,
    color: tokens.colors.textPrimary,
  },
  taskTextDone: {
    color: tokens.colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  optionalBadge: {
    marginTop: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: tokens.radius.btn,
    backgroundColor: tokens.colors.surfaceHover,
  },
  optionalBadgeText: {
    fontFamily: font.medium,
    fontSize: 9.5,
    color: tokens.colors.textSecondary,
  },
  taskMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  taskMeta: {
    flexShrink: 1,
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
  reasons: { gap: 10 },

  // ── Detalle de un examen ──
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailTitle: {
    flex: 1,
    fontFamily: font.bold,
    fontSize: 19,
    color: tokens.colors.text,
  },
  detailSubtitle: {
    fontFamily: font.regular,
    fontSize: 13,
    color: tokens.colors.textSecondary,
    marginTop: 4,
    marginBottom: 20,
  },
  detailSectionLabel: {
    fontFamily: font.semibold,
    fontSize: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: tokens.colors.textSecondary,
    marginBottom: 10,
  },
  detailEmpty: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.textSecondary,
  },
  detailList: { gap: 2 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  // Ancho fijo para que los días queden en columna y la lista se lea de un
  // vistazo, en vez de bailar según la longitud de "mié" o "jueves".
  detailDay: {
    width: 52,
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
  detailDayToday: { color: tokens.colors.accent, fontFamily: font.semibold },
  detailDayOverdue: { color: tokens.colors.danger },
  detailRowMain: { flex: 1, gap: 1 },
  detailPhase: {
    fontFamily: font.semibold,
    fontSize: 14,
    color: tokens.colors.text,
  },
  detailDone: {
    color: tokens.colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  detailText: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 17,
    color: tokens.colors.textSecondary,
  },
  detailMinutes: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
  verdictBox: {
    marginTop: 20,
    padding: 12,
    borderRadius: tokens.radius.card,
    borderWidth: 1,
  },
  verdictText: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.text,
  },
  verdictReady: {
    backgroundColor: 'rgba(90, 185, 138, 0.12)',
    borderColor: 'rgba(90, 185, 138, 0.3)',
  },
  verdictOnTrack: {
    backgroundColor: tokens.colors.accentSoftBg,
    borderColor: tokens.colors.accentSoftBorder,
  },
  verdictBehind: {
    backgroundColor: tokens.colors.premiumBg,
    borderColor: tokens.colors.premiumBorder,
  },
  verdictShort: {
    backgroundColor: 'rgba(216, 96, 74, 0.12)',
    borderColor: 'rgba(216, 96, 74, 0.32)',
  },
  verdictNone: {
    backgroundColor: tokens.colors.surfaceHover,
    borderColor: tokens.colors.border,
  },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  reasonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.accent,
    marginTop: 6,
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
