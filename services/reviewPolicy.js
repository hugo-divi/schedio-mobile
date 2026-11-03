/**
 * When Schedio may ask for a Play Store rating, and when it must not.
 *
 * Asking used to live only in Ajustes, where almost nobody goes, so the
 * students most likely to rate well — the ones whose plan just worked — were
 * never asked. Asking carelessly is worse than not asking, though: a sheet that
 * appears on day one, mid-task or every week is what gets one-star reviews and
 * burns Google's quota. So this decides, and it is deliberately strict.
 *
 * What it encodes, following Google Play's guidance for the in-app review API:
 *
 *  · Only after real use. Enough sessions, spread over several days, on an
 *    account that is at least a week old — someone who has seen the plan work,
 *    not someone on their first evening.
 *  · Only at a good moment, and only an objective one: the day's plan just
 *    completed, a streak milestone, a good grade saved. Never decided by
 *    asking the student how they feel first — Google forbids any question
 *    before the card ("¿Te gusta Schedio?"), and asking only the happy ones
 *    would be review gating.
 *  · Rarely. At most once per COOLDOWN_DAYS (about once a term), at most
 *    MAX_PROMPTS times on a device, and never twice in one app run. Google
 *    applies its own quota on top and may show nothing at all; that is fine.
 *  · Never from a button. A button that might do nothing is broken by design,
 *    so "Valorar Schedio" in Ajustes opens the store listing instead.
 *  · Never on web: there is no store there (and iOS is a PWA for now).
 *
 * Pure — no React Native, no storage — so scripts/check-review-prompt.mjs can
 * run it in Node. services/storeReview.js does the reading, writing and asking.
 */

export const REVIEW_MOMENTS = {
  DAY_COMPLETED: 'day_completed',
  STREAK_MILESTONE: 'streak_milestone',
  GOOD_GRADE: 'good_grade',
};

/** Completed study sessions before the first ask. */
export const MIN_SESSIONS = 5;
/** Distinct days with a session — five sessions in one evening isn't "use". */
export const MIN_ACTIVE_DAYS = 3;
/** Past the first week: onboarding, the tour and first-day novelty are over. */
export const MIN_ACCOUNT_AGE_DAYS = 7;
/** About one school term between asks. */
export const COOLDOWN_DAYS = 120;
/** Lifetime asks on a device. Three terms of asking is plenty. */
export const MAX_PROMPTS = 3;
/** A "notable" or better. */
export const GOOD_GRADE = 7;
/** Streak lengths worth calling a moment. */
export const STREAK_MILESTONES = [7, 14, 30, 60, 100];
/** A moment is fresh for this long; after that it isn't the moment any more. */
export const MOMENT_TTL_MS = 10 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') return toDate(value.toDate());
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** Local calendar day, the same way the plan screen buckets tasks. */
const dayKey = (value) => {
  const date = toDate(value);
  if (!date) return null;
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

/**
 * True when `taskId` is one of today's tasks and, with it, every task of today
 * is done. Ticking a task from another day doesn't count: that is getting
 * ahead, not finishing the day, even if today happens to be finished already.
 */
export const dayCompletedBy = (tasks, taskId, now = new Date()) => {
  const today = dayKey(now);
  const todays = (tasks || []).filter((task) => task && dayKey(task.date) === today);
  if (!todays.some((task) => task.id === taskId)) return false;
  return todays.length > 0 && todays.every((task) => task.completed);
};

/** The session that just ended moved the streak onto a milestone. */
export const reachedStreakMilestone = (previous, current) =>
  Number(current) > Number(previous) && STREAK_MILESTONES.includes(Number(current));

/** A grade worth celebrating, on the app's 0–10 scale. */
export const isGoodGrade = (grade) => Number.isFinite(Number(grade)) && Number(grade) >= GOOD_GRADE;

/** Distinct local days in a list of sessions. */
export const activeDaysIn = (sessions) =>
  new Set((sessions || []).map((session) => dayKey(session?.date)).filter(Boolean)).size;

/**
 * Whether to ask now. Returns the reason either way, so the check script — and
 * a log line — can say exactly which rule decided.
 *
 * @param {Object} input
 * @param {string} input.platform - Platform.OS
 * @param {string} input.moment - one of REVIEW_MOMENTS
 * @param {Date}   [input.now]
 * @param {number} input.totalSessions
 * @param {number} input.activeDays
 * @param {*}      [input.accountCreatedAt] - Date, Firestore Timestamp, or nothing
 * @param {{count?: number, lastAskedAt?: number|null}} [input.history] - this device's past asks
 * @param {boolean} [input.askedThisRun]
 */
export const reviewDecision = ({
  platform,
  moment,
  now = new Date(),
  totalSessions = 0,
  activeDays = 0,
  accountCreatedAt = null,
  history = {},
  askedThisRun = false,
}) => {
  if (platform !== 'android' && platform !== 'ios') return { ask: false, reason: 'platform' };
  if (!Object.values(REVIEW_MOMENTS).includes(moment)) return { ask: false, reason: 'moment' };
  if (askedThisRun) return { ask: false, reason: 'already-this-run' };

  const count = Number(history?.count) || 0;
  if (count >= MAX_PROMPTS) return { ask: false, reason: 'lifetime-cap' };

  const lastAskedAt = Number(history?.lastAskedAt) || 0;
  if (lastAskedAt && now.getTime() - lastAskedAt < COOLDOWN_DAYS * DAY_MS) {
    return { ask: false, reason: 'cooldown' };
  }

  if ((Number(totalSessions) || 0) < MIN_SESSIONS) return { ask: false, reason: 'few-sessions' };
  if ((Number(activeDays) || 0) < MIN_ACTIVE_DAYS) return { ask: false, reason: 'few-days' };

  // Unknown age doesn't block on its own: the two rules above already demand
  // several days of real use.
  const created = toDate(accountCreatedAt);
  if (created && now.getTime() - created.getTime() < MIN_ACCOUNT_AGE_DAYS * DAY_MS) {
    return { ask: false, reason: 'new-account' };
  }

  return { ask: true, reason: 'ok' };
};
