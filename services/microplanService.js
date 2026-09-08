import {
  rankExams,
  computeExamPriority,
  summarizeStudyLoad,
  daysBetween,
  toDate,
  localDateKey,
  MIN_SESSION_MINUTES,
} from './priority';
import { inferExamFormat, pickTaskText, taskHandInText } from './taskCopy';
import { maxDayMinutesFor, normalDayMinutesFor, pressureStepsFor } from './planProfile';

/**
 * Study plan generation.
 *
 * The previous version generated tasks per exam using `i % 3` / `i % 4` on the
 * day index, then cut each day to 5 tasks. Two things were wrong with that:
 *
 *   - The modulo ran on *days from today*, not days from the exam, so every exam
 *     landed on the same days (i = 0, 3, 6…). They piled up instead of
 *     interleaving.
 *   - The `slice(0, 5)` that cleaned up the pile-up always cut the same victim
 *     (lowest score), so work was dropped silently and systematically rather
 *     than because the day was genuinely full.
 *
 * This version schedules against a **daily time budget** instead. Each exam
 * carries a total effort in minutes (services/priority.js `estimateEffortMinutes`);
 * each day carries a capacity derived from the student's own history. Work is
 * allocated day by day, highest priority first, until the day is full. Anything
 * that doesn't fit isn't discarded — it stays owed, its pressure rises
 * (remaining ÷ days left), and it wins a slot on a later day. The scheduler is
 * work-conserving, so "it doesn't fit" becomes a reportable fact
 * (`diagnostics.unscheduled`) instead of an invisible truncation.
 */

// ─── Tunables ───

/**
 * Global ceiling on how early any exam can open its study window.
 *
 * Calibrated for the student Schedio is for, not for an organised one. Someone
 * who already plans three weeks ahead doesn't need this app; the actual user
 * starts about five days before an exam. A plan that opens 21 days out is
 * fiction they will ignore, and teaching someone to ignore the plan is the one
 * failure mode worth avoiding above all. Per-level windows in LEVEL_PROFILES sit
 * under this; only Universidad reaches it.
 */
export const MAX_LEAD_DAYS = 14;

/**
 * Hard cap on how far the plan extends, across all exams.
 *
 * Kept in step with what Planes can actually show: Prime reaches week offset 4,
 * which on a Monday ends 34 days out. At 30 the generator was producing days no
 * screen could navigate to.
 */
export const HORIZON_DAYS = 35;

/** Blocks shorter than this aren't worth a row in the UI; longer than this and a
 *  16-22 year old stops mid-way. */
export const MIN_BLOCK_MINUTES = 20;
export const MAX_BLOCK_MINUTES = 50;

/**
 * The block size to aim for. Effort is packed into blocks of roughly this length
 * and spread over fewer days, rather than smeared as thinly as MIN_BLOCK allows.
 *
 * The first version divided remaining effort by days left, which always bottomed
 * out at MIN_BLOCK: it produced 20-minute micro-sessions on every subject every
 * single day for weeks. Distributed practice beats massed practice, but not at
 * the price of eleven consecutive days of sessions too short to get going.
 */
export const PREFERRED_BLOCK_MINUTES = 35;

/**
 * Shape of the burn-down curve, as an exponent on progress through the study
 * window. 1 would burn effort at a constant rate; above 1 leaves more of the work
 * for later, so sessions get denser as the exam approaches — which is the spaced
 * repetition the phases already describe, and which the flat rate never delivered.
 */
export const BURN_GAMMA = 2;

/**
 * Everything that changes with the education level, in one table.
 *
 * Keys match `EDUCATION_LEVELS` in services/onboarding.js exactly, and the value
 * is already stored on the profile as `course`, so this costs the student
 * nothing: no new question, no new field.
 *
 * The numbers are deliberately modest. Schedio exists for the student who does
 * not plan ahead — the one who starts about five days before an exam — so a
 * profile calibrated for someone who studies three weeks out describes a user
 * who would not have installed the app. Earlier values (150 min and a 21-day
 * window for Bachillerato) came from that wrong picture.
 *
 * And the plan is a spine, not a total: it schedules the sessions that have to
 * land on particular days for the spacing to work, and the student adds their own
 * hours on top. A plan that tries to account for every hour of exam-period study
 * becomes a second job and is always wrong.
 */
export const LEVEL_PROFILES = {
  ESO: { exam: 60, task: 20, leadDays: 7, block: 25 },
  Bachillerato: { exam: 120, task: 35, leadDays: 12, block: 35 },
  Universidad: { exam: 300, task: 70, leadDays: 21, block: 45 },
};

/**
 * Huella de los exámenes que alimentan el plan.
 *
 * Sirve para una sola pregunta: **¿ha cambiado algo que obligue a rehacer el
 * plan?** Se compara con la que se guardó la última vez que se generó.
 *
 * Antes esa pregunta se contestaba con un contador de sesión que subía cuando
 * alguna pantalla llamaba a `triggerExamRefresh()`, y eso fallaba de dos
 * maneras a la vez: las pantallas que se olvidaban de llamarlo (Inicio crea,
 * edita, califica y borra exámenes, y no avisaba en ninguno de los cuatro
 * sitios) y el arranque en frío, donde el contador vuelve a cero y el plan
 * guardado parece al día. Una huella de los datos no se puede olvidar de
 * avisar: si el plan se genera de estos exámenes y estos exámenes ya no son
 * los mismos, hay que rehacerlo, venga el cambio de donde venga.
 *
 * Entra todo lo que el planificador mira de un examen: cuándo es, si está
 * hecho, de qué asignatura y de qué tipo. No entra el nombre, que no cambia
 * ninguna tarea.
 */
export const examsFingerprint = (exams) =>
  (Array.isArray(exams) ? exams : [])
    .map((exam) => {
      const date = toDate(exam?.date);
      return [
        exam?.id ?? '',
        date ? date.getTime() : '',
        exam?.completed ? 1 : 0,
        exam?.subjectId ?? '',
        exam?.type ?? '',
      ].join(':');
    })
    // Ordenado para que el mismo conjunto dé la misma huella venga en el orden
    // que venga de Firestore.
    .sort()
    .join('|');

/** 'Otro' and anything unrecognised sit in the middle rather than at an extreme. */
export const DEFAULT_LEVEL = 'Bachillerato';

export const levelProfileFor = (course) => LEVEL_PROFILES[course] || LEVEL_PROFILES[DEFAULT_LEVEL];

/**
 * How much of the work the plan leaves for the end, from the student's own
 * answer about reviewing — a question the onboarding already asks.
 *
 * Deliberately meets them slightly ahead of where they are rather than where
 * they say they are: someone who never reviews won't follow a plan that
 * front-loads everything, but nudging them earlier than their habit is the whole
 * point. So "nunca" gets a late curve, not the latest one imaginable.
 */
export const GAMMA_BY_REVIEW_HABIT = {
  never: 2.5,
  sometimes: 2.2,
  regularly: 1.8,
  always: 1.5,
};

export const gammaFor = (reviewFrequency) => GAMMA_BY_REVIEW_HABIT[reviewFrequency] ?? BURN_GAMMA;
/**
 * Minutes per day by self-reported organisation level (1 "caos total" ..
 * 5 "muy organizado", from onboarding). Blended with what the student actually
 * completes once there is enough of it.
 *
 * Observed minutes come from **ticked tasks**, not from the study timer. Plenty
 * of studying happens on paper, without battery, or in a library with the app
 * closed; tying the plan's accounting to the chronometer would make the loop
 * work only for the students who use it. Ticking a box is a deliberate act, so
 * it is taken at face value.
 */
export const CAPACITY_BY_ORGANIZATION = { 1: 35, 2: 45, 3: 60, 4: 75, 5: 95 };

/**
 * Plain-language reasons behind the numbers `estimateDailyCapacity` and
 * `gammaFor` already compute — so Plan can explain itself using the same two
 * onboarding answers that drive it, instead of that connection staying
 * invisible once onboarding is over.
 */
export const planReasonsFor = ({ organizationLevel, reviewFrequency } = {}) => {
  const level = clamp(Math.round(Number(organizationLevel) || 3), 1, 5);
  const reasons = [];

  if (level <= 2) {
    reasons.push(
      'Dijiste que hoy no tienes un sitio fijo para tus tareas, así que te damos más margen diario: es donde más se nota la diferencia.'
    );
  } else if (level >= 4) {
    reasons.push(
      'Ya tienes un sistema para organizarte, así que el presupuesto diario es más ajustado: Schedio solo lo mantiene.'
    );
  } else {
    reasons.push(
      'Tienes algo de sistema pero no siempre lo revisas, así que el margen diario es intermedio.'
    );
  }

  if (reviewFrequency === 'never' || reviewFrequency === 'sometimes') {
    reasons.push(
      'Como repasas poco fuera de los exámenes, el plan adelanta el repaso en el calendario en vez de dejarlo para la víspera.'
    );
  } else if (reviewFrequency === 'regularly' || reviewFrequency === 'always') {
    reasons.push(
      'Ya repasas de forma constante, así que el plan reparte el repaso de forma más uniforme.'
    );
  } else {
    reasons.push(
      'Sin esa respuesta todavía, el plan reparte el repaso con un ritmo intermedio por defecto.'
    );
  }

  reasons.push(
    'En cuanto completes unas cuantas sesiones, el presupuesto diario deja de basarse solo en lo que dijiste y empieza a mirar lo que haces de verdad.'
  );

  return reasons;
};
export const CAPACITY_BOUNDS = [25, 150];

/**
 * Absolute ceiling for a single day, in minutes. Nothing crosses it — not even
 * panic mode.
 *
 * A student has other classes, homework, a commute and a life; five hours is
 * already the outer edge of what a real day holds, and a plan that asks for more
 * is not ambitious, it's ignored. Panic used to bypass the daily budget entirely,
 * so five exams at once produced 3.3 h/day and eight subjects would have produced
 * 6.7 h — the cap was per-exam, never per-day.
 */
export const HARD_DAILY_CAP_MINUTES = 300;

/**
 * Fatigue. Studying six days straight does not yield six days of studying.
 *
 * Capacity decays once a run of consecutive study days passes ONSET, and resets
 * the moment a day goes empty. Nothing about this is shown to the student: it
 * just means the plan quietly eases off before they burn out, and that rest days
 * appear on their own instead of being a hard calendar rule.
 *
 * The floor matters — without it a long exam season would decay towards zero and
 * the plan would stop planning exactly when it's needed most.
 */
export const FATIGUE_ONSET_DAYS = 3;
export const FATIGUE_STEP = 0.12;
export const FATIGUE_FLOOR = 0.6;

export const fatigueFactor = (consecutiveDays) =>
  Math.max(FATIGUE_FLOOR, 1 - Math.max(0, consecutiveDays - FATIGUE_ONSET_DAYS) * FATIGUE_STEP);

/**
 * Exam pressure. A flat daily budget describes nobody.
 *
 * The student this app is for does 30 minutes on an ordinary Tuesday and two
 * hours the night before an exam — that swing is the defining behaviour of
 * someone who doesn't plan ahead, not a deviation from it. Modelling capacity as
 * a constant meant three exams in one week reported over half the work as
 * impossible, when in reality those are exactly the days the student finds time.
 *
 * Pulls the opposite way from `fatigueFactor`, and the two compose: crunch raises
 * the budget, a long unbroken run lowers it. The hard daily ceiling still binds.
 */
export const PRESSURE_STEPS = [
  { within: 1, factor: 2 },
  { within: 3, factor: 1.6 },
  { within: 7, factor: 1.25 },
];

/**
 * Cuanto se multiplica el presupuesto del dia por tener un examen encima.
 *
 * Los escalones ya no son siempre los mismos: el mini-onboarding de Planes
 * pregunta cuanto le dedicaria el alumno a un examen importante, y de ahi sale
 * su curva (services/planProfile.js). Quien no haya contestado se queda con
 * `PRESSURE_STEPS`, que es la de siempre.
 */
export const pressureFactor = (daysToNearestExam, steps = PRESSURE_STEPS) => {
  if (!Number.isFinite(daysToNearestExam)) return 1;
  const step = steps.find((s) => daysToNearestExam <= s.within);
  return step ? step.factor : 1;
};
/** Sessions needed before observed history outweighs the self-report. */
export const MIN_SESSIONS_FOR_HISTORY = 3;

/**
 * Días de la semana que el plan trata distinto: **ninguno**.
 *
 * El planificador saltaba el fin de semana salvo que hubiera un examen a menos
 * de una semana. La idea era no agobiar, pero el efecto era el contrario: el
 * plan decidía por el alumno que el sábado no se estudia, y quien sí quería
 * aprovecharlo se encontraba la pantalla vacía y sin nada que proponerle.
 *
 * Ahora el sábado y el domingo son días normales y el plan propone en ellos
 * como en cualquier otro. Descansar sigue siendo gratis, pero es una decisión
 * del alumno, no del algoritmo: **los días libres ya no viven aquí, viven en la
 * racha** (`freeDays` en services/streakRules.js), donde hacen lo único que
 * tienen que hacer — que no hacer las tareas de ese día no rompa nada.
 *
 * Se deja el array vacío en vez de borrar el concepto para que quien lo importe
 * siga compilando y para dejar dicho aquí por qué está vacío.
 */
export const DEFAULT_REST_DAYS = [];

/**
 * An exam whose entire study window is this short is an emergency: it was entered
 * with barely any notice. Panic mode ignores budget caps and rest days.
 *
 * This is a property of the exam, not of each day, so it can't flicker. An
 * earlier version triggered on "≥50% of the effort still owed with ≤2 days left",
 * which fired on exams that were comfortably *ahead* of the burn-down curve — at
 * two days left of a four-day window the curve expects ~75% still owed — and
 * produced phase sequences that read backwards: MODO PÁNICO followed by PRÁCTICA.
 */
export const PANIC_DAYS = 2;

/**
 * Focus. A student with a hard exam in two days does not spend twenty minutes on
 * an easy one six days away — they give the near exam the whole day.
 *
 * The scheduler ranked exams by score but still handed a block to every exam
 * whose curve said it was due, so a comfortable far exam quietly took time from
 * an imminent one. Inside this many days, an exam claims the day: anything
 * further out is deferred, unless deferring would leave it unschedulable.
 *
 * Work-conserving, as always — the deferred exam's pressure rises and it takes
 * the days back once the near one is done.
 */
export const FOCUS_DAYS = 3;

/**
 * How many sessions one exam may take in a single day.
 *
 * One block each was the rule, and it was the other half of the same mistake:
 * an exam two days out could physically not receive more than 35 minutes a day,
 * so it reported a shortfall while the student had capacity going spare. Nobody
 * revises for a hard exam tomorrow in one sitting of half an hour.
 */
export const BLOCKS_PER_DAY_BY_URGENCY = [
  { within: 1, blocks: 3 },
  { within: FOCUS_DAYS, blocks: 2 },
];

export const blocksAllowedFor = (daysLeft) =>
  BLOCKS_PER_DAY_BY_URGENCY.find((s) => daysLeft <= s.within)?.blocks ?? 1;

/** Tasks past this many per day are flagged "Opcional hoy". */
export const CORE_TASKS_PER_DAY = 2;

const FALLBACK_SUBJECT_COLOR = '#A1A1AA';
const DEFAULT_SUBJECT_COLOR = '#4F46E5';

/**
 * Phase bands by *relative* position in the exam's study window, not by absolute
 * days remaining. An exam 5 days out now gets its own compressed introduction →
 * study → practice → review arc; the old absolute thresholds dropped it straight
 * into "PRÁCTICA" and it never saw a review phase at all.
 */
// The bands carry no copy any more. Wording lives in services/taskCopy.js, keyed
// by phase *and* exam format, so the same phase reads as "10 ejercicios sin mirar
// apuntes" in Matemáticas and "desarrolla una pregunta entera" in Historia.
const PHASES = [
  { until: 0.35, phase: 'INTRODUCCIÓN', type: 'read' },
  { until: 0.65, phase: 'ESTUDIO PROFUNDO', type: 'study' },
  { until: 0.85, phase: 'PRÁCTICA', type: 'practice' },
  { until: Infinity, phase: 'REPASO FINAL', type: 'review' },
];

/**
 * Los cuatro nombres de fase, en orden, para pantallas que necesitan dibujar
 * el arco (p. ej. la pista de puntos de la vista "por examen" en Planes) sin
 * duplicar estos literales a mano ni arriesgarse a que se desincronicen.
 */
export const STUDY_PHASES = PHASES.map((band) => band.phase);

const PANIC_PHASE = { phase: 'MODO PÁNICO 🔥', type: 'review' };

/**
 * A `type: 'task'` is a hand-in, not an exam. It doesn't get an introduction →
 * study → practice → review arc, because you don't revise an essay: you work on
 * it and you finish it. Running tasks through the exam phases produced rows
 * reading "Lectura ligera / Introducción a Historia" for what the student had
 * entered as "Trabajo Roma".
 */
const TASK_PHASE = { phase: 'ENTREGA', type: 'practice' };

// ─── Helpers ───

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const startOfDay = (date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

// Local calendar date, shared with the UI so both sides agree on which day a
// task belongs to. See `localDateKey` in services/priority.js.
const formatDate = (date) => localDateKey(date);

const roundTo5 = (minutes) => Math.round(minutes / 5) * 5;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Minutes per day this student can realistically absorb.
 *
 * Starts from the onboarding self-report, then blends in what they actually do
 * once there's enough history to be worth trusting. Deliberately derived rather
 * than asked: the student who most needs a plan is the new one, who has nothing
 * to answer with yet.
 */
export const estimateDailyCapacity = ({ profile, completions, now = new Date() } = {}) => {
  // Lo que el alumno DIJO que estudia un dia normal, si se lo hemos
  // preguntado. `CAPACITY_BY_ORGANIZATION` era una tabla que convertia a ojo
  // una pregunta sobre habitos ("¿llevas tus tareas apuntadas?") en minutos;
  // preguntarlo directamente mide lo que hace falta medir. Se queda de reserva
  // para las cuentas anteriores a esa pregunta.
  const level = clamp(Math.round(Number(profile?.organizationLevel) || 3), 1, 5);
  const selfReported = normalDayMinutesFor(profile?.planSurvey) ?? CAPACITY_BY_ORGANIZATION[level];

  const recent = (Array.isArray(completions) ? completions : []).filter((entry) => {
    const date = toDate(entry?.date);
    return date && daysBetween(date, now) <= 21 && daysBetween(date, now) >= 0;
  });

  if (recent.length < MIN_SESSIONS_FOR_HISTORY) {
    return clamp(selfReported, CAPACITY_BOUNDS[0], CAPACITY_BOUNDS[1]);
  }

  // Average over *active* days, not over the whole window: dividing by 21 would
  // punish a student who studies hard three times a week.
  const byDay = {};
  recent.forEach((entry) => {
    const minutes = Number(entry.minutes);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    const key = formatDate(toDate(entry.date));
    byDay[key] = (byDay[key] || 0) + minutes;
  });

  const activeDays = Object.keys(byDay);
  if (activeDays.length === 0) {
    return clamp(selfReported, CAPACITY_BOUNDS[0], CAPACITY_BOUNDS[1]);
  }

  const observed = activeDays.reduce((total, key) => total + byDay[key], 0) / activeDays.length;

  return clamp(Math.round((selfReported + observed) / 2), CAPACITY_BOUNDS[0], CAPACITY_BOUNDS[1]);
};

/**
 * A short window doesn't get a compressed introduction — it gets no introduction.
 *
 * Set at 7 days, not 10: for a student who starts five days out, a ten-day
 * threshold means the introduction phase practically never appears anyway, so
 * the constant was describing a case that doesn't happen.
 *
 * The phases were mapped purely onto relative position in the window, so an exam
 * three days out still opened with "léelo entero sin memorizar" squeezed into
 * day one. With three days left, reading for the first time is not the priority:
 * studying properly and practising is. Below this many days of window, the arc
 * starts at ESTUDIO PROFUNDO instead.
 */
export const FULL_ARC_MIN_DAYS = 7;

export const phaseFloorFor = (windowLength) => (windowLength >= FULL_ARC_MIN_DAYS ? 0 : 1);

const phaseFor = (progress, isPanic, floor = 0) => {
  if (isPanic) return PANIC_PHASE;
  const available = PHASES.slice(floor);
  // Re-normalise the bands over the phases this window has room for, so the
  // remaining ones keep their relative weights instead of splitting evenly.
  const from = floor === 0 ? 0 : PHASES[floor - 1].until;
  const scaled = from + progress * (1 - from);
  return available.find((band) => scaled < band.until) || available[available.length - 1];
};

/**
 * One-line explanation of why this exam is being pushed, built from the factor
 * breakdown the scorer returns. Beats showing an unexplained number.
 */
const explain = (detail, subjectName) => {
  const { factors, daysUntil } = detail;
  const reasons = [];
  if (daysUntil !== null && daysUntil <= 3)
    reasons.push(`examen en ${daysUntil} día${daysUntil === 1 ? '' : 's'}`);
  if (factors.risk >= 0.6) reasons.push(`vas justo en ${subjectName}`);
  if (factors.difficulty >= 0.7) reasons.push('asignatura difícil');
  if (factors.coverage >= 0.9) reasons.push('sin tocar todavía');
  return reasons.slice(0, 2).join(' · ');
};

/**
 * Build the plan.
 *
 * @param {Array} exams - upcoming, uncompleted exams/tasks
 * @param {Array} subjects - `{ id, name, difficulty, averageGrade, color }`
 * @param {Object} [options]
 * @param {Date}   [options.now]
 * @param {Array}  [options.sessions] - session history, for capacity + coverage
 * @param {Object} [options.profile]  - for `organizationLevel`
 * @returns {{ tasks: Array, diagnostics: Object }}
 */
export const generateStudyPlan = (exams, subjects, options = {}) => {
  const {
    now = new Date(),
    sessions = [],
    // Ticked tasks: `[{ date, minutes }]`. Drives the daily budget.
    completions = [],
    profile = null,
  } = options;

  const today = startOfDay(now);
  const diagnostics = {
    dailyCapacity: 0,
    totalEffortMinutes: 0,
    scheduledMinutes: 0,
    // Sub-block leftovers dropped as rounding. Tracked so scheduled + rounding +
    // unscheduled always accounts for totalEffortMinutes.
    roundingMinutes: 0,
    // Days the fatigue model or the hard ceiling held back, so a plan that looks
    // thin can be explained instead of looking broken.
    easedDays: [],
    cappedDays: [],
    unscheduled: [],
    fullDays: [],
    skippedNoDate: [],
    // Per-exam state, for the "por examen" view. The loop already tracks all of
    // it; without returning it the screen would re-derive from the task list and
    // could disagree with the scheduler that produced it.
    readiness: [],
  };

  if (!Array.isArray(exams) || exams.length === 0) {
    return { tasks: [], diagnostics };
  }

  const subjectsById = {};
  (subjects || []).forEach((subject) => {
    if (subject?.id) subjectsById[subject.id] = subject;
  });

  // Everything level-dependent resolves once, here. `course` and
  // `reviewFrequency` are both already on the profile from onboarding, so none of
  // this costs the student an extra question.
  const level = levelProfileFor(profile?.course);
  const effortBase = { exam: level.exam, task: level.task };
  const leadDays = level.leadDays;
  const preferredBlock = clamp(level.block, MIN_BLOCK_MINUTES, MAX_BLOCK_MINUTES);
  const gamma = gammaFor(profile?.reviewFrequency);
  // Techo del dia y curva de presion, del mini-onboarding de Planes si el
  // alumno lo ha contestado. Quien no lo haya hecho se queda exactamente con
  // los valores fijos de antes, que es lo que devuelven estas dos por defecto.
  const hardDailyCap = maxDayMinutesFor(profile?.planSurvey, HARD_DAILY_CAP_MINUTES);
  const pressureSteps = pressureStepsFor(profile?.planSurvey, PRESSURE_STEPS);

  diagnostics.level = profile?.course || DEFAULT_LEVEL;
  diagnostics.preferredBlock = preferredBlock;

  const dailyCapacity = estimateDailyCapacity({ profile, completions, now });
  diagnostics.dailyCapacity = dailyCapacity;

  const studiedMinutesBySubject = summarizeStudyLoad(sessions, { now });
  const ctx = { now, studiedMinutesBySubject, effortBase };

  // ─── 1. Build one work item per exam ───
  const items = [];
  rankExams(exams, subjects, ctx).forEach((exam) => {
    const detail = exam.priorityDetail;

    if (detail.isUndated) {
      diagnostics.skippedNoDate.push(exam.id);
      return;
    }
    // Past its date and still open: it needs a grade, not a study plan.
    if (detail.isOverdue || exam.completed) return;

    // An exam with no subject used to be dropped here without a word. It gets a
    // placeholder instead — the student typed it in, they should see it.
    const subject = subjectsById[exam.subjectId] || null;
    const subjectName = subject?.name || exam.name || 'General';

    const daysUntil = detail.daysUntil;
    if (daysUntil > HORIZON_DAYS) return;
    // El dia del examen no se estudia: se examina. `lastDay` es el ultimo dia en
    // el que se puede colocar trabajo, y por eso un examen que es hoy
    // (`daysUntil === 0`) sale del plan en vez de pedir una sesion a "0 dias del
    // examen".
    //
    // Una entrega es lo contrario: el dia de la fecha es precisamente cuando se
    // termina y se entrega, asi que ahi si cuenta.
    const lastDay = exam.type === 'task' ? daysUntil : daysUntil - 1;
    if (lastDay < 0) return;

    items.push({
      exam,
      detail,
      subject,
      subjectName,
      subjectColor: subject?.color || (subject ? DEFAULT_SUBJECT_COLOR : FALLBACK_SUBJECT_COLOR),
      daysUntil,
      lastDay,
      // Study opens `leadDays` before the exam at the earliest, y nunca despues
      // del ultimo dia util.
      startDay: Math.min(lastDay, Math.max(0, daysUntil - leadDays)),
      // How this subject is examined, which decides the wording of every task.
      format: inferExamFormat(subjectName),
      totalEffort: detail.effortMinutes,
      remaining: detail.effortMinutes,
      sessions: 0,
    });
    diagnostics.totalEffortMinutes += detail.effortMinutes;
  });

  if (items.length === 0) return { tasks: [], diagnostics };

  const horizon = Math.min(HORIZON_DAYS, Math.max(...items.map((item) => item.lastDay)));

  /**
   * How much of an item's effort should still be owed at the end of day `day`.
   *
   * Work is due whenever the outstanding amount sits above this curve, which is
   * what turns "a bit of everything every day" into a handful of proper sessions
   * that cluster near the exam. Measured against the *end* of the day so that the
   * first day of a window is already slightly due — otherwise nothing ever starts
   * on the day study opens.
   */
  const targetRemaining = (item, day) => {
    const windowLength = Math.max(1, item.lastDay - item.startDay);
    const progress = (day - item.startDay + 1) / (windowLength + 1);
    return item.totalEffort * (1 - Math.min(1, progress) ** gamma);
  };

  // ─── 2. Walk the calendar, filling each day's budget ───
  const tasks = [];
  // Length of the current unbroken run of study days, which drives `fatigueFactor`.
  let consecutiveStudyDays = 0;

  for (let day = 0; day <= horizon; day++) {
    const date = addDays(today, day);
    const dateKey = formatDate(date);

    const active = items.filter(
      (item) => item.remaining > 0 && day >= item.startDay && day <= item.lastDay
    );
    if (active.length === 0) {
      consecutiveStudyDays = 0;
      continue;
    }

    // Aquí se saltaba el día si caía en fin de semana y no había examen a menos
    // de una semana. Ya no: todos los días son planificables. Lo que evita el
    // agobio sigue estando —el techo diario, el modelo de fatiga y la curva de
    // quemado— pero reparte sobre siete días en vez de sobre cinco, así que
    // cada día pide menos, no más.
    //
    // `nearestExamDays` sobrevive al recorte porque no era del descanso: es lo
    // que mide la presión del día más abajo.
    const nearestExamDays = Math.min(...active.map((item) => item.daysUntil - day));

    // Re-score for *this* day, not for today: urgency is what changes as the
    // calendar advances, and it's the reason an exam that got crowded out early
    // climbs the order later.
    const dayScored = active
      .map((item) => {
        const detail = computeExamPriority(item.exam, item.subject, {
          now: date,
          studiedMinutesBySubject,
          effortBase,
        });
        return { item, score: detail.score, detail };
      })
      .sort((a, b) => b.score - a.score || a.item.daysUntil - b.item.daysUntil);

    // Capacity for *this* day: the base budget eased by how long the current run
    // of study days has been, and never above the absolute daily ceiling.
    const ease = fatigueFactor(consecutiveStudyDays);
    const push = pressureFactor(nearestExamDays, pressureSteps);
    const dayCapacity = Math.min(Math.round(dailyCapacity * ease * push), hardDailyCap);
    if (ease < 1) diagnostics.easedDays.push(dateKey);

    let budgetLeft = dayCapacity;
    let placedToday = 0;
    let placedMinutes = 0;

    // The nearest exam among today's candidates decides whether the day belongs
    // to it. Rounds let an urgent exam take a second and third session before a
    // distant one gets its first, which is how a student actually spends the day
    // before a hard exam.
    const nearestActive = Math.min(...active.map((item) => item.daysUntil - day));
    const focusMode = nearestActive <= FOCUS_DAYS;

    for (let round = 0; round < 3; round++) {
      let placedThisRound = 0;

      dayScored.forEach(({ item, detail }) => {
        const isPanic = item.daysUntil <= PANIC_DAYS;
        const daysLeft = item.daysUntil - day;
        if (item.remaining <= 0) return;
        if (round >= blocksAllowedFor(daysLeft)) return;

        // Panic ignores the daily budget — the exam is in two days — but never the
        // absolute ceiling. Without this second check, each panic exam took its own
        // block regardless of how many other panic exams shared the day.
        if (placedMinutes + MIN_BLOCK_MINUTES > hardDailyCap) {
          if (!diagnostics.cappedDays.includes(dateKey)) diagnostics.cappedDays.push(dateKey);
          return;
        }
        if (budgetLeft < MIN_BLOCK_MINUTES && !isPanic) return;

        // Nothing is due today unless the outstanding work is above the burn-down
        // curve — *unless* deferring would make it unschedulable. The curve decides
        // when the work happens, never whether it happens at all.
        //
        // Without that second half the scheduler was not work-conserving after all:
        // a 230-minute exam six days out had its early days skipped by the curve,
        // then ran out of room because a day only takes one block per exam, and
        // reported 30 minutes as an overload while the week still had 500 minutes
        // free. A false shortfall is worse than a plan that starts a day early.
        // Todos los dias que quedan cuentan: ya no hay ninguno inhabil.
        const schedulableLeft = item.lastDay - day + 1;
        const sessionsNeeded = Math.ceil(item.remaining / preferredBlock);
        const mustStartNow = sessionsNeeded >= schedulableLeft;

        // An exam that isn't imminent yields the day to one that is.
        if (focusMode && daysLeft > FOCUS_DAYS && !mustStartNow) return;

        if (!isPanic && !mustStartNow && item.remaining <= targetRemaining(item, day)) return;

        const target = Math.min(preferredBlock, item.remaining);
        const allowance = isPanic ? MAX_BLOCK_MINUTES : Math.min(target, budgetLeft);
        const roomLeft = hardDailyCap - placedMinutes;
        const raw = roundTo5(Math.min(target, allowance, roomLeft));

        // No session below the floor. `Math.max(5, …)` let a scrap through as a
        // five-minute row whenever it happened to close an exam's effort.
        let block = raw;
        if (raw < MIN_SESSION_MINUTES) {
          if (roomLeft < MIN_SESSION_MINUTES || item.remaining < MIN_SESSION_MINUTES) return;
          block = MIN_SESSION_MINUTES;
        }

        // Absorb a trailing scrap rather than leaving it owed forever: a remainder
        // below MIN_BLOCK can never earn its own row, so it would sit unscheduled
        // and get reported as an overload — a 7-minute "no te cabe" that makes the
        // real warnings unbelievable.
        //
        // Must still respect the day's budget, which is the one thing panic mode is
        // allowed to break. Absorbing before checking was quietly pushing days a few
        // minutes over capacity.
        const scrap = item.remaining - block;
        const absorbed = block + scrap;
        if (
          scrap > 0 &&
          scrap < MIN_BLOCK_MINUTES &&
          absorbed <= MAX_BLOCK_MINUTES &&
          (isPanic || absorbed <= budgetLeft)
        ) {
          block = item.remaining;
        }

        // Too small to be worth a row, unless it's the last of this exam's work.
        if (block < MIN_BLOCK_MINUTES && block < item.remaining) return;

        const windowLength = Math.max(1, item.lastDay - item.startDay);
        const progress = (day - item.startDay) / windowLength;
        const isTask = item.exam.type === 'task';
        // Final if nothing schedulable is left afterwards. Comparing `block` against
        // the full remainder called a task "Avanzar con…" when the 11 minutes left
        // were about to be dropped as rounding and nothing more was ever coming.
        const isFinalBlock = item.remaining - block < MIN_BLOCK_MINUTES;

        // The last session before an exam is a review, whatever the arithmetic says.
        // In a short window the effort runs out before the exam day, so `progress`
        // never approaches 1 and the arc stopped at PRÁCTICA — an exam prepared
        // without ever being revised.
        const closesExam = isFinalBlock && item.sessions > 0 && !isPanic;
        const band = isTask
          ? TASK_PHASE
          : closesExam
            ? PHASES[PHASES.length - 1]
            : phaseFor(progress, isPanic, phaseFloorFor(windowLength));

        // The first session of the day keeps the historical id so existing
        // `planOverrides` keep matching; later ones are suffixed.
        const base = `${item.exam.id || `generated-${item.subjectName}`}-${dateKey}`;
        const id = round === 0 ? base : `${base}-${round + 1}`;
        const text = isTask
          ? taskHandInText(item.exam.name || item.subjectName, {
              isFinal: isFinalBlock,
              isOnly: isFinalBlock && item.sessions === 0,
            })
          : pickTaskText({
              phase: band.phase,
              format: item.format,
              subjectName: item.subjectName,
              seed: base,
              index: round,
            });

        tasks.push({
          id,
          examId: item.exam.id,
          subjectId: item.exam.subjectId,
          subjectName: item.subjectName,
          subjectColor: item.subjectColor,
          date: date.toISOString(),
          text,
          phase: band.phase,
          type: band.type,
          completed: false,
          duration: block,
          isPanicMode: isPanic,
          // Beyond the core count the day is into its slack, so these can slide.
          // Panic tasks never can.
          isOptional: placedToday >= CORE_TASKS_PER_DAY && !isPanic,
          // Carried for the UI and for debugging why the order came out this way.
          priorityScore: Math.round(detail.score),
          reason: explain(detail, item.subjectName),
        });

        item.remaining -= block;
        item.sessions += 1;
        budgetLeft -= block;
        placedToday += 1;
        placedThisRound += 1;
        placedMinutes += block;
        diagnostics.scheduledMinutes += block;

        // A leftover smaller than one block is rounding, not work. Left in place it
        // survived until it earned its own row — a 5-minute task in the UI — and
        // pushed `remaining` negative, so the scheduled total overshot the effort.
        // Counted separately so the three figures still reconcile against
        // totalEffortMinutes.
        if (item.remaining > 0 && item.remaining < MIN_SESSION_MINUTES) {
          diagnostics.roundingMinutes += item.remaining;
          item.remaining = 0;
        }
      });

      if (placedThisRound === 0) break;
    }

    consecutiveStudyDays = placedToday > 0 ? consecutiveStudyDays + 1 : 0;

    if (budgetLeft < MIN_BLOCK_MINUTES && items.some((item) => item.remaining > 0)) {
      diagnostics.fullDays.push(dateKey);
    }
  }

  // ─── 3. Report what didn't fit, instead of hiding it ───
  items.forEach((item) => {
    diagnostics.readiness.push({
      examId: item.exam.id,
      examName: item.exam.name,
      subjectId: item.exam.subjectId,
      subjectName: item.subjectName,
      subjectColor: item.subjectColor,
      daysUntil: item.daysUntil,
      sessions: item.sessions,
      totalEffortMinutes: item.totalEffort,
      plannedMinutes: item.totalEffort - item.remaining,
      remainingMinutes: Math.max(0, item.remaining),
      startsInDays: item.startDay,
    });

    // Only a shortfall big enough to be worth a session counts as overload.
    // Anything under one block is rounding, not a week the student can't survive.
    if (item.remaining >= MIN_BLOCK_MINUTES) {
      diagnostics.unscheduled.push({
        examId: item.exam.id,
        examName: item.exam.name,
        subjectName: item.subjectName,
        minutesShort: item.remaining,
      });
    }
  });

  tasks.sort((a, b) => new Date(a.date) - new Date(b.date));
  return { tasks, diagnostics };
};

/**
 * Backwards-compatible entry point: same signature and same return shape (a flat
 * task array) as the version the store already calls. Prefer `generateStudyPlan`
 * where the diagnostics are useful — an overloaded week is something the student
 * needs told, not something to swallow.
 */
export const generateExamPlan = (exams, subjects, options = {}) =>
  generateStudyPlan(exams, subjects, options).tasks;

/** Overrides older than this are dropped, so the map can't grow without bound. */
export const OVERRIDE_RETENTION_DAYS = 45;

/** Bookkeeping that belongs to the override record itself, not to the task. */
const OVERRIDE_META_KEYS = ['dismissed', 'updatedAt'];

/** The part of an override that should be spread onto the task. */
const userFields = (override) => {
  if (!override) return {};
  const fields = { ...override };
  OVERRIDE_META_KEYS.forEach((key) => delete fields[key]);
  return fields;
};

/**
 * Merge a freshly generated plan with everything the student did to the previous
 * one.
 *
 * The plan used to be replaced wholesale once a day, which silently destroyed
 * three kinds of work:
 *
 *   - `completed` ticks, including the entire history of past days
 *   - manually added tasks (`addManualTask`), which no exam regenerates
 *   - postponed and deleted tasks, which simply came back
 *
 * Merging by id alone cannot fix the last two. `postponeMicroTask` moves a task's
 * date but keeps its id — and the id encodes the original date — so the generator
 * re-emits the original slot and the postponed copy survives alongside it.
 * Deletion leaves no trace at all, so it reappears the next morning.
 *
 * So user intent is tracked separately from the derived plan, and the derived
 * plan stays disposable. Generated tasks are keyed by `${examId}-${dateKey}`,
 * which is stable across regenerations as long as the exam and the day are the
 * same — that stability is what makes the override map work.
 *
 * @param {Object} input
 * @param {Array}  input.generated - fresh output of `generateStudyPlan`
 * @param {Array}  [input.manualTasks] - user-created tasks, not derived from exams
 * @param {Object} [input.overrides] - `{ [taskId]: { completed, date, dismissed } }`
 * @param {Date}   [input.now]
 * @returns {{ tasks: Array, overrides: Object, pruned: string[] }} `overrides` is
 *   the garbage-collected map to persist back.
 */
export const reconcilePlan = ({
  generated = [],
  manualTasks = [],
  overrides = {},
  now = new Date(),
} = {}) => {
  const today = startOfDay(now);
  const cutoff = addDays(today, -OVERRIDE_RETENTION_DAYS);

  const tasks = [];

  generated.forEach((task) => {
    const override = overrides[task.id];
    if (override?.dismissed) return; // the student threw this one out; respect it

    tasks.push({
      ...task,
      // Every field the student changed wins over the generated one — not just
      // `completed` and `date`. Whitelisting those two would silently discard an
      // edited duration or text on the next regeneration.
      ...userFields(override),
      completed: override?.completed ?? task.completed ?? false,
      isMoved: Boolean(override?.date),
    });
  });

  // Manual tasks are never regenerated, so they live in their own list and are
  // appended as-is. Their `completed` state is stored the same way as the rest.
  const generatedIds = new Set(generated.map((task) => task.id));
  manualTasks.forEach((task) => {
    const override = overrides[task.id];
    if (override?.dismissed) return;
    if (generatedIds.has(task.id)) return; // shouldn't happen; don't duplicate if it does
    tasks.push({
      ...task,
      ...userFields(override),
      completed: override?.completed ?? task.completed ?? false,
    });
  });

  // Prune by age alone. The map is append-only otherwise, and it lives inside the
  // user document.
  //
  // Age is the right axis rather than "is the task still in the plan": a
  // dismissal has to outlive the task it hides, or the task returns on the next
  // regeneration. Once the retention window has passed, the exam that generated
  // the task is long gone and nothing can resurrect it. Overrides with no
  // timestamp are kept — they predate this field, and dropping them would
  // silently undo the student's ticks.
  const kept = {};
  const pruned = [];
  Object.keys(overrides).forEach((id) => {
    const stamped = toDate(overrides[id]?.updatedAt);
    if (stamped && stamped < cutoff) {
      pruned.push(id);
      return;
    }
    kept[id] = overrides[id];
  });

  tasks.sort((a, b) => new Date(a.date) - new Date(b.date));
  return { tasks, overrides: kept, pruned };
};
