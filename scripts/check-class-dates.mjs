/**
 * Checks for the aula's dates in your calendar.  ·  npm run check:class-dates
 *
 * services/classDates.js decides, for each date the class put up, where it
 * stands against your own exams and what each button writes;
 * services/classInvite.js reads invite links and writes the share text; and
 * functions/dailyReminder.js tells you, in the day's one push, when the class
 * moved a date you have. This runs those real files and checks:
 *
 *  1. subjects match the way classes actually name them, and never wrongly;
 *  2. every status is right, including "you moved yours" (respected, no
 *     nagging) versus "the class moved it" (asked);
 *  3. what each action writes: dates, alerts re-armed, the link kept;
 *  4. the trust line and the grouping;
 *  5. invite links in every shape, and the share text;
 *  6. the daily push: a class change is announced once, beats the plan, and
 *     never comes from a change you already settled.
 *
 * Copies the ES modules to a temp .mjs for the same reason as the other
 * check-*.mjs; functions/ is CommonJS and is loaded with createRequire. The
 * repository isn't touched.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const here = mkdtempSync(join(tmpdir(), 'schedio-class-dates-'));
const copy = (from, to) => {
  writeFileSync(join(here, to), readFileSync(join(root, ...from), 'utf8'));
  return import(`file://${join(here, to)}`);
};
const C = await copy(['services', 'classDates.js'], 'classDates.mjs');
const I = await copy(['services', 'classInvite.js'], 'classInvite.mjs');
const require = createRequire(import.meta.url);
const R = require(join(root, 'functions', 'dailyReminder.js'));

let failures = 0;
const ok = (label, condition, detail = '') => {
  if (!condition) failures++;
  console.log(`${condition ? 'ok  ' : 'FALLA'} ${label}${detail ? `: ${detail}` : ''}`);
};

const NOW = new Date(2026, 10, 3, 17, 0);
const day = (n, h = 9) => new Date(2026, 10, 3 + n, h, 0);
const SUBJECTS = [
  { id: 's-mat', name: 'Matemáticas', color: '#2979FF' },
  { id: 's-fyq', name: 'Física y Química', color: '#22C55E' },
  { id: 's-ing', name: 'Inglés', color: '#F59E0B' },
  { id: 's-his', name: 'Historia', color: '#EF4444' },
  { id: 's-hart', name: 'Historia del Arte', color: '#A855F7' },
];
const classDate = (extra = {}) =>
  C.normalizeClassDate({
    id: 'd1',
    aulaId: 'a1',
    subjectName: 'Mates',
    title: 'Tema 4: derivadas',
    date: day(5),
    author: { name: 'Laura', surname: 'Martín' },
    confirmations: 0,
    createdAt: day(-3),
    updatedAt: day(-3),
    ...extra,
  });
const status = (d, exams) => C.classDateStatus(d, exams, { subjects: SUBJECTS, now: NOW });

console.log('\n── 1. asignaturas ──');
const match = (name) => C.matchSubject(name, SUBJECTS)?.id ?? null;
ok('"Mates" → Matemáticas', match('Mates') === 's-mat');
ok('"matematicas" sin tilde → Matemáticas', match('matematicas') === 's-mat');
ok('"FyQ" → Física y Química', match('FyQ') === 's-fyq');
ok('"English" → Inglés', match('English') === 's-ing');
ok('"Historia" → Historia, no Historia del Arte', match('Historia') === 's-his');
ok('"Arte" no se asigna a nada a ciegas', match('Arte') === null);
ok('"Química" sin Química propia → Física y Química', match('Química') === 's-fyq');
ok(
  '"Química" con Química propia → Química',
  C.matchSubject('Química', [...SUBJECTS, { id: 's-qui', name: 'Química' }])?.id === 's-qui'
);
ok(
  '"Historia" con solo Historia del Arte → nada (no es la misma)',
  C.matchSubject('Historia', [{ id: 'h', name: 'Historia del Arte' }]) === null
);
ok(
  '"Historia" con Geografía e Historia → esa',
  C.matchSubject('Historia', [{ id: 'gh', name: 'Geografía e Historia' }])?.id === 'gh'
);
ok('vacío → nada', match('') === null);

console.log('\n── 2. en qué punto está cada fecha ──');
const d1 = classDate();
ok('normaliza autor e inicial', d1.author.name === 'Laura' && d1.author.initial === 'M');
ok('sin id o sin fecha → no se usa', C.normalizeClassDate({ id: 'x' }) === null);
ok(
  'acepta los nombres en español',
  C.normalizeClassDate({ id: 'x', fecha: day(2), asignatura: 'Inglés', tipo: 'entrega' })?.type ===
    'task'
);
ok('nada en tu calendario → no la tienes', status(d1, []).status === C.STATUS.NOT_ADDED);
const mine = { id: 'e1', name: 'Examen mates', subjectId: 's-mat', date: day(6), type: 'exam' };
const maybe = status(d1, [mine]);
ok(
  'tu examen de Matemáticas a 1 día → "¿es el mismo?"',
  maybe.status === C.STATUS.MAYBE_SAME && maybe.exam.id === 'e1'
);
ok(
  'a 5 días ya no se pregunta',
  status(d1, [{ ...mine, date: day(10) }]).status === C.STATUS.NOT_ADDED
);
ok(
  'una entrega no es "el mismo" que un examen',
  status(d1, [{ ...mine, type: 'task' }]).status === C.STATUS.NOT_ADDED
);
ok(
  'un examen ya con nota tampoco',
  status(d1, [{ ...mine, completed: true }]).status === C.STATUS.NOT_ADDED
);

const added = {
  id: 'e2',
  ...C.examFromClassDate(d1, { userId: 'u', subject: SUBJECTS[0], now: NOW }),
};
ok('añadida → en tu calendario', status(d1, [added]).status === C.STATUS.IN_CALENDAR);
const moved = classDate({ date: day(7), updatedAt: day(0, 12) });
const changed = status(moved, [added]);
ok(
  'la clase la mueve → cambio, con de dónde a dónde',
  changed.status === C.STATUS.CHANGED &&
    C.sameDay(changed.from, day(5)) &&
    C.sameDay(changed.to, day(7))
);
const mineMoved = { ...added, date: day(6) };
const respected = status(d1, [mineMoved]);
ok(
  'la moviste tú y la del aula sigue igual → se respeta, sin preguntar',
  respected.status === C.STATUS.IN_CALENDAR && respected.userMoved === true
);
ok(
  'otra aula con el mismo id de fecha no se confunde',
  status(classDate({ aulaId: 'a2' }), [added]).status !== C.STATUS.IN_CALENDAR
);
ok(
  'una fecha pasada sin añadir → pasada',
  status(classDate({ date: day(-2) }), []).status === C.STATUS.PAST
);

console.log('\n── 3. lo que escribe cada botón ──');
ok(
  'añadir: asignatura, fecha, tipo y vínculo',
  added.subjectId === 's-mat' &&
    C.sameDay(added.date, day(5)) &&
    added.type === 'exam' &&
    added.classLink.dateId === 'd1' &&
    added.classLink.aulaId === 'a1' &&
    C.sameDay(added.classLink.syncedDate, day(5)) &&
    added.completed === false
);
const unknown = C.examFromClassDate(classDate({ subjectName: 'Latín', title: '' }), {
  userId: 'u',
  now: NOW,
});
ok(
  'sin asignatura tuya → sin asignar, y el nombre la conserva',
  unknown.subjectId === 'undefined' && unknown.name === 'Examen de Latín',
  unknown.name
);
const accept = C.acceptChangeUpdates(moved);
ok(
  'mover el mío: fecha nueva y las alertas de 3 y 1 día otra vez pendientes',
  C.sameDay(accept.date, day(7)) && accept.notified3Days === false && accept.notified1Day === false
);
ok(
  'mover el mío: deja de estar pendiente',
  accept['classLink.pendingDate'] === null && C.sameDay(accept['classLink.syncedDate'], day(7))
);
const keep = C.keepMineUpdates(moved);
ok('quedarme con la mía: no toca tu fecha', !('date' in keep));
const afterKeep = {
  ...added,
  classLink: { ...added.classLink, syncedDate: keep['classLink.syncedDate'] },
};
ok(
  'y después ya no vuelve a preguntar por ese cambio',
  status(moved, [afterKeep]).status === C.STATUS.IN_CALENDAR
);
const pending = C.pendingChangeUpdates(
  added,
  classDate({
    date: day(7),
    updatedBy: { name: 'Pablo', initial: 'R' },
  })
);
ok(
  'un cambio sin decidir se apunta para el aviso, con quién lo cambió',
  C.sameDay(pending['classLink.pendingDate'], day(7)) &&
    pending['classLink.pendingBy'] === 'Pablo R.' &&
    pending['classLink.pendingNotified'] === false
);
ok(
  'y no se reescribe si ya estaba apuntado',
  C.pendingChangeUpdates(
    { ...added, classLink: { ...added.classLink, pendingDate: day(7).toISOString() } },
    moved
  ) === null
);
const linked = C.linkUpdates(d1, { now: NOW });
ok(
  '"es el mismo": vincula sin cambiar tu fecha',
  !('date' in linked) && linked.classLink.dateId === 'd1'
);
const all = C.examsToAddAll(
  [
    d1,
    classDate({ id: 'd2', subjectName: 'Inglés', date: day(9) }),
    classDate({ id: 'd3', date: day(-4) }),
  ],
  [mine],
  { userId: 'u', subjects: SUBJECTS, now: NOW }
);
ok(
  '"añadir todas": solo las que faltan seguro (ni la dudosa ni la pasada)',
  all.length === 1 && all[0].classLink.dateId === 'd2',
  all.map((e) => e.classLink.dateId).join(', ')
);

console.log('\n── 4. lo que se enseña ──');
ok(
  'sin confirmaciones: quién la puso',
  C.trustLine(d1, { now: NOW }).text === 'Puesta por Laura M.',
  C.trustLine(d1, { now: NOW }).text
);
ok(
  'con 1: lo dice',
  C.trustLine(classDate({ confirmations: 1 }), { now: NOW }).text ===
    'Puesta por Laura M. · 1 la confirma'
);
ok(
  'desde 3: confirmada por la clase',
  C.trustLine(classDate({ confirmations: 6 }), { now: NOW }).tone === 'confirmed'
);
const recent = C.trustLine(
  classDate({ confirmations: 6, updatedAt: new Date(NOW - 2 * 3600e3), updatedBy: 'Pablo Ruiz' }),
  { now: NOW }
);
ok(
  'un cambio reciente manda sobre las confirmaciones',
  recent.tone === 'changed' && recent.text === 'Cambiada hace 2 h por Pablo R.',
  recent.text
);
ok(
  'cuenta atrás',
  C.countdownLabel(0) === 'hoy' &&
    C.countdownLabel(1) === 'mañana' &&
    C.countdownLabel(5) === 'en 5 días' &&
    C.countdownLabel(-2) === 'hace 2 días'
);
const groups = C.groupByWhen(
  [
    classDate({ id: 'l', date: day(20) }),
    classDate({ id: 'w2', date: day(6) }),
    classDate({ id: 'w1', date: day(0) }),
    classDate({ id: 'p1', date: day(-1) }),
    classDate({ id: 'p2', date: day(-9) }),
  ],
  { now: NOW }
);
ok(
  'agrupa: esta semana por fecha, luego más adelante, lo pasado de reciente a antiguo',
  groups.thisWeek.map((d) => d.id).join() === 'w1,w2' &&
    groups.later.map((d) => d.id).join() === 'l' &&
    groups.past.map((d) => d.id).join() === 'p1,p2'
);
const sum = C.summarize(
  [d1, classDate({ id: 'd2', date: day(9), subjectName: 'Inglés' })],
  [added],
  {
    subjects: SUBJECTS,
    now: NOW,
  }
);
ok('resumen: cuántas faltan', sum.upcoming === 2 && sum.inCalendar === 1 && sum.missing === 1);

console.log('\n── 5. invitaciones ──');
const links = [
  'https://schedio.es/aula/AB12CD',
  'https://app.schedio.es/aula/AB12CD?utm_source=whatsapp',
  'schedio://aula/AB12CD',
  'https://schedio.es/unirse?aula=AB12CD',
  '  AB12CD ',
];
ok(
  'lee el código de cada forma de enlace',
  links.every((l) => I.parseInviteCode(l) === 'AB12CD')
);
ok(
  'lo que no es un código, no',
  ['', 'https://schedio.es/', 'https://schedio.es/aula/', 'ab', '<script>', null].every(
    (l) => I.parseInviteCode(l) === null
  )
);
const msg = I.buildInviteMessage({
  aulaName: '3.º B',
  url: 'https://schedio.es/aula/AB12CD',
  upcoming: [
    { subjectName: 'Química', date: day(2) },
    { subjectName: 'Inglés', date: day(4), type: 'task' },
  ],
  total: 5,
});
ok('el mensaje nombra el aula', msg.includes('3.º B'));
ok('enseña lo próximo y cuántas más', msg.includes('Química') && msg.includes('y 3 más'), msg);
ok('lleva el enlace', msg.includes('https://schedio.es/aula/AB12CD'));
ok(
  'sin fechas no se inventa ninguna',
  !I.buildInviteMessage({ aulaName: 'x', url: 'u' }).includes('Próximo')
);

console.log('\n── 6. el aviso diario ──');
const NOW_UTC = new Date('2026-11-03T16:00:00Z');
const user = (extra = {}) => ({
  betaTester: true,
  fcmToken: 't',
  dailyReminder: { enabled: true, time: '17:00', tz: 'Europe/Madrid' },
  dailyReminderState: {},
  stats: { lastPlanGenerationDate: 'Tue Nov 03 2026' },
  lastOpenTimestamp: new Date(NOW_UTC.getTime() - 3600e3),
  microplans: [
    {
      id: 't1',
      date: new Date(Date.UTC(2026, 10, 2, 23)).toISOString(),
      subjectName: 'Inglés',
      text: 'Repasa vocabulario',
      duration: 20,
      completed: false,
    },
  ],
  ...extra,
});
const linkedExam = (extra = {}) => ({
  id: 'e9',
  name: 'Tema 4',
  subjectName: 'Matemáticas',
  date: new Date('2026-11-09T08:00:00Z'),
  type: 'exam',
  completed: false,
  classLink: {
    aulaId: 'a1',
    dateId: 'd1',
    syncedDate: '2026-11-09T08:00:00.000Z',
    pendingDate: '2026-11-11T08:00:00.000Z',
    pendingBy: 'Pablo R.',
    pendingNotified: false,
  },
  ...extra,
});
const decide = (exams, extraUser = {}, streak = { freeDays: [5, 6], restDays: [] }) =>
  R.decideDailyReminder({ now: NOW_UTC, user: user(extraUser), exams, streak });
let d = decide([linkedExam()]);
ok(
  'la clase movió tu examen → es lo que dice el aviso',
  d.send &&
    d.kind === 'class_date_change' &&
    d.title === 'Tu clase ha movido el examen de Matemáticas',
  d.title
);
ok('dice a cuándo y quién', d.body.includes('miércoles 11') && d.body.includes('Pablo R.'), d.body);
ok('y lo de hoy, para no perder el plan', d.body.includes('Inglés 20 min'), d.body);
ok(
  'se apunta como avisado (una vez por cambio)',
  d.examUpdates.length === 1 && d.examUpdates[0].field === 'classLink.pendingNotified'
);
ok('lleva al examen', d.data.examId === 'e9' && d.data.aulaId === 'a1');
d = decide([linkedExam({ classLink: { ...linkedExam().classLink, pendingNotified: true } })]);
ok('ya avisado → vuelve el plan normal', d.kind === 'daily_plan', d.kind);
d = decide([
  linkedExam({ classLink: { ...linkedExam().classLink, pendingDate: '2026-11-09T10:00:00.000Z' } }),
]);
ok('misma fecha (otra hora) → no es un cambio', d.kind === 'daily_plan', d.kind);
d = decide([linkedExam({ completed: true })]);
ok('examen ya hecho → nada que contar', d.kind === 'daily_plan');
d = decide([linkedExam()], {}, { freeDays: [1, 2, 3, 4, 5, 6, 0], restDays: [] });
ok(
  'en un día libre también se cuenta (es un hecho nuevo, no un empujón)',
  d.kind === 'class_date_change'
);
d = decide([
  linkedExam(),
  {
    id: 'x',
    name: 'Física',
    subjectName: 'Física',
    date: new Date('2026-11-04T08:00:00Z'),
    type: 'exam',
  },
]);
ok('una alerta de examen mañana va antes', d.kind === 'exam_alert', d.kind);
d = decide([linkedExam()], { betaTester: false });
ok('fuera de la beta, nada', !d.send && d.reason === 'not-beta');

console.log(failures === 0 ? '\n✅ todo correcto' : `\n❌ ${failures} comprobación(es) fallan`);
process.exit(failures === 0 ? 0 : 1);
