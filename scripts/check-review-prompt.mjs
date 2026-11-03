/**
 * Checks for when a store rating may be asked for.  ·  npm run check:review-prompt
 *
 * Asking at the wrong moment costs more than never asking: a card on day one,
 * mid-task or every week is how an app collects one-star reviews and spends
 * Google's quota for nothing. services/reviewPolicy.js holds the rules; this
 * script runs the real file and checks each one, then simulates a whole school
 * year of good moments to show how often a very engaged student would actually
 * be asked.
 *
 * It also reads the source of the callers, because two rules are about who
 * calls what rather than about numbers: the native sheet is only ever
 * requested from services/storeReview.js (never from a button), and an
 * attempt is recorded before the sheet is requested.
 *
 * Copies services/reviewPolicy.js to a temp .mjs for the same reason as the
 * other check-*.mjs: the project is ESM but package.json doesn't declare
 * "type": "module". The repository isn't touched.
 */
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const here = mkdtempSync(join(tmpdir(), 'schedio-review-prompt-'));
writeFileSync(
  join(here, 'reviewPolicy.mjs'),
  readFileSync(join(root, 'services', 'reviewPolicy.js'), 'utf8')
);
const policy = await import(`file://${join(here, 'reviewPolicy.mjs')}`);
const {
  REVIEW_MOMENTS,
  MIN_SESSIONS,
  MIN_ACTIVE_DAYS,
  MIN_ACCOUNT_AGE_DAYS,
  COOLDOWN_DAYS,
  MAX_PROMPTS,
  GOOD_GRADE,
  reviewDecision,
  dayCompletedBy,
  reachedStreakMilestone,
  isGoodGrade,
  activeDaysIn,
} = policy;

let failures = 0;
const ok = (label, condition, detail = '') => {
  if (!condition) failures++;
  console.log(`${condition ? 'ok  ' : 'FALLA'} ${label}${detail ? `: ${detail}` : ''}`);
};

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 3, 18, 0); // 3 nov 2026, 18:00 local
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY);

/** A student who clearly qualifies; each case below breaks one thing. */
const eligible = {
  platform: 'android',
  moment: REVIEW_MOMENTS.DAY_COMPLETED,
  now: NOW,
  totalSessions: MIN_SESSIONS,
  activeDays: MIN_ACTIVE_DAYS,
  accountCreatedAt: daysAgo(MIN_ACCOUNT_AGE_DAYS + 1),
  history: {},
  askedThisRun: false,
};
const decide = (patch) => reviewDecision({ ...eligible, ...patch });

console.log('\n── 1. quién puede ver la petición ──');
ok('un alumno con uso real, en un buen momento → se pide', decide({}).ask === true);
ok('web → nunca', decide({ platform: 'web' }).reason === 'platform');
ok('plataforma desconocida → nunca', decide({ platform: 'windows' }).reason === 'platform');
ok(
  'un momento que no es de la lista → nunca',
  decide({ moment: 'app_opened' }).reason === 'moment'
);
ok(
  `con ${MIN_SESSIONS - 1} sesiones → todavía no`,
  decide({ totalSessions: MIN_SESSIONS - 1 }).reason === 'few-sessions'
);
ok(
  `con todas las sesiones en ${MIN_ACTIVE_DAYS - 1} días → todavía no`,
  decide({ activeDays: MIN_ACTIVE_DAYS - 1 }).reason === 'few-days'
);
ok(
  `cuenta de ${MIN_ACCOUNT_AGE_DAYS - 1} días → todavía no`,
  decide({ accountCreatedAt: daysAgo(MIN_ACCOUNT_AGE_DAYS - 1) }).reason === 'new-account'
);
ok(
  'fecha de alta como Timestamp de Firestore → se entiende igual',
  decide({ accountCreatedAt: { toDate: () => daysAgo(2) } }).reason === 'new-account'
);
ok(
  'sin fecha de alta → deciden las sesiones y los días',
  decide({ accountCreatedAt: null }).ask === true
);

console.log('\n── 2. cuántas veces ──');
ok(
  'ya se pidió en este arranque → no',
  decide({ askedThisRun: true }).reason === 'already-this-run'
);
ok(
  `${MAX_PROMPTS} peticiones en este móvil → nunca más`,
  decide({ history: { count: MAX_PROMPTS, lastAskedAt: daysAgo(400).getTime() } }).reason ===
    'lifetime-cap'
);
ok(
  `hace ${COOLDOWN_DAYS - 1} días → todavía no`,
  decide({ history: { count: 1, lastAskedAt: daysAgo(COOLDOWN_DAYS - 1).getTime() } }).reason ===
    'cooldown'
);
ok(
  `hace ${COOLDOWN_DAYS + 1} días → otra vez sí`,
  decide({ history: { count: 1, lastAskedAt: daysAgo(COOLDOWN_DAYS + 1).getTime() } }).ask === true
);
ok('el enfriamiento es de al menos un trimestre (≥ 90 días)', COOLDOWN_DAYS >= 90);
ok('nunca más de 3 veces en un móvil', MAX_PROMPTS <= 3);

console.log('\n── 3. qué cuenta como buen momento ──');
const at = (h, m = 0, offsetDays = 0) =>
  new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + offsetDays, h, m).toISOString();
const plan = [
  { id: 'a', date: at(9), completed: true },
  { id: 'b', date: at(17), completed: true },
  { id: 'c', date: at(10, 0, 1), completed: false },
];
ok('la última de hoy, hecha → día completado', dayCompletedBy(plan, 'b', NOW) === true);
ok(
  'queda una de hoy sin hacer → no',
  dayCompletedBy(
    plan.map((t) => (t.id === 'a' ? { ...t, completed: false } : t)),
    'b',
    NOW
  ) === false
);
ok(
  'tachar una de mañana con hoy ya hecho → no (es adelantar, no acabar el día)',
  dayCompletedBy(
    plan.map((t) => (t.id === 'c' ? { ...t, completed: true } : t)),
    'c',
    NOW
  ) === false
);
ok('hoy sin tareas → no', dayCompletedBy([plan[2]], 'c', NOW) === false);
ok(
  'las 23:30 y las 00:30 son días distintos',
  dayCompletedBy(
    [
      { id: 'late', date: at(23, 30, -1), completed: true },
      { id: 'early', date: at(0, 30), completed: true },
    ],
    'early',
    NOW
  ) === true
);
ok('racha de 6 a 7 → hito', reachedStreakMilestone(6, 7) === true);
ok('racha de 13 a 14 → hito', reachedStreakMilestone(13, 14) === true);
ok('racha de 7 a 8 → no', reachedStreakMilestone(7, 8) === false);
ok('racha que no se mueve (7 → 7) → no', reachedStreakMilestone(7, 7) === false);
ok('racha de 0 a 1 → no', reachedStreakMilestone(0, 1) === false);
ok(`un ${GOOD_GRADE} → buena nota`, isGoodGrade(GOOD_GRADE) === true);
ok(`un ${GOOD_GRADE - 0.1} → no`, isGoodGrade(GOOD_GRADE - 0.1) === false);
ok('una nota que no es número → no', isGoodGrade('sobresaliente') === false);
ok(
  'tres sesiones el mismo día cuentan como un día',
  activeDaysIn([{ date: at(9) }, { date: at(12) }, { date: at(20) }]) === 1
);
ok(
  'sesiones en tres días → tres días',
  activeDaysIn([{ date: at(9, 0, -2) }, { date: at(9, 0, -1) }, { date: new Date(at(9)) }]) === 3
);

console.log('\n── 4. un curso entero con un buen momento cada día ──');
// The most engaged student imaginable: from day 1, a session every day and a
// finished plan every day. Each day is a separate app run.
let history = {};
const asks = [];
const created = new Date(2026, 8, 9); // launch day
for (let day = 0; day < 365; day++) {
  const now = new Date(created.getTime() + day * DAY + 18 * 60 * 60 * 1000);
  const decision = reviewDecision({
    platform: 'android',
    moment: REVIEW_MOMENTS.DAY_COMPLETED,
    now,
    totalSessions: day + 1,
    activeDays: day + 1,
    accountCreatedAt: created,
    history,
    askedThisRun: false,
  });
  if (decision.ask) {
    asks.push(day);
    history = { count: (history.count || 0) + 1, lastAskedAt: now.getTime() };
  }
}
const gaps = asks.slice(1).map((d, i) => d - asks[i]);
console.log(`  se le pediría los días ${asks.join(', ')} desde el alta`);
ok(`como mucho ${MAX_PROMPTS} veces en un año`, asks.length <= MAX_PROMPTS, `${asks.length}`);
ok('nunca en la primera semana', asks.length === 0 || asks[0] >= MIN_ACCOUNT_AGE_DAYS);
ok(
  `nunca dos veces con menos de ${COOLDOWN_DAYS} días entre medias`,
  gaps.every((g) => g >= COOLDOWN_DAYS),
  gaps.join(', ') || 'una sola vez'
);

console.log('\n── 5. quién llama a qué ──');
const sources = [];
const walk = (dir) => {
  readdirSync(dir).forEach((name) => {
    if (name === 'node_modules' || name.startsWith('.')) return;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.js')) sources.push(path);
  });
};
['app', 'components', 'services', 'store', 'widgets'].forEach((dir) => walk(join(root, dir)));
const callers = sources.filter((path) => /\brequestReview\s*\(/.test(readFileSync(path, 'utf8')));
ok(
  'solo services/storeReview.js pide la hoja nativa',
  callers.length === 1 && relative(root, callers[0]) === join('services', 'storeReview.js'),
  callers.map((path) => relative(root, path)).join(', ')
);
const settings = readFileSync(join(root, 'app', 'settings.js'), 'utf8');
ok(
  'la fila de Ajustes abre la ficha de la tienda, no la hoja (Google: nada de botones)',
  settings.includes('openStoreListing') && !/StoreReview\./.test(settings)
);
const storeReview = readFileSync(join(root, 'services', 'storeReview.js'), 'utf8');
const recordAt = storeReview.indexOf('AsyncStorage.setItem(');
const askAt = storeReview.indexOf('StoreReview.requestReview()');
ok(
  'el intento se apunta antes de pedir la hoja',
  recordAt !== -1 && askAt !== -1 && recordAt < askAt
);
ok(
  'antes de pedir, se pregunta a la política',
  storeReview.indexOf('reviewDecision(') !== -1 && storeReview.indexOf('reviewDecision(') < askAt
);

console.log(failures === 0 ? '\n✅ todo correcto' : `\n❌ ${failures} comprobación(es) fallan`);
process.exit(failures === 0 ? 0 : 1);
