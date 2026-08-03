/**
 * Exam/task scoring — the single source of truth for "how much does this matter".
 *
 * This replaces three competing implementations that never agreed with each other:
 *   - `calculatePriority` in services/exams.js (dead code, never called)
 *   - `calculatePriority` in services/userData.js (onboarding only, was fed a
 *     `difficulty` field the onboarding never collects, so it stored NaN)
 *   - the inline `totalPriority` sum in services/microplanService.js, which was
 *     the only one that actually ordered anything — and which ignored the
 *     priority the user picks in EventModal entirely.
 *
 * Everything here is pure: no firebase, no Date.now() unless you let it. That is
 * deliberate — this is the piece whose weights need calibrating, and it can only
 * be calibrated if it can be run in isolation with a fixed `now`.
 *
 * ─── Scales used throughout ───
 * `subject.difficulty`  1-10, 10 = hardest. Matches the "Dificultad (1-10)"
 *                       input in app/dashboard/profile.js, which is the only
 *                       difficulty control the user ever sees. Onboarding writes
 *                       a flat 5, which on this scale reads as "medium" — the
 *                       sane meaning for a default. Values are clamped on read,
 *                       because that input has no validation and accepts up to 99.
 * `subject.averageGrade` 0-10, Spanish school scale. Absent = unknown, NOT zero.
 * `exam.manualPriority`  1-10, what the user picked (EventModal offers 3/5/9).
 * returned `score`       0-100. Wider than 1-10 on purpose: at 1-10 an exam in
 *                        3 days and one in 10 days round to the same number,
 *                        which is exactly how the old escalones lost information.
 */

export const DIFFICULTY_MIN = 1;
export const DIFFICULTY_MAX = 10;
export const DIFFICULTY_NEUTRAL = 5;

export const GRADE_MAX = 10;
/** Used when a subject has no graded exams yet. A real "no data" middle value —
 *  the old code defaulted this factor to its maximum, so an untouched subject
 *  outranked a subject the student was actively passing. */
export const GRADE_NEUTRAL = 5;

/**
 * How fast urgency decays, in days. At `URGENCY_HALF_LIFE` days out an exam sits
 * at half the urgency of an exam today. 7 keeps a full week meaningfully urgent
 * without flattening the month behind it.
 */
export const URGENCY_HALF_LIFE = 7;

/** Weights sum to 100 so a `score` reads as a percentage of "maximum possible". */
export const WEIGHTS = {
  urgency: 40,
  risk: 20,
  difficulty: 15,
  coverage: 15,
  stakes: 10,
};

/** How much an event type inherently matters. An exam moves the average grade;
 *  a homework hand-in usually doesn't. */
export const STAKES_BY_TYPE = {
  exam: 1,
  task: 0.45,
};

/**
 * The user's own priority pick applies as a multiplier, not as another addend.
 * A student saying "this one is important" should reorder the plan without
 * being able to flatten every other signal — which is what a large additive
 * term would do. neutral 5 -> 1.0, low 3 -> 0.9, high 9 -> 1.2.
 */
export const MANUAL_PRIORITY_NEUTRAL = 5;
export const MANUAL_PRIORITY_STEP = 0.05;
export const MANUAL_BOOST_RANGE = [0.8, 1.3];

/**
 * Total study minutes an event is worth, before any scheduling. Difficulty
 * stretches the base; the type sets the base. These are the numbers to tune if
 * plans come out too dense or too thin — nothing else in the algorithm encodes
 * "how much work is this".
 */
export const BASE_EFFORT_MINUTES = {
  exam: 150,
  task: 45,
};
export const EFFORT_DIFFICULTY_RANGE = [0.6, 1.8];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Accepts Date, ISO string, epoch ms, or a Firestore Timestamp. */
export const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value) ? null : value;
  if (typeof value.toDate === 'function') return toDate(value.toDate());
  const parsed = new Date(value);
  return isNaN(parsed) ? null : parsed;
};

const startOfDay = (date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

/**
 * Whole calendar days from `from` to `to`. Compared at midnight, so an exam
 * later *today* is 0 and not -1 — the old `date >= now` comparison dropped a
 * 9:00 exam from the plan at 9:01.
 */
export const daysBetween = (from, to) =>
  Math.round((startOfDay(to) - startOfDay(from)) / MS_PER_DAY);

const normalizeDifficulty = (subject) => {
  const raw = Number(subject?.difficulty);
  if (!Number.isFinite(raw) || raw <= 0) return DIFFICULTY_NEUTRAL;
  return clamp(raw, DIFFICULTY_MIN, DIFFICULTY_MAX);
};

const normalizeType = (event) => (event?.type === 'task' ? 'task' : 'exam');

// ─── Individual factors, all 0..1 ───

/** 1 today, 0.5 at URGENCY_HALF_LIFE, asymptotic to 0. Continuous: no two
 *  different distances ever score the same. */
export const urgencyFactor = (daysUntil) => {
  const days = Math.max(0, daysUntil);
  return 1 / (1 + days / URGENCY_HALF_LIFE);
};

export const stakesFactor = (event) => STAKES_BY_TYPE[normalizeType(event)];

export const difficultyFactor = (subject) =>
  (normalizeDifficulty(subject) - DIFFICULTY_MIN) / (DIFFICULTY_MAX - DIFFICULTY_MIN);

/** Low average grade in a subject = more at stake. Unknown grade sits at the
 *  middle rather than pretending to be a failing one. */
export const riskFactor = (subject) => {
  const raw = Number(subject?.averageGrade);
  const grade = Number.isFinite(raw) ? clamp(raw, 0, GRADE_MAX) : GRADE_NEUTRAL;
  return 1 - grade / GRADE_MAX;
};

/**
 * How much of the expected work is still untouched. This is the signal the old
 * scoring had no way to express: a subject already being studied kept ranking
 * as high as one that hadn't been opened in three weeks.
 */
export const coverageFactor = (studiedMinutes, effortMinutes) => {
  if (!effortMinutes) return 1;
  return 1 - clamp((studiedMinutes || 0) / effortMinutes, 0, 1);
};

export const manualBoost = (event) => {
  const raw = Number(event?.manualPriority ?? event?.priority);
  if (!Number.isFinite(raw)) return 1;
  const boost = 1 + (raw - MANUAL_PRIORITY_NEUTRAL) * MANUAL_PRIORITY_STEP;
  return clamp(boost, MANUAL_BOOST_RANGE[0], MANUAL_BOOST_RANGE[1]);
};

/** Total minutes this event is worth studying. */
export const estimateEffortMinutes = (event, subject) => {
  const base = BASE_EFFORT_MINUTES[normalizeType(event)];
  const [lo, hi] = EFFORT_DIFFICULTY_RANGE;
  const multiplier = lo + difficultyFactor(subject) * (hi - lo);
  return Math.round(base * multiplier);
};

/**
 * Total minutes already studied per subject id, from session history. Computed
 * once per plan build and passed in via ctx, so scoring N exams doesn't rescan
 * the session list N times.
 *
 * @param {Array} sessions - `{ subjectId, duration, date }`, as returned by
 *   services/sessions.js `getSessionHistory`.
 * @param {Object} [options]
 * @param {number} [options.windowDays] - Only count sessions this recent. Study
 *   from two months ago shouldn't read as current coverage.
 * @param {Date} [options.now]
 */
export const summarizeStudyLoad = (sessions, { windowDays = 21, now = new Date() } = {}) => {
  const bySubject = {};
  if (!Array.isArray(sessions)) return bySubject;

  const cutoff = startOfDay(now).getTime() - windowDays * MS_PER_DAY;

  sessions.forEach((session) => {
    const date = toDate(session?.date);
    if (date && date.getTime() < cutoff) return;
    const key = session?.subjectId;
    if (!key) return;
    const minutes = Number(session?.duration);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    bySubject[key] = (bySubject[key] || 0) + minutes;
  });

  return bySubject;
};

/**
 * Score one exam/task.
 *
 * Returns the factor breakdown alongside the score, and that is not decoration:
 * it's what lets the UI say "Álgebra, porque llevas 9 días sin tocarla y el
 * examen es en 4" instead of showing an unexplained number, and it's the only
 * way to debug why the algorithm ranked something where it did.
 *
 * @param {Object} event - exam or task doc: `{ date, type, manualPriority, subjectId }`
 * @param {Object|null} subject - `{ difficulty, averageGrade }`, may be null
 *   (an event with no subject is still plannable — the old code silently
 *   dropped it, see microplanService)
 * @param {Object} [ctx]
 * @param {Date} [ctx.now]
 * @param {Object} [ctx.studiedMinutesBySubject] - from `summarizeStudyLoad`
 * @returns {{ score, factors, weighted, boost, daysUntil, isOverdue, isUndated, effortMinutes }}
 */
export const computeExamPriority = (event, subject, ctx = {}) => {
  const { now = new Date(), studiedMinutesBySubject = {} } = ctx;

  const date = toDate(event?.date);
  const daysUntil = date === null ? null : daysBetween(now, date);
  const effortMinutes = estimateEffortMinutes(event, subject);
  const studied = studiedMinutesBySubject[event?.subjectId] || 0;

  const factors = {
    // An undated event can't be urgent or late; treat it as far out rather than
    // letting NaN propagate into the score.
    urgency: daysUntil === null ? urgencyFactor(URGENCY_HALF_LIFE * 4) : urgencyFactor(daysUntil),
    risk: riskFactor(subject),
    difficulty: difficultyFactor(subject),
    coverage: coverageFactor(studied, effortMinutes),
    stakes: stakesFactor(event),
  };

  // Coverage counts only to the extent that time pressure exists. Not having
  // opened a subject whose exam is a month away is normal; not having opened one
  // whose exam is in three days is alarming, and a flat coverage term couldn't
  // tell those apart. Left flat, it gave every untouched exam a 15-point floor
  // regardless of distance, which was enough to push an exam three weeks out
  // above one in a week.
  const contributions = { ...factors, coverage: factors.coverage * factors.urgency };

  const weighted = Object.keys(WEIGHTS).reduce(
    (total, key) => total + WEIGHTS[key] * contributions[key],
    0
  );
  const boost = manualBoost(event);

  return {
    score: clamp(weighted * boost, 0, 100),
    // `factors` describes the state ("this subject is 100% untouched"), which is
    // what explanatory copy should read. `contributions` is what actually fed the
    // score. They differ for coverage, so both are returned rather than
    // conflating them.
    factors,
    contributions,
    weighted,
    boost,
    daysUntil,
    isUndated: daysUntil === null,
    // Past its date and still not marked done. Worth surfacing (it probably
    // needs a grade) but not worth generating study tasks for.
    isOverdue: daysUntil !== null && daysUntil < 0,
    effortMinutes,
  };
};

/**
 * Score and sort a batch. Highest score first; ties break on the nearer date so
 * ordering is stable and never depends on Firestore's document order.
 *
 * @returns {Array} each event with `{ ...event, priorityScore, priorityDetail }`
 */
export const rankExams = (events, subjects, ctx = {}) => {
  if (!Array.isArray(events)) return [];
  const subjectsById = {};
  (subjects || []).forEach((subject) => {
    if (subject?.id) subjectsById[subject.id] = subject;
  });

  return events
    .map((event) => {
      const detail = computeExamPriority(event, subjectsById[event?.subjectId] || null, ctx);
      return { ...event, priorityScore: detail.score, priorityDetail: detail };
    })
    .sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
      const aDays = a.priorityDetail.daysUntil;
      const bDays = b.priorityDetail.daysUntil;
      if (aDays === null) return 1;
      if (bDays === null) return -1;
      return aDays - bDays;
    });
};

/**
 * Score at or above which the UI treats something as high priority.
 *
 * Replaces the rule `days <= 3 || priority >= 8`. Reference points, all for an
 * untouched exam (the check script prints these, so they can be re-confirmed
 * after any change to WEIGHTS):
 *
 *    3 days out, difficulty 5, no grades           -> 65  high
 *    7 days out, difficulty 8, average 4.5         -> 60  high
 *   10 days out, difficulty 5, marked "Alta"       -> 59  not high
 *   22 days out, difficulty 9, marked "Alta"       -> 56  not high
 *
 * Distance dominates, but a hard subject the student is failing qualifies a week
 * out — something the date-only rule could never express.
 *
 * ⚠️ The gap around the 10-day mark is about one point wide, so which side those
 * middling cases land on is not robust. It's the first thing to revisit against
 * real usage; treat the ordering as trustworthy and this cutoff as provisional.
 */
export const HIGH_PRIORITY_SCORE = 60;

/**
 * Compress a 0-100 score into the legacy 1-10 `priority` field.
 *
 * Kept because that field is already persisted on every exam doc and read by
 * the home screen (`priority >= 8` flags "Prioridad alta") — this lets the new
 * scoring drive existing UI without a data migration. `manualPriority` stays
 * the user's own pick; `priority` becomes the computed value, which is what the
 * schema in services/userData.js intended all along.
 */
export const toLegacyPriority = (score) => clamp(Math.round(score / 10), 1, 10);
