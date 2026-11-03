/**
 * Badges: the catalogue and the rules for earning them.
 *
 * Pure — no React Native, no Firebase, no icon components (icons travel as
 * lucide names, resolved by `getIcon` in services/gamification.js) — so
 * scripts/check-badges.mjs runs these exact rules in Node.
 *
 * ─── One rule for every badge ───
 *
 * Every badge is a number compared with a target: sessions done, best streak,
 * best grade, days with the whole plan finished… Even the "event" ones are:
 * "Madrugador" is `earlySessions >= 1`. The caller folds whatever just
 * happened (a session, a grade, a tick) into the numbers first, and then the
 * same function decides for everything. That is what makes the system
 * idempotent: a badge depends on what the student has done, not on which
 * screen noticed it, so evaluating twice can't award twice — and a badge
 * added later can be granted to whoever had already earned it.
 *
 * The first version evaluated each badge against "what just happened" only,
 * with a different signature per badge. That is how "Excelencia" ended up
 * reading a grade out of a session's `{ duration }` and never unlocking.
 *
 * ─── Two catalogues ───
 *
 * The nine original badges (`legacy: true`) are what everyone has. The rest,
 * the tiers and the XP each one is worth are in beta (services/beta.js) while
 * they are tested.
 */

export const TIERS = {
  bronze: { id: 'bronze', label: 'Bronce', color: '#C68A54', xp: 50 },
  silver: { id: 'silver', label: 'Plata', color: '#AEB8C4', xp: 150 },
  gold: { id: 'gold', label: 'Oro', color: '#E2B34A', xp: 400 },
};

export const CATEGORIES = [
  { id: 'plan', label: 'Plan', blurb: 'Hacer lo que tocaba, el día que tocaba.' },
  { id: 'streak', label: 'Constancia', blurb: 'Días seguidos cumpliendo.' },
  { id: 'effort', label: 'Esfuerzo', blurb: 'Sesiones y horas que se acumulan.' },
  { id: 'exams', label: 'Exámenes', blurb: 'Lo que el trabajo devuelve.' },
  { id: 'habits', label: 'Hábitos', blurb: 'Cómo estudias, no solo cuánto.' },
];

/**
 * The numbers every badge is decided on. Anything missing counts as 0, so an
 * account that predates a counter simply hasn't earned what depends on it.
 */
export const BADGE_METRICS = [
  'totalSessions',
  'totalMinutes',
  'streak',
  'bestStreak',
  'longestSession',
  'earlySessions',
  'lateSessions',
  'planDays',
  'aheadSessions',
  'gradedExams',
  'bestGrade',
  'uploads',
  'subjectsThisWeek',
];

const metric = (stats, key) => Math.max(0, Number(stats?.[key]) || 0);

/** A streak badge goes by the best streak ever, so losing a run never un-earns it. */
const streakValue = (stats) => Math.max(metric(stats, 'streak'), metric(stats, 'bestStreak'));

const badge = (def) => ({ legacy: false, cumulative: true, ...def });

export const BADGE_CATALOG = [
  // ── Plan ──
  badge({
    id: 'plan_day_1',
    name: 'Día redondo',
    description: 'Completa todo el plan de un día.',
    icon: 'CalendarCheck',
    color: '#2979FF',
    category: 'plan',
    tier: 'bronze',
    value: (s) => metric(s, 'planDays'),
    target: 1,
  }),
  badge({
    id: 'plan_day_10',
    name: 'Plan al día',
    description: 'Completa el plan entero 10 días.',
    icon: 'CalendarCheck',
    color: '#2979FF',
    category: 'plan',
    tier: 'silver',
    value: (s) => metric(s, 'planDays'),
    target: 10,
  }),
  badge({
    id: 'plan_day_30',
    name: 'Método Schedio',
    description: 'Completa el plan entero 30 días.',
    icon: 'CalendarRange',
    color: '#2979FF',
    category: 'plan',
    tier: 'gold',
    value: (s) => metric(s, 'planDays'),
    target: 30,
  }),
  badge({
    id: 'ahead',
    name: 'Adelantado',
    description: 'Adelanta una sesión de otro día y complétala.',
    icon: 'FastForward',
    color: '#158181',
    category: 'plan',
    tier: 'bronze',
    value: (s) => metric(s, 'aheadSessions'),
    target: 1,
  }),

  // ── Constancia ──
  badge({
    id: 'streak_3',
    name: 'Arranque',
    description: 'Consigue una racha de 3 días.',
    icon: 'Flame',
    color: '#FF9500',
    category: 'streak',
    tier: 'bronze',
    value: streakValue,
    target: 3,
  }),
  badge({
    id: 'streak_master',
    name: 'En Llamas',
    description: 'Mantén una racha de 7 días.',
    icon: 'Zap',
    color: '#FF3B30',
    category: 'streak',
    tier: 'silver',
    legacy: true,
    value: streakValue,
    target: 7,
  }),
  badge({
    id: 'streak_14',
    name: 'Dos semanas',
    description: 'Mantén una racha de 14 días.',
    icon: 'Flame',
    color: '#FF6B00',
    category: 'streak',
    tier: 'silver',
    value: streakValue,
    target: 14,
  }),
  badge({
    id: 'iron_streak',
    name: 'Racha de Hierro',
    description: 'Mantén una racha de 30 días.',
    icon: 'Flame',
    color: '#FF3B30',
    category: 'streak',
    tier: 'gold',
    legacy: true,
    value: streakValue,
    target: 30,
  }),
  badge({
    id: 'streak_60',
    name: 'Imparable',
    description: 'Mantén una racha de 60 días.',
    icon: 'Mountain',
    color: '#BF5AF2',
    category: 'streak',
    tier: 'gold',
    value: streakValue,
    target: 60,
  }),

  // ── Esfuerzo ──
  badge({
    id: 'first_steps',
    name: 'Primeros Pasos',
    description: 'Completa tu primera sesión de estudio.',
    icon: 'BookOpen',
    color: '#32ADE6',
    category: 'effort',
    tier: 'bronze',
    legacy: true,
    value: (s) => metric(s, 'totalSessions'),
    target: 1,
  }),
  badge({
    id: 'sessions_25',
    name: 'Veinticinco',
    description: 'Completa 25 sesiones de estudio.',
    icon: 'Layers',
    color: '#32ADE6',
    category: 'effort',
    tier: 'silver',
    value: (s) => metric(s, 'totalSessions'),
    target: 25,
  }),
  badge({
    id: 'sessions_100',
    name: 'Centenario',
    description: 'Completa 100 sesiones de estudio.',
    icon: 'Trophy',
    color: '#32ADE6',
    category: 'effort',
    tier: 'gold',
    value: (s) => metric(s, 'totalSessions'),
    target: 100,
  }),
  badge({
    id: 'hours_10',
    name: 'Diez horas',
    description: 'Acumula 10 horas de estudio.',
    icon: 'Hourglass',
    color: '#D4A94C',
    category: 'effort',
    tier: 'bronze',
    value: (s) => metric(s, 'totalMinutes'),
    target: 10 * 60,
  }),
  badge({
    id: 'century_club',
    name: 'Club de las 100 Horas',
    description: 'Supera las 100 horas de estudio acumuladas.',
    icon: 'Award',
    color: '#D4A94C',
    category: 'effort',
    tier: 'gold',
    legacy: true,
    value: (s) => metric(s, 'totalMinutes'),
    target: 100 * 60,
  }),
  badge({
    id: 'marathon',
    // A best value, not a running total: there's no \"almost\" to show.
    cumulative: false,
    name: 'Maratonista',
    description: 'Completa una sesión de más de 60 minutos.',
    icon: 'Clock',
    color: '#FF9500',
    category: 'effort',
    tier: 'silver',
    legacy: true,
    value: (s) => metric(s, 'longestSession'),
    target: 60,
  }),
  badge({
    id: 'double_marathon',
    // A best value, not a running total: there's no \"almost\" to show.
    cumulative: false,
    name: 'Doble Maratón',
    description: 'Completa una sesión de más de 120 minutos.',
    icon: 'Clock',
    color: '#FF6B00',
    category: 'effort',
    tier: 'gold',
    legacy: true,
    value: (s) => metric(s, 'longestSession'),
    target: 120,
  }),

  // ── Exámenes ──
  badge({
    id: 'first_grade',
    name: 'Primera nota',
    description: 'Apunta la nota de un examen.',
    icon: 'GraduationCap',
    color: '#5AB98A',
    category: 'exams',
    tier: 'bronze',
    value: (s) => metric(s, 'gradedExams'),
    target: 1,
  }),
  badge({
    id: 'notable',
    // A best value, not a running total: there's no \"almost\" to show.
    cumulative: false,
    name: 'Notable',
    description: 'Saca un 7 o más en un examen.',
    icon: 'Medal',
    color: '#5AB98A',
    category: 'exams',
    tier: 'bronze',
    value: (s) => metric(s, 'bestGrade'),
    target: 7,
  }),
  badge({
    id: 'sobresaliente',
    // A best value, not a running total: there's no \"almost\" to show.
    cumulative: false,
    name: 'Sobresaliente',
    description: 'Saca un 9 o más en un examen.',
    icon: 'Medal',
    color: '#FFD60A',
    category: 'exams',
    tier: 'silver',
    value: (s) => metric(s, 'bestGrade'),
    target: 9,
  }),
  badge({
    id: 'excellence',
    // A best value, not a running total: there's no \"almost\" to show.
    cumulative: false,
    name: 'Excelencia',
    description: 'Consigue un 10 en un examen.',
    icon: 'Star',
    color: '#FFD60A',
    category: 'exams',
    tier: 'gold',
    legacy: true,
    value: (s) => metric(s, 'bestGrade'),
    target: 10,
  }),
  badge({
    id: 'graded_10',
    name: 'Curso en marcha',
    description: 'Apunta las notas de 10 exámenes.',
    icon: 'BookCheck',
    color: '#5AB98A',
    category: 'exams',
    tier: 'silver',
    value: (s) => metric(s, 'gradedExams'),
    target: 10,
  }),

  // ── Hábitos ──
  // The two time windows stop at midnight and start again at 5:00 on purpose:
  // the first version rewarded studying at three in the morning.
  badge({
    id: 'early_bird',
    name: 'Madrugador',
    description: 'Completa una sesión entre las 5:00 y las 8:00.',
    icon: 'Sunrise',
    color: '#FF9F0A',
    category: 'habits',
    tier: 'bronze',
    legacy: true,
    value: (s) => metric(s, 'earlySessions'),
    target: 1,
  }),
  badge({
    id: 'night_owl',
    name: 'Búho Nocturno',
    description: 'Completa una sesión entre las 21:00 y la medianoche.',
    icon: 'Moon',
    color: '#5856D6',
    category: 'habits',
    tier: 'bronze',
    legacy: true,
    value: (s) => metric(s, 'lateSessions'),
    target: 1,
  }),
  badge({
    id: 'variety',
    name: 'Todoterreno',
    description: 'Estudia 4 asignaturas distintas en una misma semana.',
    icon: 'Shuffle',
    color: '#796CB0',
    category: 'habits',
    tier: 'silver',
    value: (s) => metric(s, 'subjectsThisWeek'),
    target: 4,
  }),
  badge({
    id: 'backpack',
    name: 'Mochila lista',
    description: 'Guarda tu primer apunte en la Mochila.',
    icon: 'Backpack',
    color: '#8C704B',
    category: 'habits',
    tier: 'bronze',
    value: (s) => metric(s, 'uploads'),
    target: 1,
  }),
];

const BY_ID = new Map(BADGE_CATALOG.map((b) => [b.id, b]));

export const badgeById = (id) => BY_ID.get(id) || null;

/** What each account sees: the original nine, or everything while in beta. */
export const catalogFor = ({ beta = false } = {}) =>
  beta ? BADGE_CATALOG : BADGE_CATALOG.filter((b) => b.legacy);

/** How far a badge is: `{ value, target, ratio }`, ratio capped at 1. */
export const progressOf = (entry, stats) => {
  const value = entry.value(stats);
  return {
    value: Math.min(value, entry.target),
    target: entry.target,
    ratio: Math.min(1, value / entry.target),
  };
};

export const isEarned = (entry, stats) => entry.value(stats) >= entry.target;

/**
 * Badges `stats` earns that aren't in `owned` yet, in catalogue order. The
 * only place that decides an unlock.
 */
export const newlyEarned = (owned, stats, { beta = false } = {}) => {
  const have = new Set(owned || []);
  return catalogFor({ beta })
    .filter((entry) => !have.has(entry.id) && isEarned(entry, stats))
    .map((entry) => entry.id);
};

/** XP a set of unlocks is worth — beta only, where tiers exist. */
export const rewardFor = (ids, { beta = false } = {}) =>
  beta ? ids.reduce((sum, id) => sum + (TIERS[badgeById(id)?.tier]?.xp || 0), 0) : 0;

/**
 * The locked badges closest to unlocking, for the "Más cerca" row. Only
 * countable ones that have actually been started: a 0/1 badge has no
 * "almost".
 */
export const closestToUnlock = (owned, stats, { beta = false, limit = 3 } = {}) => {
  const have = new Set(owned || []);
  return catalogFor({ beta })
    .filter((entry) => !have.has(entry.id) && entry.target > 1 && entry.cumulative)
    .map((entry) => ({ entry, ...progressOf(entry, stats) }))
    .filter((row) => row.value > 0 && row.ratio < 1)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, limit);
};

// ── Building the numbers ──────────────────────────────────────────────────

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') return toDate(value.toDate());
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** The study windows "Madrugador" and "Búho Nocturno" count. */
export const isEarlyHour = (hour) => hour >= 5 && hour < 8;
export const isLateHour = (hour) => hour >= 21;

/**
 * Turns what the app already stores into the numbers above.
 *
 * `history` (recent sessions) only feeds the beta catalogue, which may grant
 * a badge for something done before it existed. The original nine are still
 * decided on what just happened plus the running totals, as they always were,
 * so nobody outside the beta gets a surprise unlock for an old session.
 *
 * @param {Object} input
 * @param {Object} input.stats - the store's `stats` (totalSessions, totalTime, streak…)
 * @param {Object} [input.event] - what just happened: `{ duration, endedAt, aheadOfPlan, grade, subjectId }`
 * @param {Array}  [input.history] - recent sessions `{ duration, date, subjectId }`
 * @param {Object} [input.extra] - `{ bestStreak, gradedExams, bestGrade, uploads }`
 * @param {boolean} [input.beta]
 * @param {Date}   [input.now]
 */
export const buildBadgeStats = ({
  stats = {},
  event = null,
  history = [],
  extra = {},
  beta = false,
  now = new Date(),
}) => {
  const out = {
    totalSessions: Number(stats.totalSessions) || 0,
    totalMinutes: Number(stats.totalTime) || 0,
    streak: Number(stats.streak) || 0,
    bestStreak: beta ? Math.max(Number(stats.bestStreak) || 0, Number(extra.bestStreak) || 0) : 0,
    longestSession: 0,
    earlySessions: 0,
    lateSessions: 0,
    planDays: beta
      ? Array.isArray(stats.planDaysCompleted)
        ? stats.planDaysCompleted.length
        : 0
      : 0,
    aheadSessions: beta ? Number(stats.aheadSessions) || 0 : 0,
    gradedExams: beta
      ? Math.max(Number(stats.gradedExams) || 0, Number(extra.gradedExams) || 0)
      : 0,
    bestGrade: Math.max(
      beta ? Number(stats.bestGrade) || 0 : 0,
      beta ? Number(extra.bestGrade) || 0 : 0
    ),
    uploads: beta ? Number(extra.uploads) || 0 : 0,
    subjectsThisWeek: 0,
  };

  const sessions = beta ? [...(history || [])] : [];
  if (event?.duration > 0) {
    sessions.push({
      duration: event.duration,
      date: event.endedAt || now,
      subjectId: event.subjectId || null,
    });
  }

  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const subjectsThisWeek = new Set();
  sessions.forEach((session) => {
    const minutes = Number(session?.duration) || 0;
    if (minutes <= 0) return;
    out.longestSession = Math.max(out.longestSession, minutes);
    const at = toDate(session.date);
    if (!at) return;
    const hour = at.getHours();
    if (isEarlyHour(hour)) out.earlySessions += 1;
    if (isLateHour(hour)) out.lateSessions += 1;
    if (session.subjectId && at.getTime() >= weekAgo) subjectsThisWeek.add(session.subjectId);
  });
  out.subjectsThisWeek = beta ? subjectsThisWeek.size : 0;

  if (event?.aheadOfPlan && beta) out.aheadSessions += 1;
  if (Number.isFinite(Number(event?.grade))) {
    out.bestGrade = Math.max(out.bestGrade, Number(event.grade));
  }

  return out;
};

// ── Reloading without going backwards ─────────────────────────────────────

/**
 * Merges a freshly read user document into what memory already holds for the
 * same account (store/userStore.js `loadUserData`).
 *
 * A read can be older than memory: Inicio reads the document before a
 * session's writes have landed, on every return after a session. Taking that
 * read as the truth dropped the badge the session had just unlocked, and the
 * next session unlocked — and celebrated — it again. Badges are only ever
 * added and XP and the session totals only ever grow, so the union / the
 * maximum is always right. The current streak can legitimately go down, so
 * it is left to the read.
 */
export const mergeReloadedProgress = ({ previousGame, previousStats, game, stats }) => {
  const nextGame = {
    ...game,
    badges: [...new Set([...(previousGame?.badges || []), ...(game?.badges || [])])],
    badgeUnlocks: { ...(previousGame?.badgeUnlocks || {}), ...(game?.badgeUnlocks || {}) },
    xp: Math.max(Number(previousGame?.xp) || 0, Number(game?.xp) || 0),
  };
  const nextStats = { ...stats };
  ['totalSessions', 'totalTime', 'bestStreak', 'aheadSessions'].forEach((key) => {
    nextStats[key] = Math.max(Number(previousStats?.[key]) || 0, Number(stats?.[key]) || 0);
  });
  nextStats.planDaysCompleted = [
    ...new Set([...(previousStats?.planDaysCompleted || []), ...(stats?.planDaysCompleted || [])]),
  ];
  return { game: nextGame, stats: nextStats };
};
