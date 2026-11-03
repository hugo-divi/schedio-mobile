/**
 * The daily plan reminder: whether it goes out, and what it says.
 *
 * Pure — no Firebase, nothing but Intl — so the same file serves three
 * readers: the scheduled function in index.js, scripts/check-daily-reminder.mjs,
 * and the app's preview of the push (components/DailyReminderSheet.js), which
 * therefore shows exactly the sentence that will arrive.
 *
 * ─── The contract with the student ───
 *
 * There is ONE Schedio push a day for a student who turns this on, at the time
 * they chose, carrying the most important thing about that day:
 *
 *   1. an exam in 1 or 3 days — the alerts promised at onboarding, folded in
 *      here instead of arriving separately at 08:05;
 *   2. otherwise what's left of today's plan, if anything is;
 *   3. otherwise, on Sundays, how the week went.
 *
 * And it stays quiet when there is nothing to say:
 *
 *   · today's plan is already done (or only optional sessions are left);
 *   · it's one of their free days (unless they asked for those too) or a day
 *     they spent a joker on ("Hoy no puedo") — exam alerts still go;
 *   · they have ignored the last PAUSE_AFTER_IGNORED reminders without opening
 *     the app. It pauses itself and comes back the day after they return:
 *     a reminder nobody reads is how an app gets its notifications switched
 *     off for good. Exam alerts still go while paused.
 *
 * The plan it reads is the one the app last saved. Inicio and Plan regenerate
 * it on open, so for someone who uses the app it is today's; for someone who
 * hasn't opened it today it was computed earlier, and the push then only names
 * the first session rather than a total that may have shifted.
 */

const SUPPORTED_TIMEZONES = ['Europe/Madrid', 'Atlantic/Canary'];
const DEFAULT_TIMEZONE = 'Europe/Madrid';
const SLOT_MINUTES = 15;
const EARLIEST_TIME = '07:00';
const LATEST_TIME = '22:00';
const DEFAULT_TIME = '17:00';
const PAUSE_AFTER_IGNORED = 5;
/** Sábado y domingo, lunes = 0 — the same default as services/streakRules.js. */
const DEFAULT_FREE_DAYS = [5, 6];
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TEXT = 70;

const WEEKDAYS = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

// ── Time ─────────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0');

const partsIn = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    weekday: get('weekday'),
  };
};

const normalizeTimeZone = (tz) => (SUPPORTED_TIMEZONES.includes(tz) ? tz : DEFAULT_TIMEZONE);

/** 'HH:MM' → minutes after midnight, or null if it isn't a time we offer. */
const parseTime = (time) => {
  const match = /^(\d{2}):(\d{2})$/.exec(String(time || ''));
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (Number(match[2]) % SLOT_MINUTES !== 0) return null;
  if (minutes < parseTime.earliest || minutes > parseTime.latest) return null;
  return minutes;
};
parseTime.earliest = 7 * 60;
parseTime.latest = 22 * 60;

const formatTime = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

const isValidTime = (time) => parseTime(time) !== null;

/** Every time the app offers, in order. */
const allTimes = () => {
  const out = [];
  for (let m = parseTime.earliest; m <= parseTime.latest; m += SLOT_MINUTES)
    out.push(formatTime(m));
  return out;
};

/** The key the function queries by: zone and local time, e.g. "Europe/Madrid@17:00". */
const reminderKey = (tz, time) => `${normalizeTimeZone(tz)}@${time}`;

/** 'YYYY-MM-DD' of `date` in `tz`. */
const dayKeyIn = (date, tz) => {
  const p = partsIn(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};

const dayNumberIn = (date, tz) => {
  const p = partsIn(date, tz);
  return Date.UTC(p.year, p.month - 1, p.day) / DAY_MS;
};

/** Whole calendar days from `now` to `date`, in `tz` (0 = same day). */
const daysUntil = (date, now, tz) => dayNumberIn(date, tz) - dayNumberIn(now, tz);

/** The 15-minute slot `date` falls in, as 'HH:MM' in `tz`. */
const slotIn = (date, tz) => {
  const p = partsIn(date, tz);
  const minutes = p.hour * 60 + Math.floor(p.minute / SLOT_MINUTES) * SLOT_MINUTES;
  return formatTime(minutes);
};

/**
 * Keys a run at `now` sends to: this slot in every zone, and the previous one
 * as a catch-up. A run that starts late or fails is picked up by the next;
 * `lastSentDate` stops anyone from getting it twice.
 */
const keysForRun = (now) => {
  const keys = new Set();
  SUPPORTED_TIMEZONES.forEach((tz) => {
    keys.add(reminderKey(tz, slotIn(now, tz)));
    keys.add(reminderKey(tz, slotIn(new Date(now.getTime() - SLOT_MINUTES * 60 * 1000), tz)));
  });
  return [...keys];
};

/** Same string `new Date().toDateString()` gives on a device in `tz`. */
const dateStringIn = (date, tz) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('weekday')} ${get('month')} ${get('day')} ${get('year')}`;
};

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
};

const toDate = (value) => {
  const t = toMillis(value);
  return t ? new Date(t) : null;
};

// ── Copy ─────────────────────────────────────────────────────────────────

const clip = (text, max = MAX_TEXT) => {
  const s = String(text || '').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
};

/** Subject names in a title: lock screens cut titles at about 40 characters. */
const MAX_TITLE_NAME = 28;
const titleName = (text) => clip(text, MAX_TITLE_NAME);

/** Ends a sentence the plan wrote, so another can follow it. */
const sentence = (text) => {
  const s = clip(text);
  return s && !/[.!?…]$/.test(s) ? `${s}.` : s;
};

const minutesOf = (tasks) => tasks.reduce((sum, t) => sum + (Number(t.duration) || 0), 0);

const examNoun = (exam) => {
  const subject = exam.subjectName || exam.name || 'tu examen';
  return exam.type === 'task'
    ? {
        tomorrow: `Mañana entregas ${titleName(exam.name || subject)}`,
        inThree: `Entregas ${titleName(exam.name || subject)} en 3 días`,
        short: titleName(exam.name || subject),
      }
    : {
        tomorrow: `Mañana: examen de ${titleName(subject)}`,
        inThree: `Tu examen de ${titleName(subject)} es en 3 días`,
        short: titleName(subject),
      };
};

const planMessage = ({ pendingCore, doneToday, planFresh, nearestExamDays }) => {
  const first = pendingCore[0];
  const total = minutesOf(pendingCore);
  const subject = titleName(first.subjectName || 'Estudio');
  const examTail =
    nearestExamDays !== null && nearestExamDays >= 2 && nearestExamDays <= 7
      ? ` Examen en ${nearestExamDays} días.`
      : '';

  if (doneToday) {
    return {
      title: planFresh ? `Te quedan ${total} min de tu plan` : `Te queda ${subject} en tu plan`,
      body: `Sigue con ${subject}: ${sentence(first.text)}${examTail}`,
    };
  }
  if (pendingCore.length === 1 || !planFresh) {
    return {
      title: `Hoy toca ${subject} · ${first.duration} min`,
      body: `${sentence(first.text)}${examTail}`.trim(),
    };
  }
  const second = pendingCore[1];
  const rest = pendingCore.length - 2;
  return {
    title: `Hoy: ${total} min de estudio`,
    body:
      `Empieza por ${subject} (${first.duration} min), luego ${titleName(second.subjectName || 'otra')}` +
      `${rest > 0 ? ` y ${rest} más` : ''}.${examTail}`,
  };
};

const examMessage = ({ alerts, pendingCore, examTasksMinutes }) => {
  const [main, other] = alerts;
  const noun = examNoun(main.exam);
  let title;
  let body;
  if (main.days === 1) {
    title = noun.tomorrow;
    body =
      examTasksMinutes > 0
        ? `Hoy toca el repaso final (${examTasksMinutes} min). Luego descansa bien.`
        : 'Repasa lo esencial hoy y descansa bien.';
  } else {
    title = noun.inThree;
    body =
      pendingCore.length > 0
        ? `Hoy: ${titleName(pendingCore[0].subjectName || 'estudio')} ${pendingCore[0].duration} min. Vas con margen.`
        : 'Aún tienes margen para organizarlo con calma.';
  }
  if (other) {
    body += ` Y ${examNoun(other.exam).short} ${other.days === 1 ? 'mañana' : 'en 3 días'}.`;
  }
  return { title, body };
};

// ── The decision ─────────────────────────────────────────────────────────

/**
 * @param {Object} input
 * @param {Date}   input.now
 * @param {Object} input.user - the user document's data
 * @param {Object} [input.streak] - `streaks/{uid}`: `{ freeDays, restDays }`
 * @param {Array}  [input.exams] - pending exams/tasks `{ id, name, subjectName, date, type, notified1Day, notified3Days }`
 * @param {number} [input.weekSessions] - sessions in the last 7 days (only read on Sundays)
 * @param {boolean} [input.betaOnly] - while in beta, only `betaTester` accounts
 * @returns {{ send: false, reason: string } | {
 *   send: true, reason: string, kind: string, title: string, body: string,
 *   data: Object, examUpdates: Array<{id: string, field: string}>,
 *   isPlan: boolean, ignoredCount?: number, today: string
 * }}
 */
const decideDailyReminder = ({
  now,
  user,
  streak = {},
  exams = [],
  weekSessions = 0,
  betaOnly = true,
}) => {
  const settings = user?.dailyReminder || {};
  const tz = normalizeTimeZone(settings.tz);
  const today = dayKeyIn(now, tz);
  const state = user?.dailyReminderState || {};
  const skip = (reason) => ({ send: false, reason, today });

  if (!settings.enabled) return skip('disabled');
  if (betaOnly && user?.betaTester !== true) return skip('not-beta');
  if (!user?.fcmToken) return skip('no-token');
  if (state.lastSentDate === today) return skip('already-sent-today');
  // Any other Schedio push today (the one-a-day rule the other functions
  // share) — rare for these accounts, which those functions skip.
  if (user?.lastNotifiedDate === dayKeyIn(now, DEFAULT_TIMEZONE)) {
    return skip('already-notified-today');
  }

  // ── What the day holds ──
  const tasks = (Array.isArray(user?.microplans) ? user.microplans : []).filter(
    (task) => task && !task.dismissed && task.date && dayKeyIn(new Date(task.date), tz) === today
  );
  const pendingCore = tasks.filter((t) => !t.completed && !t.isOptional);
  const doneToday = tasks.some((t) => t.completed);
  const planFresh = user?.stats?.lastPlanGenerationDate === dateStringIn(now, tz);

  const pending = (exams || [])
    .filter((exam) => exam && !exam.completed && toDate(exam.date))
    .map((exam) => ({ exam, days: daysUntil(toDate(exam.date), now, tz) }))
    .filter((row) => row.days >= 0)
    .sort((a, b) => a.days - b.days);
  const alerts = pending.filter(
    (row) =>
      (row.days === 1 && !row.exam.notified1Day) || (row.days === 3 && !row.exam.notified3Days)
  );
  const nearestExamDays = pending.find((row) => row.exam.type !== 'task')?.days ?? null;

  const freeDays = Array.isArray(streak?.freeDays)
    ? streak.freeDays.map(Number)
    : DEFAULT_FREE_DAYS;
  const weekday = WEEKDAYS[partsIn(now, tz).weekday];
  const isFreeDay = freeDays.includes(weekday);
  const isJokerDay = Array.isArray(streak?.restDays) && streak.restDays.includes(today);

  // ── Ignored? ──
  const lastPlanSentAt = toMillis(state.lastPlanSentAt);
  const lastOpenAt = toMillis(user?.lastOpenTimestamp);
  const cameBack = !lastPlanSentAt || lastOpenAt > lastPlanSentAt;
  const ignoredCount = cameBack ? 0 : (Number(state.ignoredCount) || 0) + 1;
  const paused = ignoredCount >= PAUSE_AFTER_IGNORED;

  // 1. Exam alerts — whatever kind of day it is.
  if (alerts.length > 0) {
    const examTasksMinutes = minutesOf(pendingCore.filter((t) => t.examId === alerts[0].exam.id));
    const message = examMessage({
      alerts,
      pendingCore: isJokerDay ? [] : pendingCore,
      examTasksMinutes: isJokerDay ? 0 : examTasksMinutes,
    });
    return {
      send: true,
      reason: 'exam-alert',
      kind: 'exam_alert',
      ...message,
      data: { kind: 'exam_alert', examId: String(alerts[0].exam.id) },
      examUpdates: alerts.map((row) => ({
        id: row.exam.id,
        field: row.days === 1 ? 'notified1Day' : 'notified3Days',
      })),
      isPlan: false,
      today,
    };
  }

  // 2. The plan.
  const planBlocked = isJokerDay
    ? 'joker-day'
    : isFreeDay && !settings.includeFreeDays
      ? 'free-day'
      : paused
        ? 'paused-ignored'
        : pendingCore.length === 0
          ? doneToday
            ? 'plan-done'
            : 'nothing-planned'
          : null;

  if (!planBlocked) {
    return {
      send: true,
      reason: 'plan',
      kind: 'daily_plan',
      ...planMessage({ pendingCore, doneToday, planFresh, nearestExamDays }),
      data: { kind: 'daily_plan', taskId: String(pendingCore[0].id || '') },
      examUpdates: [],
      isPlan: true,
      ignoredCount,
      today,
    };
  }

  // 3. Sundays: the week, if there was one. Not after a joker, not while
  // paused for being ignored.
  if (weekday === 6 && weekSessions > 0 && planBlocked !== 'paused-ignored' && !isJokerDay) {
    return {
      send: true,
      reason: 'weekly-summary',
      kind: 'weekly_summary',
      title: 'Schedio',
      body: `Esta semana completaste ${weekSessions} ${
        weekSessions === 1 ? 'sesión' : 'sesiones'
      } de estudio. Buen ritmo.`,
      data: { kind: 'weekly_summary' },
      examUpdates: [],
      isPlan: false,
      today,
    };
  }

  return skip(planBlocked);
};

module.exports = {
  SUPPORTED_TIMEZONES,
  DEFAULT_TIMEZONE,
  SLOT_MINUTES,
  EARLIEST_TIME,
  LATEST_TIME,
  DEFAULT_TIME,
  PAUSE_AFTER_IGNORED,
  allTimes,
  isValidTime,
  parseTime,
  formatTime,
  reminderKey,
  keysForRun,
  slotIn,
  dayKeyIn,
  dateStringIn,
  daysUntil,
  normalizeTimeZone,
  decideDailyReminder,
};
