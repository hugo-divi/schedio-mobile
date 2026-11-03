/**
 * What "Hoy" on Inicio says, worked out from the plan alone.
 *
 * The AI line is a bonus, and often it isn't there: the daily quota runs out,
 * the monthly budget breaker trips, the network fails. So the headline never
 * depends on it. It is built here from the same plan the Plan tab shows,
 * which means it is always true — "Te quedan 20 min: Inglés" can't be wrong
 * the way a model's sentence can — and the predetermined lines underneath are
 * picked for the situation (a day half done, an exam tomorrow, nothing
 * planned) instead of at random from one list.
 *
 * Variants are chosen by the date, not at random: the same day reads the same
 * every time Inicio repaints, and the next day reads differently.
 *
 * Pure — no React Native — so scripts/check-today-copy.mjs runs it in Node.
 */

const dayKey = (date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

/** A stable small number from a string: the same day always picks the same line. */
const seedOf = (text) => {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash;
};
const pick = (lines, seed) => lines[seed % lines.length];

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') return toDate(value.toDate());
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const daysFromToday = (date, now) =>
  Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / (24 * 60 * 60 * 1000));

const minutesOf = (tasks) => tasks.reduce((sum, t) => sum + (Number(t.duration) || 0), 0);

const whenLabel = (days) => (days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`);

/** Lines for under the headline when there's no AI sentence, by situation. */
export const TIPS = {
  pending: [
    'Empieza por la primera: los cinco primeros minutos son los que más cuestan.',
    'Móvil boca abajo y a por la primera sesión.',
    'Una sesión hecha hoy vale más que dos prometidas para mañana.',
  ],
  pendingStreak: [
    'Llevas {streak} días de racha: una sesión hoy la mantiene.',
    '{streak} días seguidos. Hoy toca {next}.',
  ],
  partial: [
    'Ya has hecho lo más difícil, que es empezar.',
    'Sigue con la siguiente y el día queda cerrado.',
  ],
  examTomorrow: [
    'Repasa lo esencial y no metas temario nuevo. Esta noche, a dormir pronto.',
    'Hoy toca afianzar, no aprender de cero. Lo que ya sabes cuenta.',
  ],
  examToday: [
    'Repasa lo esencial, come algo y confía en lo que has trabajado.',
    'Lo que has estudiado ya está ahí. Ve tranquilo.',
  ],
  done: [
    'Descansar también es parte del plan.',
    'Lo que hagas a partir de ahora es extra.',
    'Mañana el plan se reajusta con lo que has hecho hoy.',
  ],
  empty: [
    'Un repaso corto de lo de clase hoy te ahorra horas antes del examen.',
    'Si te apetece, adelanta una sesión y mañana irás más suelto.',
  ],
  noExams: [
    'Con una fecha de examen, Schedio te reparte el temario día a día.',
    'Apunta el próximo examen en cuanto lo sepas: cuanto antes, más repartido.',
  ],
};

/**
 * Everything "Hoy" needs.
 *
 * @param {Object} input
 * @param {Array}  input.tasks - today's tasks from the plan, in plan order
 * @param {Array}  [input.exams] - pending exams `{ name, date, subjectName? }`
 * @param {number} [input.streak]
 * @param {Date}   [input.now]
 * @returns {{
 *   state: 'exam_today'|'exam_tomorrow'|'pending'|'partial'|'done'|'empty'|'no_exams',
 *   headline: string, detail: string|null, tip: string,
 *   next: Object|null, minutesLeft: number, minutesDone: number, doneCount: number, total: number
 * }}
 */
export const buildTodayView = ({ tasks = [], exams = [], streak = 0, now = new Date() }) => {
  const seed = seedOf(dayKey(now));
  const all = (tasks || []).filter(Boolean);
  const pending = all.filter((t) => !t.completed);
  const done = all.filter((t) => t.completed);
  // Optional tasks are the day's slack: they never decide that the day is
  // unfinished, and they never lead the headline.
  const pendingCore = pending.filter((t) => !t.isOptional);
  const next = pendingCore[0] || pending[0] || null;
  const minutesLeft = minutesOf(pendingCore.length > 0 ? pendingCore : pending);
  const minutesDone = minutesOf(done);

  const upcoming = (exams || [])
    .map((exam) => ({ ...exam, at: toDate(exam.date) }))
    .filter((exam) => exam.at && daysFromToday(exam.at, now) >= 0)
    .sort((a, b) => a.at - b.at);
  const nearest = upcoming[0] || null;
  const nearestDays = nearest ? daysFromToday(nearest.at, now) : null;
  const examLabel = (exam) => exam.subjectName || exam.name || 'tu examen';

  const base = {
    next,
    minutesLeft,
    minutesDone,
    doneCount: done.length,
    total: all.length,
  };
  const fill = (line) =>
    line
      .replace('{streak}', String(streak))
      .replace('{next}', next ? `${next.subjectName || 'estudio'}` : 'estudio');

  if (nearest && nearestDays === 0) {
    return {
      ...base,
      state: 'exam_today',
      headline: `Hoy es tu examen de ${examLabel(nearest)}`,
      detail: next ? `Si te da tiempo antes: ${next.subjectName} · ${next.duration} min.` : null,
      tip: pick(TIPS.examToday, seed),
    };
  }

  if (pendingCore.length === 0 && all.length > 0) {
    return {
      ...base,
      state: 'done',
      headline: pick(['Plan de hoy completado', 'Día cumplido', 'Hoy ya está'], seed),
      detail: `${minutesDone} min estudiados${done.length > 1 ? ` en ${done.length} sesiones` : ''}.`,
      tip: pick(TIPS.done, seed),
    };
  }

  if (all.length === 0) {
    if (!nearest) {
      return {
        ...base,
        state: 'no_exams',
        headline: 'Añade tu próximo examen',
        detail: 'Y Schedio te reparte el temario en sesiones, día a día.',
        tip: pick(TIPS.noExams, seed),
      };
    }
    return {
      ...base,
      state: 'empty',
      headline: 'Hoy no hay nada en el plan',
      detail: `Tu próximo examen es ${examLabel(nearest)}, ${whenLabel(nearestDays)}.`,
      tip: pick(TIPS.empty, seed),
    };
  }

  if (nearest && nearestDays === 1) {
    return {
      ...base,
      state: 'exam_tomorrow',
      headline: `Mañana es tu examen de ${examLabel(nearest)}`,
      detail: `Hoy toca el repaso final: ${minutesLeft} min${
        pendingCore.length > 1 ? `, empezando por ${next.subjectName}` : ''
      }.`,
      tip: pick(TIPS.examTomorrow, seed),
    };
  }

  if (done.length > 0) {
    return {
      ...base,
      state: 'partial',
      headline: `Te quedan ${minutesLeft} min`,
      detail: `Sigue con ${next.subjectName}: ${next.text}`,
      tip: pick(TIPS.partial, seed),
    };
  }

  const many = pendingCore.length > 1;
  return {
    ...base,
    state: 'pending',
    headline: many
      ? `Hoy: ${minutesLeft} min de estudio`
      : `Hoy toca ${next.subjectName} · ${next.duration} min`,
    detail: many ? `Empieza por ${next.subjectName}: ${next.text}` : next.text || null,
    tip: fill(streak > 0 ? pick(TIPS.pendingStreak, seed) : pick(TIPS.pending, seed)),
  };
};
