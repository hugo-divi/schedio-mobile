/**
 * Checks for badges.  ·  npm run check:badges
 *
 * services/badges.js decides every unlock. This runs that real file and checks:
 *
 *  1. the catalogue is well formed, and the original nine are all still there;
 *  2. outside the beta, the original nine unlock exactly as they always did
 *     (with the hour windows fixed) and nothing else ever does;
 *  3. inside the beta, the new badges, tiers and XP behave as described,
 *     including the ones granted for things done before they existed;
 *  4. the two bugs behind "the same badge again in another session" stay
 *     fixed: an older read of the user document can't take a badge or XP
 *     away, and evaluating again never awards again.
 *
 * Copies services/badges.js to a temp .mjs for the same reason as the other
 * check-*.mjs. The repository isn't touched.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const here = mkdtempSync(join(tmpdir(), 'schedio-badges-'));
writeFileSync(join(here, 'badges.mjs'), readFileSync(join(root, 'services', 'badges.js'), 'utf8'));
const {
  TIERS,
  CATEGORIES,
  BADGE_CATALOG,
  catalogFor,
  newlyEarned,
  rewardFor,
  closestToUnlock,
  buildBadgeStats,
  mergeReloadedProgress,
} = await import(`file://${join(here, 'badges.mjs')}`);

let failures = 0;
const ok = (label, condition, detail = '') => {
  if (!condition) failures++;
  console.log(`${condition ? 'ok  ' : 'FALLA'} ${label}${detail ? `: ${detail}` : ''}`);
};
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

const NOW = new Date(2026, 10, 3, 18, 0);
const at = (h, m = 0, daysAgo = 0) => new Date(2026, 10, 3 - daysAgo, h, m);
const earned = (input, owned = [], beta = false) =>
  newlyEarned(owned, buildBadgeStats({ now: NOW, beta, ...input }), { beta });

console.log('\n── 1. el catálogo ──');
const ids = BADGE_CATALOG.map((b) => b.id);
ok('ningún id repetido', new Set(ids).size === ids.length, `${ids.length} insignias`);
const ORIGINAL = [
  'first_steps',
  'marathon',
  'night_owl',
  'excellence',
  'streak_master',
  'early_bird',
  'double_marathon',
  'iron_streak',
  'century_club',
];
ok(
  'las nueve de siempre siguen, con los mismos ids',
  same(
    catalogFor().map((b) => b.id),
    ORIGINAL
  )
);
ok(
  'cada una tiene categoría, nivel, icono y objetivo válidos',
  BADGE_CATALOG.every(
    (b) =>
      CATEGORIES.some((c) => c.id === b.category) &&
      TIERS[b.tier] &&
      typeof b.icon === 'string' &&
      b.target > 0 &&
      typeof b.value === 'function'
  )
);
ok(
  'todas las categorías tienen alguna insignia',
  CATEGORIES.every((c) => BADGE_CATALOG.some((b) => b.category === c.id))
);

console.log('\n── 2. fuera de la beta: las nueve, como siempre ──');
const base = { totalSessions: 3, totalTime: 120, streak: 2 };
const session = (h, duration = 25) => ({ duration, endedAt: at(h, 15) });
const legacyCases = [
  [
    'primera sesión → Primeros Pasos',
    { stats: { ...base, totalSessions: 1 }, event: session(17) },
    ['first_steps'],
  ],
  [
    'sesión a las 02:15 → nada (ya no se premia la madrugada)',
    { stats: base, event: session(2) },
    [],
  ],
  ['sesión a las 06:15 → Madrugador', { stats: base, event: session(6) }, ['early_bird']],
  ['sesión a las 21:15 → Búho', { stats: base, event: session(21) }, ['night_owl']],
  ['sesión de 70 min → Maratonista', { stats: base, event: session(12, 70) }, ['marathon']],
  [
    'sesión de 130 min → las dos maratones',
    { stats: base, event: session(12, 130) },
    ['marathon', 'double_marathon'],
  ],
  ['racha de 7 → En Llamas', { stats: { ...base, streak: 7 } }, ['streak_master']],
  ['100 horas → Club de las 100 Horas', { stats: { ...base, totalTime: 6000 } }, ['century_club']],
  ['un 10 → Excelencia', { stats: base, event: { grade: 10 } }, ['excellence']],
  ['un 9,5 → nada', { stats: base, event: { grade: 9.5 } }, []],
  [
    'una nota a las 07:30 no da Madrugador',
    { stats: base, event: { grade: 6, endedAt: at(7, 30) } },
    [],
  ],
];
legacyCases.forEach(([label, input, expected]) => {
  const got = earned(
    input,
    ['first_steps'].filter(() => input.stats.totalSessions > 1)
  );
  ok(label, same(got, expected), got.join(', ') || '—');
});
const huge = {
  stats: {
    totalSessions: 500,
    totalTime: 99999,
    streak: 90,
    planDaysCompleted: ['x'],
    gradedExams: 30,
  },
  history: [{ duration: 30, date: at(6), subjectId: 'a' }],
  extra: { uploads: 10, bestStreak: 100 },
};
ok(
  'por mucho que haya hecho, fuera de la beta solo puede ganar de las nueve',
  earned(huge).every((id) => ORIGINAL.includes(id))
);
ok(
  'fuera de la beta no cuentan sesiones antiguas (sin sorpresas retroactivas)',
  !earned({ stats: base, history: [{ duration: 30, date: at(22), subjectId: 'a' }] }).includes(
    'night_owl'
  )
);
ok('fuera de la beta las insignias no dan XP', rewardFor(['excellence', 'iron_streak']) === 0);

console.log('\n── 3. dentro de la beta ──');
const beta = (input, owned) => earned(input, owned, true);
ok(
  'una sesión antigua de madrugada (5:30) da Madrugador al llegar la beta',
  beta({ stats: base, history: [{ duration: 20, date: at(5, 30, 20), subjectId: 'a' }] }).includes(
    'early_bird'
  )
);
const fourSubjects = ['a', 'b', 'c', 'd'].map((s, i) => ({
  duration: 20,
  date: at(17, 0, i),
  subjectId: s,
}));
ok(
  '4 asignaturas en 7 días → Todoterreno',
  beta({ stats: base, history: fourSubjects }).includes('variety')
);
ok(
  '4 asignaturas repartidas en 10 días → todavía no',
  !beta({
    stats: base,
    history: fourSubjects.map((s, i) => ({ ...s, date: at(17, 0, i * 3) })),
  }).includes('variety')
);
ok(
  '10 días con el plan completo → Día redondo y Plan al día',
  same(
    beta({
      stats: { ...base, planDaysCompleted: Array.from({ length: 10 }, (_, i) => `d${i}`) },
    }).filter((id) => id.startsWith('plan_day')),
    ['plan_day_1', 'plan_day_10']
  )
);
ok(
  'una racha perdida no quita lo ganado: mejor racha 14, actual 0 → Dos semanas',
  beta({ stats: { ...base, streak: 0 }, extra: { bestStreak: 14 } }).includes('streak_14')
);
ok(
  'notas: 10 exámenes con un 9 de máximo → Primera nota, Notable, Sobresaliente, Curso en marcha',
  same(
    beta({ stats: { ...base, gradedExams: 10, bestGrade: 9 } }).filter((id) =>
      ['first_grade', 'notable', 'sobresaliente', 'graded_10', 'excellence'].includes(id)
    ),
    ['first_grade', 'notable', 'sobresaliente', 'graded_10']
  )
);
ok(
  'adelantar una sesión → Adelantado',
  beta({ stats: base, event: { aheadOfPlan: true } }).includes('ahead')
);
ok(
  'el primer apunte → Mochila lista',
  beta({ stats: base, extra: { uploads: 1 } }).includes('backpack')
);
ok(
  'el XP de cada nivel: bronce 50, plata 150, oro 400',
  rewardFor(['first_steps', 'streak_master', 'excellence'], { beta: true }) === 600
);
const closest = closestToUnlock(
  ['first_steps'],
  buildBadgeStats({
    stats: { totalSessions: 20, totalTime: 300, streak: 2 },
    beta: true,
    now: NOW,
  }),
  { beta: true }
);
ok(
  '"Más cerca": la que más se acerca primero, sin las ya ganadas ni las de 0/1',
  closest[0]?.entry.id === 'sessions_25' && closest.every((c) => c.target > 1 && c.ratio < 1),
  closest.map((c) => `${c.entry.id} ${Math.round(c.ratio * 100)}%`).join(', ')
);

const gradeClose = closestToUnlock(
  [],
  buildBadgeStats({ stats: { bestGrade: 8.5, totalSessions: 1 }, extra: {}, beta: true, now: NOW }),
  { beta: true, limit: 10 }
);
ok(
  'un 8,5 no es "8 de 10 hacia Excelencia": las notas no salen en "Más cerca"',
  gradeClose.every((c) => !['notable', 'sobresaliente', 'excellence'].includes(c.entry.id))
);

console.log('\n── 4. la insignia repetida ──');
// Bug 1: Inicio leía el documento antes de que llegara la escritura de la
// sesión, y esa copia vieja sustituía a la de memoria.
const memory = {
  previousGame: {
    xp: 1500,
    badges: ['first_steps', 'marathon'],
    badgeUnlocks: { marathon: 'hoy' },
  },
  previousStats: { totalSessions: 12, totalTime: 400, planDaysCompleted: ['a', 'b'] },
};
const staleRead = {
  game: { xp: 1200, badges: ['first_steps'], badgeUnlocks: {} },
  stats: { totalSessions: 11, totalTime: 370, streak: 0, planDaysCompleted: ['a'] },
};
const merged = mergeReloadedProgress({ ...memory, ...staleRead });
ok('una lectura vieja no quita la insignia recién ganada', merged.game.badges.includes('marathon'));
ok('ni su fecha', merged.game.badgeUnlocks.marathon === 'hoy');
ok('ni XP', merged.game.xp === 1500);
ok(
  'ni sesiones, minutos o días de plan',
  merged.stats.totalSessions === 12 &&
    merged.stats.totalTime === 400 &&
    merged.stats.planDaysCompleted.length === 2
);
ok('la racha actual sí se toma de la lectura (puede bajar de verdad)', merged.stats.streak === 0);
const fresher = mergeReloadedProgress({
  ...memory,
  game: { xp: 1700, badges: ['first_steps', 'marathon', 'night_owl'] },
  stats: { totalSessions: 13, totalTime: 430 },
});
ok(
  'una lectura más nueva sí suma lo que traiga',
  fresher.game.badges.includes('night_owl') && fresher.game.xp === 1700
);

// Bug 2: con las insignias ya en memoria, volver a evaluar no da nada.
const allEarned = newlyEarned([], buildBadgeStats({ ...huge, beta: true, now: NOW }), {
  beta: true,
});
ok(
  'evaluar otra vez con lo ya ganado no vuelve a dar ninguna',
  newlyEarned(allEarned, buildBadgeStats({ ...huge, beta: true, now: NOW }), { beta: true })
    .length === 0,
  `${allEarned.length} ganadas`
);

// And the celebration queue must not survive the screen that filled it: read
// the source, since it is React state.
const study = readFileSync(join(root, 'app', 'dashboard', 'study.js'), 'utf8');
ok(
  'Estudiar ya no guarda su propia cola de celebraciones',
  !/setCelebrationQueue|useState\([^)]*\)\s*;?\s*\/\/[^\n]*celebr/i.test(study) &&
    !study.includes('celebrationQueue')
);
const store = readFileSync(join(root, 'store', 'userStore.js'), 'utf8');
ok(
  'nadie escribe el objeto `gamification` entero en Firestore',
  !/updateDoc\([^)]*\{[^}]*\bgamification:\s/.test(store) &&
    !/gamification: newGameData \}\s*\)/.test(store)
);

console.log(failures === 0 ? '\n✅ todo correcto' : `\n❌ ${failures} comprobación(es) fallan`);
process.exit(failures === 0 ? 0 : 1);
