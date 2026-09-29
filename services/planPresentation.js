import { STUDY_PHASES, FOCUS_DAYS } from './microplanService';
import { daysBetween } from './priority';
import { intlLocale } from './localeFormat';

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

/**
 * Las sesiones de un examen, en orden, para el detalle que se abre al pulsar
 * su tarjeta.
 *
 * La tarjeta ya dice "3 de 8 sesiones"; lo que no dice —y no se puede
 * averiguar en ninguna otra parte de la app— es *cuándo* son las otras cinco.
 * El plan está organizado por día, así que ves el jueves entero pero nunca
 * "tu examen de Historia".
 *
 * `overdue` es una sesión sin marcar que ya pasó: no desaparece del plan, y
 * fingir que no está ahí es justo lo que haría que el resumen mintiera.
 */
export const examSessionsFor = ({ exam, microplans, now = new Date(), language }) => {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  return (microplans || [])
    .filter((task) => task.examId === exam.id)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((task) => {
      const date = new Date(task.date);
      const day = new Date(date);
      day.setHours(0, 0, 0, 0);
      return {
        id: task.id,
        date: task.date,
        dayLabel: dayLabelFor(date, language),
        minutes: task.duration || 0,
        phaseLabel: task.phase ? task.phase.charAt(0) + task.phase.slice(1).toLowerCase() : '',
        text: task.text || '',
        completed: Boolean(task.completed),
        overdue: !task.completed && day < startOfToday,
        isToday: day.getTime() === startOfToday.getTime(),
      };
    });
};

/** "jue 12" — el mismo formato corto que ya usa el resto de la app. */
export const dayLabelFor = (date, language) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const weekday = d.toLocaleDateString(intlLocale(language), { weekday: 'short' }).replace('.', '');
  return `${weekday} ${d.getDate()}`;
};

/**
 * ¿Llego a este examen? La pregunta que la pantalla se guardaba para sí.
 *
 * Cuatro respuestas, y el orden importa: primero lo que ya está hecho,
 * después lo que va mal, y solo al final la tranquilizadora. Decir "vas
 * cubierto" a alguien que arrastra tres sesiones sin hacer sería mentir.
 *
 * El déficit (`planDiagnostics.unscheduled`) es el caso más grave —el trabajo
 * que directamente no cupo en los días que quedan— pero solo existe si el
 * plan se ha generado en esta sesión: el store no lo persiste. Por eso el
 * resto de veredictos se calculan sobre las sesiones mismas, que sí
 * sobreviven a cerrar la app.
 */
export const examVerdictFor = ({ sessions, daysUntil, planDiagnostics = null, examId }) => {
  const pending = sessions.filter((s) => !s.completed);
  const overdue = pending.filter((s) => s.overdue);
  const pendingMinutes = pending.reduce((sum, s) => sum + s.minutes, 0);

  if (sessions.length === 0) {
    return {
      kind: 'none',
      text:
        daysUntil > 0
          ? 'Todavía no hay sesiones para este examen. Aparecerán cuando se acerque.'
          : 'No hay sesiones para este examen.',
    };
  }

  if (pending.length === 0) {
    return { kind: 'ready', text: 'Preparado: no queda nada por hacer.' };
  }

  const short = (planDiagnostics?.unscheduled || []).find((u) => u.examId === examId);
  if (short && short.minutesShort > 0) {
    return {
      kind: 'short',
      text: `No llegas: faltan ${formatMinutes(short.minutesShort)} que no han cabido en los días que quedan. Libera algún día de esta semana o baja el objetivo.`,
    };
  }

  if (overdue.length > 0) {
    return {
      kind: 'behind',
      text: `Vas con retraso: ${overdue.length} ${
        overdue.length === 1
          ? 'sesión pendiente de un día que ya pasó'
          : 'sesiones pendientes de días que ya pasaron'
      }. Todavía puedes recuperarlas antes del examen.`,
    };
  }

  return {
    kind: 'ontrack',
    text: `Vas cubierto: quedan ${pending.length} ${
      pending.length === 1 ? 'sesión' : 'sesiones'
    } (${formatMinutes(pendingMinutes)}) repartidas hasta la víspera.`,
  };
};
