/**
 * Checks for the PAU countdown.  ·  npm run check:pau
 *
 * Nada de esto se puede abrir en una pantalla para mirarlo: son tres preguntas
 * que se contestan con datos y que, si se contestan mal, lo hacen en silencio.
 *
 *  · **A quién se le enseña.** Es lo que evita que un cambio pensado para 2º de
 *    Bachillerato se le aparezca a un universitario o a una cuenta antigua.
 *  · **Qué fecha gana.** La del estudiante manda sobre la oficial, y la oficial
 *    sobre la estimada. Si esto se invierte, a alguien le pisamos la fecha que
 *    puso a mano y se entera el día del examen.
 *  · **Cuántos días faltan.** Por días de calendario, no por horas: a las 23:00
 *    de la víspera tiene que quedar 1 día, no 0.
 *
 * Copia el módulo a un temporal como .mjs por la misma razón que
 * check-plan.mjs: services/*.js usa ESM y package.json no declara
 * "type": "module". El repositorio no se toca.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const services = join(dirname(fileURLToPath(import.meta.url)), '..', 'services');
const here = mkdtempSync(join(tmpdir(), 'schedio-pau-'));
writeFileSync(join(here, 'priority.mjs'), readFileSync(join(services, 'priority.js'), 'utf8'));
// pau.js importa `toDate` de priority.js sin extensión, que es lo normal en el
// bundler y lo que el ESM de Node no resuelve. Se reescribe solo en la copia;
// el fichero del repositorio no se toca.
writeFileSync(
  join(here, 'pau.mjs'),
  readFileSync(join(services, 'pau.js'), 'utf8').replace("'./priority'", "'./priority.mjs'")
);

const { showsPau, pauYearFor, estimatedPauDate, resolvePauDate, daysUntil, PROMOTE_AT_DAYS } =
  await import(`file://${join(here, 'pau.mjs')}`);

let failed = 0;
const check = (label, actual, expected) => {
  const ok = String(actual) === String(expected);
  if (!ok) failed += 1;
  console.log(
    `${ok ? '  ok  ' : ' FAIL '} ${label}${ok ? '' : ` — esperado ${expected}, salió ${actual}`}`
  );
};

const iso = (d) => (d ? d.toISOString().slice(0, 10) : 'null');
const student = (extra) => ({ course: 'Bachillerato', courseYear: 2, takesPau: true, ...extra });

console.log('\nA quién se le enseña');
check('2º de Bachillerato con la casilla', showsPau(student()), true);
check('1º de Bachillerato', showsPau(student({ courseYear: 1 })), false);
check('2º que desmarcó la casilla', showsPau(student({ takesPau: false })), false);
check('universitario', showsPau({ course: 'Universidad', courseYear: 2, takesPau: true }), false);
check('ESO', showsPau({ course: 'ESO' }), false);
// La que de verdad protege a los usuarios que ya están dentro: una cuenta
// anterior al onboarding de septiembre de 2026 no tiene ninguno de los campos.
check('cuenta antigua, sin los campos', showsPau({ course: 'Bachillerato' }), false);
check('sin perfil todavía', showsPau(null), false);

console.log('\nQué convocatoria toca');
check('24 sept 2026 → junio de', pauYearFor(new Date(2026, 8, 24)), 2027);
check('5 jun 2027 → junio de', pauYearFor(new Date(2027, 5, 5)), 2027);
check('20 jul 2027 (extraordinaria) → junio de', pauYearFor(new Date(2027, 6, 20)), 2027);
check('2 ago 2027 → junio de', pauYearFor(new Date(2027, 7, 2)), 2028);

console.log('\nLa estimación es el primer martes de junio');
for (const year of [2027, 2028, 2029, 2030]) {
  const d = estimatedPauDate(year);
  check(`${year} cae en martes`, d.getDay(), 2);
  check(`${year} es la primera semana`, d.getDate() <= 7, true);
}

console.log('\nQué fecha gana');
const now = new Date(2026, 8, 24, 12);
const official = new Date(2027, 5, 8, 12);
const mine = new Date(2027, 5, 10, 12);

const onlyEstimate = resolvePauDate({ profile: {}, now });
check('sin nada → estimada', onlyEstimate.source, 'estimated');
check('sin nada → fecha', iso(onlyEstimate.date), '2027-06-01');

const withOfficial = resolvePauDate({ profile: {}, official, now });
check('con oficial → oficial', withOfficial.source, 'official');
check('con oficial → fecha', iso(withOfficial.date), '2027-06-08');

const withMine = resolvePauDate({ profile: { pauDate: mine }, official, now });
check('la suya gana a la oficial', iso(withMine.date), '2027-06-10');
check('y se marca como suya', withMine.source, 'mine');
// Inicio y la hoja necesitan saber que la oficial existe para poder ofrecerla
// sin pisar la suya.
check('la oficial sigue disponible', iso(withMine.official), '2027-06-08');
check('la vuelta atrás apunta a la oficial', iso(withMine.fallback), '2027-06-08');

const mineNoOfficial = resolvePauDate({ profile: { pauDate: mine }, now });
check('sin oficial, la vuelta es la estimada', iso(mineNoOfficial.fallback), '2027-06-01');

console.log('\nCuántos días faltan');
check('víspera a las 23:00', daysUntil(new Date(2027, 5, 8, 12), new Date(2027, 5, 7, 23, 0)), 1);
check(
  'el mismo día por la mañana',
  daysUntil(new Date(2027, 5, 8, 12), new Date(2027, 5, 8, 7, 0)),
  0
);
check('el día después', daysUntil(new Date(2027, 5, 8, 12), new Date(2027, 5, 9, 7, 0)), -1);
check('desde septiembre', daysUntil(new Date(2027, 5, 1, 12), now), 250);
check('sin fecha', daysUntil(null, now), 'null');

console.log('\nEl ascenso de celda a tarjeta');
// El umbral tiene que caer dentro del curso y después de que acaben las clases
// (mediados de mayo), o la tarjeta grande aparecería con exámenes de aula por
// delante y "Hoy" empujado hacia abajo sin motivo.
check('umbral', PROMOTE_AT_DAYS, 30);
const promoteDay = new Date(2027, 5, 1, 12);
promoteDay.setDate(promoteDay.getDate() - PROMOTE_AT_DAYS);
check('empieza en mayo', promoteDay.getMonth(), 4);

console.log(failed === 0 ? '\nTodo correcto.\n' : `\n${failed} comprobaciones fallidas.\n`);
process.exit(failed === 0 ? 0 : 1);
