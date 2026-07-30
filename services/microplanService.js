import {
  rankExams,
  computeExamPriority,
  summarizeStudyLoad,
  daysBetween,
  toDate,
} from './priority';

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

/** Nothing is scheduled further out than this. Beyond ~3 weeks a plan is
 *  fiction, and every generated task costs space in the user document. */
export const MAX_LEAD_DAYS = 21;

/** Hard cap on how far the plan extends, across all exams. */
export const HORIZON_DAYS = 30;

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
export const PREFERRED_BLOCK_MINUTES = 40;

/**
 * Shape of the burn-down curve, as an exponent on progress through the study
 * window. 1 would burn effort at a constant rate; above 1 leaves more of the work
 * for later, so sessions get denser as the exam approaches — which is the spaced
 * repetition the phases already describe, and which the flat rate never delivered.
 */
export const BURN_GAMMA = 2;

/** Minutes per day by self-reported organisation level (1 "caos total" ..
 *  5 "muy organizado", from onboarding). Blended with observed history when
 *  there's enough of it. */
export const CAPACITY_BY_ORGANIZATION = { 1: 45, 2: 60, 3: 75, 4: 95, 5: 120 };
export const CAPACITY_BOUNDS = [30, 180];
/** Sessions needed before observed history outweighs the self-report. */
export const MIN_SESSIONS_FOR_HISTORY = 3;

/** Weekdays off (0 = Sunday). Preserves the old "no studying on Sundays"
 *  behaviour; `feat/streak-rest-days` can pass its own set. */
export const DEFAULT_REST_DAYS = [0];
/** Rest days stop applying once an exam is this close — matching the old rule,
 *  which only skipped Sundays when the exam was more than a week away. */
export const REST_OVERRIDE_DAYS = 7;

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
const PHASES = [
  {
    until: 0.35,
    phase: 'INTRODUCCIÓN',
    type: 'read',
    label: (s) => `Lectura ligera / Introducción a ${s}`,
  },
  {
    until: 0.65,
    phase: 'ESTUDIO PROFUNDO',
    type: 'study',
    label: (s) => `Estudio de temas complejos de ${s}`,
  },
  {
    until: 0.85,
    phase: 'PRÁCTICA',
    type: 'practice',
    label: (s) => `Ejercicios prácticos de ${s}`,
  },
  {
    until: Infinity,
    phase: 'REPASO FINAL',
    type: 'review',
    label: (s) => `Repaso relámpago de ${s} (Conceptos Clave)`,
  },
];

const PANIC_PHASE = {
  phase: 'MODO PÁNICO 🔥',
  type: 'review',
  label: (s) => `Cramming: Esquemas y lectura rápida de ${s}`,
};

/**
 * A `type: 'task'` is a hand-in, not an exam. It doesn't get an introduction →
 * study → practice → review arc, because you don't revise an essay: you work on
 * it and you finish it. Running tasks through the exam phases produced rows
 * reading "Lectura ligera / Introducción a Historia" for what the student had
 * entered as "Trabajo Roma".
 */
const taskBand = (eventName, isFinalBlock) => ({
  phase: 'ENTREGA',
  type: 'practice',
  label: () => (isFinalBlock ? `Terminar: ${eventName}` : `Avanzar con: ${eventName}`),
});

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

const formatDate = (date) => {
  // Local calendar date. `toISOString()` would shift to UTC and, for anyone east
  // of Greenwich in summer, file a late-evening task under the following day.
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

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
export const estimateDailyCapacity = ({ profile, sessions, now = new Date() } = {}) => {
  const level = clamp(Math.round(Number(profile?.organizationLevel) || 3), 1, 5);
  const selfReported = CAPACITY_BY_ORGANIZATION[level];

  const recent = (Array.isArray(sessions) ? sessions : []).filter((session) => {
    const date = toDate(session?.date);
    return date && daysBetween(date, now) <= 21 && daysBetween(date, now) >= 0;
  });

  if (recent.length < MIN_SESSIONS_FOR_HISTORY) {
    return clamp(selfReported, CAPACITY_BOUNDS[0], CAPACITY_BOUNDS[1]);
  }

  // Average over *active* days, not over the whole window: dividing by 21 would
  // punish a student who studies hard three times a week.
  const byDay = {};
  recent.forEach((session) => {
    const minutes = Number(session.duration);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    const key = formatDate(toDate(session.date));
    byDay[key] = (byDay[key] || 0) + minutes;
  });

  const activeDays = Object.keys(byDay);
  if (activeDays.length === 0) {
    return clamp(selfReported, CAPACITY_BOUNDS[0], CAPACITY_BOUNDS[1]);
  }

  const observed = activeDays.reduce((total, key) => total + byDay[key], 0) / activeDays.length;

  return clamp(Math.round((selfReported + observed) / 2), CAPACITY_BOUNDS[0], CAPACITY_BOUNDS[1]);
};

const phaseFor = (progress, isPanic) => {
  if (isPanic) return PANIC_PHASE;
  return PHASES.find((band) => progress < band.until) || PHASES[PHASES.length - 1];
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
 * @param {number[]} [options.restDays] - weekday indices with no capacity
 * @returns {{ tasks: Array, diagnostics: Object }}
 */
export const generateStudyPlan = (exams, subjects, options = {}) => {
  const { now = new Date(), sessions = [], profile = null, restDays = DEFAULT_REST_DAYS } = options;

  const today = startOfDay(now);
  const diagnostics = {
    dailyCapacity: 0,
    totalEffortMinutes: 0,
    scheduledMinutes: 0,
    // Sub-block leftovers dropped as rounding. Tracked so scheduled + rounding +
    // unscheduled always accounts for totalEffortMinutes.
    roundingMinutes: 0,
    unscheduled: [],
    fullDays: [],
    skippedNoDate: [],
  };

  if (!Array.isArray(exams) || exams.length === 0) {
    return { tasks: [], diagnostics };
  }

  const subjectsById = {};
  (subjects || []).forEach((subject) => {
    if (subject?.id) subjectsById[subject.id] = subject;
  });

  const dailyCapacity = estimateDailyCapacity({ profile, sessions, now });
  diagnostics.dailyCapacity = dailyCapacity;

  const studiedMinutesBySubject = summarizeStudyLoad(sessions, { now });
  const ctx = { now, studiedMinutesBySubject };

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

    items.push({
      exam,
      detail,
      subject,
      subjectName,
      subjectColor: subject?.color || (subject ? DEFAULT_SUBJECT_COLOR : FALLBACK_SUBJECT_COLOR),
      daysUntil,
      // Study opens MAX_LEAD_DAYS before the exam at the earliest.
      startDay: Math.max(0, daysUntil - MAX_LEAD_DAYS),
      totalEffort: detail.effortMinutes,
      remaining: detail.effortMinutes,
      sessions: 0,
    });
    diagnostics.totalEffortMinutes += detail.effortMinutes;
  });

  if (items.length === 0) return { tasks: [], diagnostics };

  const restDaySet = new Set(restDays || []);
  const horizon = Math.min(HORIZON_DAYS, Math.max(...items.map((item) => item.daysUntil)));

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
    const windowLength = Math.max(1, item.daysUntil - item.startDay);
    const progress = (day - item.startDay + 1) / (windowLength + 1);
    return item.totalEffort * (1 - Math.min(1, progress) ** BURN_GAMMA);
  };

  // ─── 2. Walk the calendar, filling each day's budget ───
  const tasks = [];

  for (let day = 0; day <= horizon; day++) {
    const date = addDays(today, day);
    const dateKey = formatDate(date);

    const active = items.filter(
      (item) => item.remaining > 0 && day >= item.startDay && day <= item.daysUntil
    );
    if (active.length === 0) continue;

    const nearestExamDays = Math.min(...active.map((item) => item.daysUntil - day));
    const isRestDay = restDaySet.has(date.getDay()) && nearestExamDays > REST_OVERRIDE_DAYS;
    if (isRestDay) continue;

    // Re-score for *this* day, not for today: urgency is what changes as the
    // calendar advances, and it's the reason an exam that got crowded out early
    // climbs the order later.
    const dayScored = active
      .map((item) => {
        const detail = computeExamPriority(item.exam, item.subject, {
          now: date,
          studiedMinutesBySubject,
        });
        return { item, score: detail.score, detail };
      })
      .sort((a, b) => b.score - a.score || a.item.daysUntil - b.item.daysUntil);

    let budgetLeft = dailyCapacity;
    let placedToday = 0;

    dayScored.forEach(({ item, detail }) => {
      const isPanic = item.daysUntil <= PANIC_DAYS;

      // Panic ignores the budget: the exam is in two days and most of the work is
      // still owed, so a tidy plan the student can't use is worse than a hard one.
      if (budgetLeft < MIN_BLOCK_MINUTES && !isPanic) return;

      // Nothing is due today unless the outstanding work is above the burn-down
      // curve. The last day of the window has a target of zero, so whatever is
      // left always comes due then rather than quietly expiring.
      if (!isPanic && item.remaining <= targetRemaining(item, day)) return;

      const target = Math.min(PREFERRED_BLOCK_MINUTES, item.remaining);
      const allowance = isPanic ? MAX_BLOCK_MINUTES : Math.min(target, budgetLeft);
      let block = Math.max(5, roundTo5(Math.min(target, allowance)));

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

      const windowLength = Math.max(1, item.daysUntil - item.startDay);
      const progress = (day - item.startDay) / windowLength;
      const isTask = item.exam.type === 'task';
      const isFinalBlock = block >= item.remaining;

      // The last session before an exam is a review, whatever the arithmetic says.
      // In a short window the effort runs out before the exam day, so `progress`
      // never approaches 1 and the arc stopped at PRÁCTICA — an exam prepared
      // without ever being revised.
      const closesExam = isFinalBlock && item.sessions > 0 && !isPanic;
      const band = isTask
        ? taskBand(item.exam.name || item.subjectName, isFinalBlock)
        : closesExam
          ? PHASES[PHASES.length - 1]
          : phaseFor(progress, isPanic);

      tasks.push({
        id: `${item.exam.id || `generated-${item.subjectName}`}-${dateKey}`,
        examId: item.exam.id,
        subjectId: item.exam.subjectId,
        subjectName: item.subjectName,
        subjectColor: item.subjectColor,
        date: date.toISOString(),
        text: band.label(item.subjectName),
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
      diagnostics.scheduledMinutes += block;

      // A leftover smaller than one block is rounding, not work. Left in place it
      // survived until it earned its own row — a 5-minute task in the UI — and
      // pushed `remaining` negative, so the scheduled total overshot the effort.
      // Counted separately so the three figures still reconcile against
      // totalEffortMinutes.
      if (item.remaining > 0 && item.remaining < MIN_BLOCK_MINUTES) {
        diagnostics.roundingMinutes += item.remaining;
        item.remaining = 0;
      }
    });

    if (budgetLeft < MIN_BLOCK_MINUTES && items.some((item) => item.remaining > 0)) {
      diagnostics.fullDays.push(dateKey);
    }
  }

  // ─── 3. Report what didn't fit, instead of hiding it ───
  items.forEach((item) => {
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
