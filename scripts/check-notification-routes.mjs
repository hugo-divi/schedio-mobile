/**
 * Checks for where a tapped push lands.  ·  npm run check:notification-routes
 *
 * Three places have to agree on the same few strings, and none of them can
 * import the others:
 *
 *  1. functions/index.js decides what each push is about (`KIND`) and sends it
 *     as `data.kind`;
 *  2. services/notificationRoutes.js turns that into a route in the app;
 *  3. public/firebase-messaging-sw.js turns it into a URL on the web, with a
 *     copy of the same mapping, since a service worker can't import the app.
 *
 * This script reads the real files — no copies of the logic — and checks that
 * every kind the server sends has a destination, that the worker's copy gives
 * exactly the same answer as the app for every case, and that nothing that
 * isn't one of our exam ids can ever reach a route param.
 *
 * Copies services/notificationRoutes.js to a temp .mjs for the same reason as
 * the other check-*.mjs: the project is ESM but package.json doesn't declare
 * "type": "module". The repository isn't touched.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const here = mkdtempSync(join(tmpdir(), 'schedio-notification-routes-'));
writeFileSync(
  join(here, 'notificationRoutes.mjs'),
  readFileSync(join(root, 'services', 'notificationRoutes.js'), 'utf8')
);
const { NOTIFICATION_KINDS, routeForNotification, pathForNotification } = await import(
  `file://${join(here, 'notificationRoutes.mjs')}`
);

let failures = 0;
const ok = (label, condition, detail = '') => {
  if (!condition) failures++;
  console.log(`${condition ? 'ok  ' : 'FALLA'} ${label}${detail ? `: ${detail}` : ''}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── The worker's copy, extracted from the real file ──
const worker = readFileSync(join(root, 'public', 'firebase-messaging-sw.js'), 'utf8');
const copy = worker.match(/\/\/ <path-for>\n([\s\S]*?)\/\/ <\/path-for>/);
ok('el service worker conserva sus marcas <path-for>', !!copy);
const workerPathFor = copy ? new Function(`${copy[1]}\nreturn pathFor;`)() : () => null;

// ── The server's kinds, extracted from the real file ──
const functions = readFileSync(join(root, 'functions', 'index.js'), 'utf8');
const kindBlock = functions.match(/const KIND = (\{[\s\S]*?\});/);
ok('functions/index.js define KIND', !!kindBlock);
const serverKinds = kindBlock ? new Function(`return ${kindBlock[1]};`)() : {};

console.log('\n── 1. servidor y app hablan de lo mismo ──');
ok(
  'los mismos tipos en functions/index.js y en la app',
  same(Object.values(serverKinds).sort(), Object.values(NOTIFICATION_KINDS).sort()),
  Object.values(serverKinds).join(', ')
);
// A kind is "sent" if some push names it directly, or if the daily reminder
// (functions/dailyReminder.js, sent with `pushData(decision.kind, …)`) can
// decide on it.
const sendsWithKind = [...functions.matchAll(/pushData\(KIND\.([A-Z_]+)/g)].map((m) => m[1]);
const reminder = readFileSync(join(root, 'functions', 'dailyReminder.js'), 'utf8');
const reminderKinds = [...reminder.matchAll(/kind: '([a-z_]+)'/g)].map((m) => m[1]);
Object.entries(serverKinds).forEach(([key, value]) => {
  ok(
    `algún envío usa ${value}`,
    sendsWithKind.includes(key) || reminderKinds.includes(value),
    sendsWithKind.includes(key) ? `KIND.${key}` : 'desde el recordatorio diario'
  );
});
ok(
  'todo lo que decide el recordatorio diario es un tipo conocido',
  reminderKinds.every((kind) => Object.values(serverKinds).includes(kind)),
  [...new Set(reminderKinds)].join(', ')
);
ok(
  'ningún envío sale sin `data`',
  !/sendToUser\([^)]*\{\s*title[^}]*\}\s*\)/.test(functions),
  'cada sendToUser pasa pushData(...)'
);

console.log('\n── 2. a dónde lleva cada uno ──');
const ID = 'Ab3dE5gH7jK9mN1pQ2rS';
const expectations = [
  [
    'examen con id → el plan, en ese examen',
    { kind: 'exam_alert', examId: ID },
    { pathname: '/dashboard/plans', params: { highlightId: ID } },
  ],
  ['varios exámenes (sin id) → el plan', { kind: 'exam_alert' }, { pathname: '/dashboard/plans' }],
  [
    'reactivación con examen → el plan, en ese examen',
    { kind: 'reengagement', examId: ID },
    { pathname: '/dashboard/plans', params: { highlightId: ID } },
  ],
  ['resumen semanal → la racha', { kind: 'weekly_summary' }, { pathname: '/dashboard/streak' }],
  [
    'recordatorio diario → Inicio, con el plan de hoy',
    { kind: 'daily_plan', taskId: 'x' },
    { pathname: '/dashboard' },
  ],
  ['onboarding a medias → nada (ya lo hace "/")', { kind: 'abandoned_onboarding' }, null],
  ['tipo desconocido → nada', { kind: 'promo' }, null],
  ['sin data → nada', undefined, null],
  ['data que no es un objeto → nada', 'exam_alert', null],
];
expectations.forEach(([label, data, expected]) => {
  const got = routeForNotification(data);
  ok(label, same(got, expected), JSON.stringify(got));
});

console.log('\n── 3. nada raro llega a un parámetro de ruta ──');
[
  ['una ruta relativa', '../../settings'],
  ['espacios', 'a b'],
  ['una query colada', 'x?y=1'],
  ['un número', 12345],
  ['vacío', ''],
  ['demasiado largo', 'a'.repeat(200)],
].forEach(([label, examId]) => {
  const got = routeForNotification({ kind: 'exam_alert', examId });
  ok(`${label} → plan sin resaltar`, same(got, { pathname: '/dashboard/plans' }));
});

console.log('\n── 4. la copia del service worker dice lo mismo que la app ──');
const cases = [
  ...expectations.map(([, data]) => data),
  { kind: 'exam_alert', examId: '../../settings' },
  { kind: 'reengagement' },
  { kind: 'reengagement', examId: 42 },
  null,
  {},
];
cases.forEach((data) => {
  const app = pathForNotification(data);
  const sw = workerPathFor(data);
  ok(`${JSON.stringify(data) ?? 'undefined'}`.padEnd(54), app === sw, `app ${app} · sw ${sw}`);
});

console.log(failures === 0 ? '\n✅ todo correcto' : `\n❌ ${failures} comprobación(es) fallan`);
process.exit(failures === 0 ? 0 : 1);
