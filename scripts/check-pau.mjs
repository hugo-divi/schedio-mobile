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

writeFileSync(join(here, 'pauGrades.mjs'), readFileSync(join(services, 'pauGrades.js'), 'utf8'));
const { roleFor, buildExamRows, improvableSubjects, computeMarks, neededPauAverage, cooficialFor } =
  await import(`file://${join(here, 'pauGrades.mjs')}`);

const NL = String.fromCharCode(10);
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

console.log(NL + 'Qué materia es cada cosa en la PAU');
check('Lengua Castellana II', roleFor('Lengua Castellana II'), 'lengua');
// Escrito a mano, que es como lo teclea media clase.
check('"Lengua" a secas', roleFor('Lengua'), 'lengua');
check('Historia de España', roleFor('Historia de España'), 'historia');
check('Historia de la Filosofía', roleFor('Historia de la Filosofía'), 'historia');
check('sin acentos', roleFor('historia de espana'), 'historia');
check('Inglés II', roleFor('Inglés II'), 'extranjera');
check('Francés II', roleFor('Francés II'), 'extranjera');
check('Matemáticas CCSS II', roleFor('Matemáticas CCSS II'), 'modalidad');
check('Latín II', roleFor('Latín II'), 'modalidad');
check('Lengua Gallega II', roleFor('Lengua Gallega II'), 'cooficial');
// Química no es de la fase de acceso: es de las que suben nota.
check('Química no es de acceso', roleFor('Química'), 'null');

console.log(NL + 'Lengua cooficial por comunidad');
check('Galicia', cooficialFor('GA'), 'Lengua Gallega II');
check('Cataluña', cooficialFor('CT'), 'Lengua Catalana II');
check('Madrid no tiene', cooficialFor('MD'), 'null');

console.log(NL + 'Las filas salen de sus materias');
const subjects = [
  { name: 'Matemáticas II', targetGrade: 8 },
  { name: 'Química', targetGrade: 9 },
  { name: 'Lengua Castellana II', targetGrade: 7 },
  { name: 'Inglés II' },
  { name: 'Historia de España', targetGrade: 6 },
  { name: 'Lengua Gallega II', targetGrade: 7 },
];
const rows = buildExamRows({ subjects, region: 'GA', fallback: 6 });
check('cuatro ejercicios', rows.length, 4);
check('la de modalidad es Matemáticas II', rows[3].name, 'Matemáticas II');
check('toma el objetivo', rows[0].mark, 7);
// Inglés no tiene objetivo puesto, así que cae en la media.
check('sin objetivo, usa la media', rows[2].mark, 6);
check('y lo dice', rows[2].source, 'media');

const withCo = buildExamRows({ subjects, region: 'GA', includeCooficial: true, fallback: 6 });
check('cinco con cooficial', withCo.length, 5);
check('la quinta es el gallego', withCo[4].name, 'Lengua Gallega II');
// Las de la fase de acceso no pueden ofrecerse otra vez para subir nota.
check(
  'solo Química queda libre',
  improvableSubjects(subjects, withCo)
    .map((s) => s.name)
    .join(),
  'Química'
);

console.log(NL + 'Las cuentas');
// 1º 6,2 y 2º 7,2 → media 6,7. Cuatro ejercicios a 7 → PAU 7.
// Acceso = 0,6 × 6,7 + 0,4 × 7 = 6,82.
const flat = [7, 7, 7, 7].map((mark, i) => ({ name: 'm' + i, mark }));
const base = computeMarks({ first: 6.2, second: 7.2, rows: flat });
check('media de Bachillerato', base.bachAvg.toFixed(2), '6.70');
check('media de la PAU', base.pauAvg.toFixed(2), '7.00');
check('nota de acceso', base.access.toFixed(3), '6.820');
check('sin materia extra, admisión = acceso', base.admission.toFixed(3), '6.820');

const weighted = computeMarks({ first: 6.2, second: 7.2, rows: flat, extraMark: 7.5, weight: 0.2 });
check('con 7,5 ponderado a 0,2', weighted.admission.toFixed(3), '8.320');
check('la mejora suma 1,5', weighted.bonus.toFixed(2), '1.50');

// Una materia suspensa no pondera.
const lowExtra = computeMarks({ first: 6.2, second: 7.2, rows: flat, extraMark: 4.9, weight: 0.2 });
check('un 4,9 no pondera', lowExtra.admission.toFixed(3), '6.820');
check('y se marca como tal', lowExtra.extraCounts, false);

// El error más grave posible de esta pantalla: enseñar una nota de admisión
// alta a quien no llega al 5 de acceso.
const failing = computeMarks({
  first: 3,
  second: 3,
  rows: [3, 3, 3, 3].map((mark, i) => ({ name: 'm' + i, mark })),
  extraMark: 10,
  weight: 0.2,
});
check('sin acceso no hay mejora', failing.admission.toFixed(3), failing.access.toFixed(3));
check('y el acceso no llega a 5', failing.meetsAccess, false);

// La PAU por debajo de 4 invalida, por alta que sea la media de Bachillerato.
const badPau = computeMarks({
  first: 10,
  second: 10,
  rows: [3.9, 3.9, 3.9, 3.9].map((mark, i) => ({ name: 'm' + i, mark })),
});
check('PAU 3,9 no cumple', badPau.meetsPau, false);
check('y arrastra al acceso, aunque salga 7,56', badPau.meetsAccess, false);

console.log(NL + '¿Qué necesito?');
// Para un 12 con 6,7 de media y 1,5 de mejora: (12 - 4,02 - 1,5) / 0,4 = 16,2.
check(
  'un 12 con esta base es inalcanzable',
  neededPauAverage({ target: 12, first: 6.2, second: 7.2, extraMark: 7.5, weight: 0.2 }) > 10,
  true
);
// Y la vuelta: lo que necesita para el 8,32 que ya salía.
check(
  'coherente con la cuenta directa',
  neededPauAverage({
    target: 8.32,
    first: 6.2,
    second: 7.2,
    extraMark: 7.5,
    weight: 0.2,
  }).toFixed(2),
  '7.00'
);

console.log(failed === 0 ? '\nTodo correcto.\n' : `\n${failed} comprobaciones fallidas.\n`);
process.exit(failed === 0 ? 0 : 1);
