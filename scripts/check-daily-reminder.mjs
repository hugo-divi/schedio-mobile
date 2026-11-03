/**
 * Checks for the daily plan reminder.  ·  npm run check:daily-reminder
 *
 * functions/dailyReminder.js decides whether a student gets the reminder and
 * what it says; the scheduled function only delivers it. This runs that real
 * file and checks the contract written at its top:
 *
 *  1. time: the 15-minute slots, the 07:00–22:00 window, both Spanish time
 *     zones, daylight saving, and the catch-up slot;
 *  2. one push a day carrying the most important thing (exam > plan > week);
 *  3. silence when there's nothing to say: plan done, free day, joker,
 *     ignored for too long — with exam alerts still going through;
 *  4. what it says: the plan's own words, short enough for a lock screen;
 *  5. a month in the life of a student who stops opening the app.
 *
 * functions/ is CommonJS, so it is loaded with createRequire. Nothing is
 * copied and the repository isn't touched.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const R = require(join(root, 'functions', 'dailyReminder.js'));

let failures = 0;
const ok = (label, condition, detail = '') => {
  if (!condition) failures++;
  console.log(`${condition ? 'ok  ' : 'FALLA'} ${label}${detail ? `: ${detail}` : ''}`);
};

// Tuesday 3 Nov 2026, 17:00 in Madrid (CET, UTC+1).
const NOW = new Date('2026-11-03T16:00:00Z');
const H = 60 * 60 * 1000;
const D = 24 * H;
// A plan task "for" a Madrid day, stored the way the app stores it (local
// midnight as ISO).
const taskOn = (daysFromNow, extra = {}) => ({
  id: `t${Math.random().toString(36).slice(2, 8)}`,
  date: new Date(Date.UTC(2026, 10, 3 + daysFromNow) - 1 * H).toISOString(),
  subjectName: 'Química',
  text: 'Haz 10 ejercicios sin mirar apuntes',
  duration: 30,
  completed: false,
  ...extra,
});
const baseUser = (extra = {}) => ({
  betaTester: true,
  fcmToken: 'token',
  dailyReminder: { enabled: true, time: '17:00', tz: 'Europe/Madrid', includeFreeDays: false },
  dailyReminderState: {},
  stats: { lastPlanGenerationDate: 'Tue Nov 03 2026' },
  lastOpenTimestamp: new Date(NOW.getTime() - 2 * H),
  microplans: [taskOn(0)],
  ...extra,
});
const decide = (input = {}) =>
  R.decideDailyReminder({
    now: NOW,
    streak: { freeDays: [5, 6], restDays: [] },
    exams: [],
    ...input,
    user: baseUser(input.user),
  });

console.log('\n── 1. la hora ──');
ok(
  '61 horas posibles, de 07:00 a 22:00 cada cuarto',
  R.allTimes().length === 61 && R.allTimes()[0] === '07:00' && R.allTimes().at(-1) === '22:00'
);
ok(
  '06:45, 22:15 y 17:10 no se aceptan',
  !R.isValidTime('06:45') && !R.isValidTime('22:15') && !R.isValidTime('17:10')
);
const keys = R.keysForRun(new Date('2026-11-03T16:07:00Z'));
ok(
  'a las 17:07 de Madrid toca 17:00 (y 16:45 de repesca); en Canarias, una hora menos',
  [
    'Europe/Madrid@17:00',
    'Europe/Madrid@16:45',
    'Atlantic/Canary@16:00',
    'Atlantic/Canary@15:45',
  ].every((k) => keys.includes(k)),
  keys.join(', ')
);
const summer = R.keysForRun(new Date('2026-07-01T15:00:00Z'));
ok(
  'en verano (CEST) las 17:00 de Madrid son las 15:00 UTC',
  summer.includes('Europe/Madrid@17:00'),
  summer[0]
);
ok(
  'las 00:30 de Madrid ya son el día siguiente',
  R.dayKeyIn(new Date('2026-11-03T23:30:00Z'), 'Europe/Madrid') === '2026-11-04'
);
ok(
  'la fecha del plan se compara igual que la guarda el móvil',
  R.dateStringIn(NOW, 'Europe/Madrid') === 'Tue Nov 03 2026'
);

console.log('\n── 2. una al día, con lo más importante ──');
let d = decide();
ok('con plan pendiente → el plan', d.send && d.kind === 'daily_plan' && d.isPlan, d.title);
ok('al tocarla abre Inicio', d.data?.kind === 'daily_plan');
d = decide({
  exams: [{ id: 'e1', name: 'Tema 4', subjectName: 'Historia', date: new Date(NOW.getTime() + D) }],
});
ok(
  'examen mañana → el aviso de examen, y marca el examen',
  d.kind === 'exam_alert' &&
    d.title === 'Mañana: examen de Historia' &&
    d.examUpdates[0]?.field === 'notified1Day',
  d.title
);
d = decide({
  exams: [
    { id: 'e3', name: 'Tema 2', subjectName: 'Física', date: new Date(NOW.getTime() + 3 * D) },
  ],
});
ok(
  'examen en 3 días → aviso, con lo de hoy en el texto',
  d.kind === 'exam_alert' &&
    d.title === 'Tu examen de Física es en 3 días' &&
    d.body.includes('Química 30 min'),
  d.body
);
d = decide({
  exams: [
    { id: 'e3', subjectName: 'Física', date: new Date(NOW.getTime() + 3 * D), notified3Days: true },
  ],
});
ok('si ese aviso ya salió → el plan', d.kind === 'daily_plan');
d = decide({
  exams: [
    { id: 'a', subjectName: 'Historia', date: new Date(NOW.getTime() + D) },
    { id: 'b', subjectName: 'Física', date: new Date(NOW.getTime() + 3 * D) },
  ],
});
ok(
  'dos avisos el mismo día → uno solo que nombra los dos, y marca los dos',
  d.examUpdates.length === 2 && d.body.includes('Física'),
  d.body
);
ok(
  'ya enviado hoy → nada',
  !decide({ user: { dailyReminderState: { lastSentDate: '2026-11-03' } } }).send
);
ok('otra push de Schedio hoy → nada', !decide({ user: { lastNotifiedDate: '2026-11-03' } }).send);
ok(
  'desactivado → nada',
  decide({ user: { dailyReminder: { enabled: false } } }).reason === 'disabled'
);
ok('cuenta fuera de la beta → nada', decide({ user: { betaTester: false } }).reason === 'not-beta');
ok('sin token → nada', decide({ user: { fcmToken: null } }).reason === 'no-token');

console.log('\n── 3. callarse cuando no hay nada que decir ──');
ok(
  'plan hecho → nada',
  decide({ user: { microplans: [taskOn(0, { completed: true })] } }).reason === 'plan-done'
);
ok(
  'solo quedan opcionales → nada',
  decide({
    user: { microplans: [taskOn(0, { completed: true }), taskOn(0, { isOptional: true })] },
  }).reason === 'plan-done'
);
ok(
  'nada hoy (solo mañana) → nada',
  decide({ user: { microplans: [taskOn(1)] } }).reason === 'nothing-planned'
);
ok('martes marcado como libre → nada', decide({ streak: { freeDays: [1] } }).reason === 'free-day');
ok(
  '…salvo que pidiera también los libres',
  decide({
    streak: { freeDays: [1] },
    user: { dailyReminder: { enabled: true, includeFreeDays: true } },
  }).send
);
ok(
  'comodín gastado hoy ("Hoy no puedo") → nada',
  decide({ streak: { restDays: ['2026-11-03'] } }).reason === 'joker-day'
);
ok(
  'pero un examen mañana avisa igual en día libre',
  decide({
    streak: { freeDays: [1] },
    exams: [{ id: 'e', subjectName: 'Historia', date: new Date(NOW.getTime() + D) }],
  }).kind === 'exam_alert'
);
const ignored4 = {
  dailyReminderState: { lastPlanSentAt: new Date(NOW.getTime() - D), ignoredCount: 4 },
  lastOpenTimestamp: new Date(NOW.getTime() - 6 * D),
};
ok(
  'cinco seguidos sin abrir la app → se pausa',
  decide({ user: ignored4 }).reason === 'paused-ignored'
);
ok(
  'en pausa, un examen mañana sigue avisando',
  decide({
    user: ignored4,
    exams: [{ id: 'e', subjectName: 'Historia', date: new Date(NOW.getTime() + D) }],
  }).kind === 'exam_alert'
);
d = decide({
  user: {
    dailyReminderState: { lastPlanSentAt: new Date(NOW.getTime() - D), ignoredCount: 4 },
    lastOpenTimestamp: new Date(NOW.getTime() - 2 * H),
  },
});
ok(
  'si vuelve a abrir la app, se reanuda y la cuenta vuelve a cero',
  d.send && d.ignoredCount === 0
);

console.log('\n── 4. lo que dice ──');
d = decide({
  user: {
    microplans: [
      taskOn(0),
      taskOn(0, { subjectName: 'Inglés', duration: 20 }),
      taskOn(0, { subjectName: 'Lengua', duration: 25 }),
    ],
  },
});
ok(
  'varias, con el plan de hoy → total y orden',
  d.title === 'Hoy: 75 min de estudio' &&
    d.body.startsWith('Empieza por Química (30 min), luego Inglés y 1 más'),
  `${d.title} / ${d.body}`
);
d = decide({
  user: {
    stats: { lastPlanGenerationDate: 'Mon Nov 02 2026' },
    microplans: [taskOn(0), taskOn(0, { subjectName: 'Inglés', duration: 20 })],
  },
});
ok(
  'plan de ayer → solo la primera, sin un total que puede haber cambiado',
  d.title === 'Hoy toca Química · 30 min',
  d.title
);
d = decide({
  user: {
    microplans: [
      taskOn(0, { completed: true }),
      taskOn(0, { subjectName: 'Inglés', duration: 20 }),
    ],
  },
});
ok(
  'a medias → lo que queda',
  d.title === 'Te quedan 20 min de tu plan' && d.body.startsWith('Sigue con Inglés'),
  `${d.title} / ${d.body}`
);
d = decide({
  exams: [{ id: 'x', subjectName: 'Química', date: new Date(NOW.getTime() + 5 * D) }],
});
ok(
  'con un examen a pocos días, lo menciona',
  d.body === 'Haz 10 ejercicios sin mirar apuntes. Examen en 5 días.',
  d.body
);
d = decide({
  user: {
    microplans: [
      taskOn(0, {
        subjectName: 'Tecnología e Ingeniería II con un nombre larguísimo de verdad',
        text: 'Una instrucción muy larga que no cabría nunca en la pantalla de bloqueo de ningún móvil',
      }),
    ],
  },
});
ok(
  'nombres largos se recortan: título y texto caben en la pantalla de bloqueo',
  d.title.length <= 50 && d.body.length <= 180,
  `${d.title} (${d.title.length}) / ${d.body.length}`
);

console.log('\n── 5. el domingo ──');
const SUNDAY = new Date('2026-11-08T17:00:00Z');
d = R.decideDailyReminder({
  now: SUNDAY,
  user: baseUser({ microplans: [] }),
  streak: { freeDays: [5, 6] },
  weekSessions: 6,
});
ok(
  'domingo libre y sin plan → el resumen de la semana',
  d.kind === 'weekly_summary' && d.body.includes('6 sesiones'),
  d.body
);
d = R.decideDailyReminder({
  now: SUNDAY,
  user: baseUser({ microplans: [] }),
  streak: {},
  weekSessions: 0,
});
ok('domingo sin sesiones → nada', !d.send);

console.log('\n── 6. un mes de alguien que deja la app ──');
// Opens the app on days 0–2, then disappears until day 12, then uses it again.
let state = {};
let lastOpen = null;
const sentDays = [];
for (let day = 0; day < 20; day++) {
  const now = new Date(NOW.getTime() + day * D);
  if ((day <= 2 || day >= 12) && day !== 0) lastOpen = new Date(now.getTime() - 3 * H); // opened that morning
  const decision = R.decideDailyReminder({
    now,
    streak: { freeDays: [], restDays: [] },
    user: baseUser({
      dailyReminderState: state,
      lastOpenTimestamp: lastOpen,
      microplans: [taskOn(day)],
      stats: { lastPlanGenerationDate: R.dateStringIn(now, 'Europe/Madrid') },
    }),
  });
  if (decision.send) {
    sentDays.push(day);
    state = {
      ...state,
      lastSentDate: decision.today,
      lastPlanSentAt: now,
      ignoredCount: decision.ignoredCount,
    };
  }
}
console.log(`  avisos los días ${sentDays.join(', ')}`);
// The last open was the morning of day 2, before that day's reminder: from
// that reminder on, every one goes unread.
const unread = sentDays.filter((day) => day >= 2 && day < 12);
ok(
  `tras dejar de abrirla, ${R.PAUSE_AFTER_IGNORED} avisos sin leer y silencio`,
  unread.length === R.PAUSE_AFTER_IGNORED && !sentDays.includes(7) && !sentDays.includes(11),
  `sin leer: días ${unread.join(', ')}`
);
ok('al volver (día 12), vuelve a avisar', sentDays.includes(12) && sentDays.includes(13));

console.log(failures === 0 ? '\n✅ todo correcto' : `\n❌ ${failures} comprobación(es) fallan`);
process.exit(failures === 0 ? 0 : 1);
