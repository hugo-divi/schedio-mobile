/**
 * Checks for the streak rules.  ·  npm run check:streak-rules
 *
 * La racha dejó de medir "has estudiado hoy" y pasó a medir "has hecho lo que
 * el plan te pidió". De esa regla salen tres cosas que antes eran una sola —
 * días libres, comodines y racha congelada — y este script comprueba que las
 * tres se comportan como deben, con las mismas funciones que usa la app.
 *
 * Lo que más importa aquí es la inversión del comodín: antes se gastaban solos
 * al fallar un día, así que la racha casi nunca se rompía. Ahora hay que
 * pedirlos, y un día descubierto rompe. Si alguien revirtiera eso sin querer,
 * la racha volvería a ser un adorno — de ahí que sea lo primero que se prueba.
 *
 * Copia services/streakRules.js a un temporal como .mjs por la misma razón que
 * el resto de check-*.mjs: el proyecto usa ESM pero package.json no declara
 * "type": "module". El repositorio no se toca.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const services = join(dirname(fileURLToPath(import.meta.url)), '..', 'services');
const here = mkdtempSync(join(tmpdir(), 'schedio-streak-'));
writeFileSync(join(here, 'streakRules.mjs'), readFileSync(join(services, 'streakRules.js'), 'utf8'));

const {
  DAILY_GOAL_MINUTES,
  MAX_REST_PER_WEEK,
  DEFAULT_FREE_DAYS,
  MAX_FREE_DAYS,
  formatDate,
  weekdayIndexOf,
  isFreeDay,
  sanitizeFreeDays,
  weekKeyOf,
  restUsedInWeekOf,
  daysBetweenExclusive,
  gapIsCovered,
  pruneRestDays,
  restDaysRemaining,
  canSpendJokerOn,
} = await import(`file://${join(here, 'streakRules.mjs')}`);

let failures = 0;
const ok = (label, condition, detail = '') => {
  if (!condition) failures++;
  console.log(`${condition ? 'ok  ' : 'FALLA'} ${label}${detail ? `: ${detail}` : ''}`);
};

// Semana real de referencia: lunes 2026-08-31 … domingo 2026-09-06.
const MON = '2026-08-31';
const TUE = '2026-09-01';
const WED = '2026-09-02';
const THU = '2026-09-03';
const FRI = '2026-09-04';
const SAT = '2026-09-05';
const SUN = '2026-09-06';
const NEXT_MON = '2026-09-07';

console.log('\n── el calendario, con el lunes a cero ──');
ok('el lunes es 0', weekdayIndexOf(MON) === 0);
ok('el viernes es 4', weekdayIndexOf(FRI) === 4);
ok('el sábado es 5 y el domingo 6', weekdayIndexOf(SAT) === 5 && weekdayIndexOf(SUN) === 6);
ok(
  'los días libres por defecto son el fin de semana',
  DEFAULT_FREE_DAYS.join(',') === '5,6',
  `[${DEFAULT_FREE_DAYS}]`
);
ok('el sábado cae en día libre por defecto', isFreeDay(SAT, DEFAULT_FREE_DAYS));
ok('el miércoles no', !isFreeDay(WED, DEFAULT_FREE_DAYS));

console.log('\n── la semana se reinicia el lunes ──');
ok('lunes y domingo son la misma semana', weekKeyOf(MON) === weekKeyOf(SUN), weekKeyOf(MON));
ok('el lunes siguiente ya es otra', weekKeyOf(NEXT_MON) !== weekKeyOf(SUN), weekKeyOf(NEXT_MON));
ok(
  'los comodines se cuentan por semana, no en total',
  restUsedInWeekOf([TUE, WED, NEXT_MON], WED) === 2,
  'dos esta semana, el del lunes que viene no cuenta'
);

console.log('\n── los comodines ya NO se gastan solos ──');
// El cambio de fondo. Antes un hueco descubierto consumía comodines y la racha
// sobrevivía; ahora rompe.
ok(
  'un día laborable fallado y sin comodín ROMPE la racha',
  !gapIsCovered([WED], [], DEFAULT_FREE_DAYS)
);
ok(
  'ese mismo día, con el comodín ya gastado, la mantiene',
  gapIsCovered([WED], [WED], DEFAULT_FREE_DAYS)
);
ok(
  'un fin de semana entero no la rompe aunque no haya comodines',
  gapIsCovered([SAT, SUN], [], DEFAULT_FREE_DAYS)
);
ok(
  'basta con que UN día del hueco esté descubierto para romperla',
  !gapIsCovered([WED, THU], [WED], DEFAULT_FREE_DAYS),
  'miércoles cubierto, jueves no'
);
ok('un hueco vacío nunca rompe nada', gapIsCovered([], [], DEFAULT_FREE_DAYS));

console.log('\n── pedir un comodín ──');
const free = DEFAULT_FREE_DAYS;
ok('en un día laborable, con comodines, se puede', canSpendJokerOn(WED, { free, freeDays: free }).allowed);
ok(
  'en un día libre no se puede — sería tirarlo',
  canSpendJokerOn(SAT, { freeDays: free }).reason === 'free-day'
);
ok(
  'dos veces el mismo día tampoco',
  canSpendJokerOn(WED, { restDays: [WED], freeDays: free }).reason === 'already-spent'
);
ok(
  `con los ${MAX_REST_PER_WEEK} de la semana gastados, no quedan`,
  canSpendJokerOn(THU, { restDays: [TUE, WED], freeDays: free }).reason === 'none-left'
);
ok(
  'pero el lunes siguiente vuelven',
  canSpendJokerOn(NEXT_MON, { restDays: [TUE, WED], freeDays: free }).allowed
);
ok(
  'con la racha congelada el botón no aplica',
  canSpendJokerOn(WED, { freeDays: free, hasPlan: false }).reason === 'frozen'
);

console.log('\n── el contador que ve el alumno ──');
ok(
  'sin gastar nada, quedan los dos',
  restDaysRemaining([], new Date(`${WED}T12:00:00`)) === MAX_REST_PER_WEEK
);
ok('gastado uno, queda uno', restDaysRemaining([TUE], new Date(`${WED}T12:00:00`)) === 1);
ok('gastados los dos, ninguno', restDaysRemaining([TUE, WED], new Date(`${WED}T12:00:00`)) === 0);
ok('nunca baja de cero', restDaysRemaining([MON, TUE, WED], new Date(`${WED}T12:00:00`)) === 0);

console.log('\n── los días libres que elige el alumno ──');
ok('por defecto, si no hay nada guardado', sanitizeFreeDays(undefined).join() === '5,6');
ok('un valor corrupto no rompe nada', sanitizeFreeDays('sábado').join() === '5,6');
ok('se quitan repetidos', sanitizeFreeDays([5, 5, 6]).join() === '5,6');
ok('se quitan los fuera de rango', sanitizeFreeDays([-1, 3, 9, 2.5]).join() === '3');
ok(
  `no se pueden marcar más de ${MAX_FREE_DAYS}`,
  sanitizeFreeDays([0, 1, 2, 3, 4]).length === MAX_FREE_DAYS,
  `[${sanitizeFreeDays([0, 1, 2, 3, 4])}]`
);
ok('ninguno también vale', sanitizeFreeDays([]).length === 0);

console.log('\n── fechas ──');
ok(
  'los días entre dos fechas van sin incluir los extremos',
  daysBetweenExclusive(MON, THU).join() === `${TUE},${WED}`
);
ok('dos días seguidos no dejan hueco', daysBetweenExclusive(WED, THU).length === 0);
ok(
  'la fecha se calcula en hora local, no en UTC',
  formatDate(new Date(2026, 8, 4, 0, 30)) === '2026-09-04',
  'medianoche y media del 4 de septiembre sigue siendo el 4'
);
ok(
  'la lista de comodines se poda por antigüedad',
  pruneRestDays(['2026-01-01', FRI], 90, new Date(`${FRI}T12:00:00`)).join() === FRI
);

console.log('\n── el objetivo diario ──');
ok(
  'son 20 minutos, no los 5 de antes',
  DAILY_GOAL_MINUTES === 20,
  `${DAILY_GOAL_MINUTES} min`
);

console.log(failures === 0 ? '\n✅ todo correcto' : `\n❌ ${failures} comprobación(es) fallan`);
process.exit(failures === 0 ? 0 : 1);
