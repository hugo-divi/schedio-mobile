import { STUDY_PHASES, FOCUS_DAYS } from './microplanService';
import { daysBetween } from './priority';

/**
 * Lo que la pantalla de Planes necesita para *mostrar* el plan y los
 * exámenes, separado de `microplanService.js` (que decide *qué* plan hay) y
 * de `app/dashboard/plans.js` (que solo dibuja). Sin código de React Native
 * aquí a propósito: es lo que permite verificarlo con Node en
 * scripts/check-plan-screen.mjs en vez de fiarse de leerlo con atención.
 */

/** "en 4 días" / "mañana" / "hoy" / "hace 2 días". */
export const daysUntilLabel = (daysUntil) => {
  if (daysUntil === 0) return 'hoy';
  if (daysUntil === 1) return 'mañana';
  if (daysUntil > 1) return `en ${daysUntil} días`;
  if (daysUntil === -1) return 'hace 1 día';
  return `hace ${Math.abs(daysUntil)} días`;
};

/**
 * Índice (0-3) de una fase en STUDY_PHASES. El modo pánico y las entregas no
 * son ninguna de las cuatro bandas normales: se muestran como "al final del
 * arco" porque es la lectura honesta — quedan pocos días, no que el tema esté
 * poco trabajado.
 */
export const phaseIndexFor = (phase, isPanicMode) => {
  if (isPanicMode) return STUDY_PHASES.length - 1;
  const index = STUDY_PHASES.indexOf(phase);
  return index === -1 ? STUDY_PHASES.length - 1 : index;
};

/**
 * Carga del día como ancho de barra (0, o 10-26px): un suelo visible incluso
 * para una tarea corta, un techo para no desbordar la píldora del día.
 */
export const dayLoadWidth = (minutes) => {
  if (minutes <= 0) return 0;
  return Math.min(26, 10 + Math.round(minutes / 6));
};

/**
 * El progreso de un examen, para una tarjeta de la vista "por examen".
 *
 * Se calcula sobre `microplans` entero (todo el horizonte generado, no solo
 * la semana visible) porque un examen lejano puede llevar semanas de sesiones
 * ya colocadas antes de que la semana en pantalla llegue a él.
 *
 * @param {object} args
 * @param {{id: string, name: string, subjectId: ?string, date: Date}} args.exam
 * @param {Array} args.subjects
 * @param {Array} args.microplans - todas las tareas generadas, de cualquier semana
 * @param {Set<string>} args.todaysExamIds - examId de las tareas de hoy sin marcar
 * @param {Date} [args.now]
 */
export const examProgressFor = ({
  exam,
  subjects,
  microplans,
  todaysExamIds,
  now = new Date(),
}) => {
  const subject = subjects.find((s) => s.id === exam.subjectId);
  const examTasks = (microplans || [])
    .filter((t) => t.examId === exam.id)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const totalSessions = examTasks.length;
  const doneSessions = examTasks.filter((t) => t.completed).length;
  const notStarted = totalSessions === 0;
  const ready = !notStarted && doneSessions >= totalSessions;

  // La fase "actual": la de la última tarea de hoy o de antes; si todas son
  // futuras (el arco aún no ha empezado), la de la primera.
  const upToToday = examTasks.filter((t) => new Date(t.date) <= now);
  const currentTask = upToToday[upToToday.length - 1] || examTasks[0] || null;
  const phaseIndex = notStarted ? 0 : phaseIndexFor(currentTask?.phase, currentTask?.isPanicMode);
  const phaseLabel = notStarted
    ? 'Por empezar'
    : currentTask?.phase
      ? currentTask.phase.charAt(0) + currentTask.phase.slice(1).toLowerCase()
      : STUDY_PHASES[phaseIndex];

  const remainingMinutes = examTasks
    .filter((t) => !t.completed)
    .reduce((sum, t) => sum + (t.duration || 0), 0);

  const daysUntil = daysBetween(now, exam.date);
  const footerRight = ready
    ? 'nada pendiente'
    : notStarted
      ? 'aún no empieza'
      : todaysExamIds.has(exam.id)
        ? 'hoy le toca'
        : `${formatMinutes(remainingMinutes)} por delante`;

  return {
    id: exam.id,
    name: exam.name,
    subjectColor: subject?.color,
    dateLabel: daysUntilLabel(daysUntil),
    totalSessions,
    doneSessions,
    notStarted,
    ready,
    hot: !ready && !notStarted && daysUntil <= FOCUS_DAYS,
    phaseIndex,
    phaseLabel,
    footerRight,
  };
};

/** "1h 20min" / "45 min" — igual formato que ya usa el resto de Planes. */
export const formatMinutes = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${m}min`;
};
