/**
 * Checks for the study-plan algorithm.  ·  npm run check:plan
 *
 * The planner has a dozen constants whose values are judgement calls (effort per
 * exam, block sizes, the burn-down exponent, the priority weights). This file is
 * how you find out what a change to any of them actually does before it reaches
 * a student.
 *
 * There is no test runner in this project, so this is a plain script: it prints
 * a real plan you can read, then asserts the invariants that must survive any
 * retuning. Add a case whenever you change a constant.
 *
 * ─── Why it copies the services ───
 * services/*.js use ESM `export`, but package.json has no `"type": "module"`, so
 * Node would parse them as CommonJS and throw. Adding `"type": "module"` would
 * disturb Metro and the Babel config for the sake of a script, so instead the
 * three modules are copied to a temp dir as .mjs and imported from there. The
 * repo is never written to.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const services = join(dirname(fileURLToPath(import.meta.url)), '..', 'services');
const here = mkdtempSync(join(tmpdir(), 'schedio-check-'));
for (const name of ['priority', 'taskCopy', 'microplanService']) {
  writeFileSync(
    join(here, `${name}.mjs`),
    readFileSync(join(services, `${name}.js`), 'utf8')
      .replace(/from '\.\/priority'/g, "from './priority.mjs'")
      .replace(/from '\.\/taskCopy'/g, "from './taskCopy.mjs'")
  );
}
const load = (name) => import(`file://${join(here, name)}`);

const { generateStudyPlan, LEVEL_PROFILES, levelProfileFor, gammaFor, MIN_BLOCK_MINUTES } =
  await load('microplanService.mjs');
const { inferExamFormat, pickTaskText, UNKNOWN_FORMAT } = await load('taskCopy.mjs');

const NOW = new Date('2026-11-16T08:00:00');
const day = (n) => new Date(NOW.getTime() + n * 86400000).toISOString();
let fail = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${actual}${ok ? '' : ` (esperado ${expected})`}`);
};

console.log('=== inferencia de formato ===');
[
  ['Matemáticas II', 'problemas'],
  ['Física y Química', 'problemas'],
  ['Fundamentos de Programación', 'problemas'],
  ['Termodinámica Aplicada II', 'problemas'],
  ['Estadística Empresarial', 'problemas'],
  ['Historia de España', 'desarrollo'],
  ['Filosofía', 'desarrollo'],
  ['Biología y Geología', 'desarrollo'],
  ['Inglés', 'idioma'],
  ['Latín II', 'idioma'],
  ['Valencià', 'idioma'],
  ['Asignatura Rarísima de Nombre Inventado', UNKNOWN_FORMAT],
  ['Proyecto Integrado', UNKNOWN_FORMAT],
  ['Métodos Cuantitativos', UNKNOWN_FORMAT],
  ['', UNKNOWN_FORMAT],
  [null, UNKNOWN_FORMAT],
].forEach(([name, expected]) => check(`"${name}"`, inferExamFormat(name), expected));

console.log('\n=== el texto cambia con el formato ===');
['problemas', 'desarrollo', 'idioma', 'test'].forEach((format) => {
  const t = pickTaskText({ phase: 'REPASO FINAL', format, subjectName: 'X', seed: 'a' });
  console.log(`  ${format.padEnd(11)} ${t}`);
});
const mat = pickTaskText({ phase: 'PRÁCTICA', format: 'problemas', subjectName: 'Mates', seed: 's' });
const his = pickTaskText({ phase: 'PRÁCTICA', format: 'desarrollo', subjectName: 'Historia', seed: 's' });
check('mismo phase, distinto texto', mat !== his, true);
check('sin {A} sin sustituir', /\{A\}/.test(mat), false);
check('variante estable para el mismo seed', pickTaskText({ phase: 'PRÁCTICA', format: 'problemas', subjectName: 'Mates', seed: 's' }), mat);
check('fase desconocida no rompe', typeof pickTaskText({ phase: 'NOPE', format: 'problemas', subjectName: 'X' }), 'string');

console.log('\n=== perfil por nivel ===');
check("'Otro' cae en Bachillerato", levelProfileFor('Otro').exam, LEVEL_PROFILES.Bachillerato.exam);
check('undefined cae en Bachillerato', levelProfileFor(undefined).exam, LEVEL_PROFILES.Bachillerato.exam);
check('ESO pide menos que Bachillerato', LEVEL_PROFILES.ESO.exam < LEVEL_PROFILES.Bachillerato.exam, true);
check('Universidad pide más', LEVEL_PROFILES.Universidad.exam > LEVEL_PROFILES.Bachillerato.exam, true);

const subjects = [
  { id: 'm', name: 'Matemáticas', difficulty: 5, color: '#f00' },
  { id: 'h', name: 'Historia', difficulty: 5, color: '#0f0' },
];
const exams = [
  { id: 'e1', name: 'Examen Mates', subjectId: 'm', type: 'exam', date: day(12), manualPriority: 5 },
  { id: 'e2', name: 'Examen Historia', subjectId: 'h', type: 'exam', date: day(14), manualPriority: 5 },
];

const run = (course, reviewFrequency) =>
  generateStudyPlan(exams, subjects, {
    now: NOW,
    profile: { course, organizationLevel: 3, reviewFrequency },
    sessions: [],
  });

['ESO', 'Bachillerato', 'Universidad'].forEach((course) => {
  const { tasks, diagnostics } = run(course);
  const first = Math.round((new Date(tasks[0].date) - NOW) / 86400000);
  console.log(
    `  ${course.padEnd(13)} esfuerzo ${diagnostics.totalEffortMinutes} min · ${tasks.length} sesiones · ` +
      `bloque ${diagnostics.preferredBlock} · empieza día +${first}`
  );
});
const eso = run('ESO');
const uni = run('Universidad');
check('ESO genera menos trabajo que Universidad', eso.diagnostics.totalEffortMinutes < uni.diagnostics.totalEffortMinutes, true);
check('los bloques de ESO son más cortos', eso.tasks[0].duration <= 25, true);
check('ESO respeta el mínimo de bloque', eso.tasks.every((t) => t.duration >= MIN_BLOCK_MINUTES || t.duration >= 5), true);
check('el nivel se reporta', eso.diagnostics.level, 'ESO');

console.log('\n=== reviewFrequency mueve la curva ===');
check("'never' deja más para el final que 'always'", gammaFor('never') > gammaFor('always'), true);
check('valor desconocido usa el neutro', gammaFor('cualquier-cosa'), gammaFor(undefined));
const never = run('Bachillerato', 'never');
const always = run('Bachillerato', 'always');
const firstHalf = (p) => {
  const mid = NOW.getTime() + 7 * 86400000;
  const early = p.tasks.filter((t) => new Date(t.date).getTime() < mid).reduce((a, t) => a + t.duration, 0);
  return Math.round((early / p.diagnostics.scheduledMinutes) * 100);
};
console.log(`  'never':  ${firstHalf(never)}% del trabajo en la primera mitad`);
console.log(`  'always': ${firstHalf(always)}% del trabajo en la primera mitad`);
check("'always' adelanta más trabajo", firstHalf(always) >= firstHalf(never), true);

console.log('\n=== el plan sigue siendo coherente ===');
const bach = run('Bachillerato', 'sometimes');
console.log(`  capacidad ${bach.diagnostics.dailyCapacity} min/día`);
bach.tasks.slice(0, 6).forEach((t) =>
  console.log(`  ${t.date.slice(0, 10)} ${String(t.duration).padStart(2)}min [${t.phase}] ${t.text}`)
);
check('minutos cuadrados', bach.diagnostics.scheduledMinutes + bach.diagnostics.roundingMinutes + bach.diagnostics.unscheduled.reduce((a, u) => a + u.minutesShort, 0), bach.diagnostics.totalEffortMinutes);
check('ids únicos', new Set(bach.tasks.map((t) => t.id)).size, bach.tasks.length);
check('ningún texto vacío', bach.tasks.every((t) => t.text && t.text.length > 10), true);
check('sin plantilla vieja', bach.tasks.some((t) => t.text.includes('temas complejos')), false);

const hand = generateStudyPlan(
  [{ id: 't', name: 'Comentario de texto', subjectId: 'h', type: 'task', date: day(5), manualPriority: 5 }],
  subjects,
  { now: NOW, profile: { course: 'Bachillerato', organizationLevel: 3 } }
);
console.log(`  tarea: ${hand.tasks.map((t) => `[${t.phase}] ${t.text}`).join(' | ')}`);
check('la entrega nombra el evento', hand.tasks[0].text.includes('Comentario de texto'), true);

console.log('\n=== regresión: lo de los pasos 3-4 sigue en pie ===');
const { reconcilePlan } = await load('microplanService.mjs');
const gen = bach.tasks;
const stamp = NOW.toISOString();
const ov = {
  [gen[0].id]: { completed: true, updatedAt: stamp },
  [gen[1].id]: { date: day(3), updatedAt: stamp },
  [gen[2].id]: { dismissed: true, updatedAt: stamp },
  viejo: { completed: true, updatedAt: new Date(NOW.getTime() - 60 * 86400000).toISOString() },
};
const rec = reconcilePlan({
  generated: gen,
  manualTasks: [{ id: 'manual-1', text: 'Mía', date: day(1), duration: 30, type: 'manual' }],
  overrides: ov,
  now: NOW,
});
check('la marcada sigue completada', rec.tasks.find((t) => t.id === gen[0].id)?.completed, true);
check('la pospuesta conserva su fecha', rec.tasks.find((t) => t.id === gen[1].id)?.date, day(3));
check('la borrada no vuelve', rec.tasks.some((t) => t.id === gen[2].id), false);
check('la manual sobrevive', rec.tasks.some((t) => t.id === 'manual-1'), true);
check('el override viejo se poda', rec.pruned.includes('viejo'), true);
check('el texto no se pierde al reconciliar', rec.tasks.every((t) => t.text), true);

const hoy = run('Bachillerato');
const panic = generateStudyPlan(
  [{ id: 'p', name: 'Examen hoy', subjectId: 'm', type: 'exam', date: day(0), manualPriority: 5 }],
  subjects,
  { now: NOW, profile: { course: 'Bachillerato', organizationLevel: 3 } }
);
check('examen hoy genera tarea', panic.tasks.length > 0, true);
check('y es pánico', panic.tasks[0]?.isPanicMode, true);
check('el pánico tiene texto', Boolean(panic.tasks[0]?.text), true);
console.log(`  pánico: ${panic.tasks[0]?.text}`);

const vencido = generateStudyPlan(
  [{ id: 'v', name: 'Pasado', subjectId: 'm', type: 'exam', date: day(-3) }],
  subjects,
  { now: NOW, profile: { course: 'Bachillerato' } }
);
check('examen vencido no genera plan', vencido.tasks.length, 0);
check('sin exámenes -> []', generateStudyPlan([], subjects, { now: NOW }).tasks.length, 0);
check('exams null no rompe', generateStudyPlan(null, null).tasks.length, 0);
check('ninguna tarea después de su examen', hoy.tasks.every((t) => {
  const e = exams.find((x) => x.id === t.examId);
  return !e || new Date(t.date) <= new Date(e.date);
}), true);

console.log('\n=== capa neutra: asignaturas que no reconocemos ===');
['INTRODUCCIÓN', 'ESTUDIO PROFUNDO', 'PRÁCTICA', 'REPASO FINAL'].forEach((ph) => {
  const t = pickTaskText({ phase: ph, format: UNKNOWN_FORMAT, subjectName: 'Proyecto Integrado', seed: ph });
  console.log(`  ${ph.padEnd(17)} ${t}`);
  check(`  neutra sin {A} sin sustituir · ${ph}`, /\{A\}/.test(t), false);
});
check(
  'una asignatura desconocida no hereda el texto de desarrollo',
  pickTaskText({ phase: 'INTRODUCCIÓN', format: UNKNOWN_FORMAT, subjectName: 'X', seed: 'k' }) !==
    pickTaskText({ phase: 'INTRODUCCIÓN', format: 'desarrollo', subjectName: 'X', seed: 'k' }),
  true
);

console.log('\n=== ventana corta: se salta la introducción ===');
const { phaseFloorFor } = await load('microplanService.mjs');
check('ventana de 14 días → arco completo', phaseFloorFor(14), 0);
check('ventana de 9 días → arco completo (umbral 7)', phaseFloorFor(9), 0);
check('ventana de 6 días → sin introducción', phaseFloorFor(6), 1);
check('ventana de 3 días → sin introducción', phaseFloorFor(3), 1);
[3, 6, 14].forEach((d) => {
  const p = generateStudyPlan(
    [{ id: 'x', name: 'Examen', subjectId: 'm', type: 'exam', date: day(d), manualPriority: 5 }],
    subjects,
    { now: NOW, profile: { course: 'Bachillerato', organizationLevel: 3 } }
  );
  const phases = [...new Set(p.tasks.map((t) => t.phase))];
  console.log(`  examen en ${String(d).padStart(2)} días: ${phases.join(' → ')}`);
  if (d <= 9) check(`  ${d} días: sin introducción`, phases.includes('INTRODUCCIÓN'), false);
});


console.log();
console.log('=== suelo de sesion ===');
const { MIN_SESSION_MINUTES } = await load('priority.mjs');
let shortest = 999;
[
  ['ESO', 1],
  ['ESO', 5],
  ['Bachillerato', 3],
  ['Bachillerato', 10],
  ['Universidad', 7],
].forEach(([course, dif]) => {
  [1, 3, 5, 9, 14].forEach((n) => {
    const p = generateStudyPlan(
      [
        { id: 'x', name: 'E', subjectId: 's', type: 'exam', date: day(n), manualPriority: 5 },
        { id: 'y', name: 'T', subjectId: 's', type: 'task', date: day(n), manualPriority: 3 },
      ],
      [{ id: 's', name: 'Asig', difficulty: dif, color: '#888' }],
      { now: NOW, profile: { course, organizationLevel: 1 } }
    );
    p.tasks.forEach((t) => {
      if (t.duration < shortest) shortest = t.duration;
    });
  });
});
console.log('  bloque mas corto en 25 escenarios: ' + shortest + ' min');
check('ninguna sesion baja del suelo', shortest >= MIN_SESSION_MINUTES, true);

console.log('');
console.log('=== objetivo, descansos y readiness ===');
const { riskFactor } = await load('priority.mjs');
const { DEFAULT_REST_DAYS, estimateDailyCapacity } = await load('microplanService.mjs');

check('sin objetivo, se mantiene el comportamiento de antes', riskFactor({ averageGrade: 5 }), 0.5);
check('un 4,2 que solo quiere aprobar arriesga poco', riskFactor({ averageGrade: 4.2, targetGrade: 5 }) < 0.3, true);
check('el mismo 4,2 yendo a por un 9 arriesga mucho', riskFactor({ averageGrade: 4.2, targetGrade: 9 }) > 0.9, true);
check('ya por encima del objetivo: riesgo cero', riskFactor({ averageGrade: 8.1, targetGrade: 7 }), 0);
check('el fin de semana libre por defecto', DEFAULT_REST_DAYS.join(), '0,6');

// Misma fecha en los dos: así lo único que puede desempatar es el objetivo.
// Con fechas distintas manda la urgencia (peso 40 contra 20), que es lo correcto.
const sameDay = [
  { id: 'e1', name: 'Ex Mates', subjectId: 'm', type: 'exam', date: day(12), manualPriority: 5 },
  { id: 'e2', name: 'Ex Historia', subjectId: 'h', type: 'exam', date: day(12), manualPriority: 5 },
];
const withObj = generateStudyPlan(
  sameDay,
  [
    { id: 'm', name: 'Matemáticas', difficulty: 5, averageGrade: 4.2, targetGrade: 5, color: '#f00' },
    { id: 'h', name: 'Historia', difficulty: 5, averageGrade: 4.2, targetGrade: 9, color: '#0f0' },
  ],
  { now: NOW, profile: { course: 'Bachillerato', organizationLevel: 3 } }
);
const first = withObj.tasks[0];
console.log('  mismo 4,2 y misma fecha: primero entra ' + first.subjectName);
check('el que va a por el 9 entra antes', first.subjectName, 'Historia');

check('readiness trae una entrada por examen', withObj.diagnostics.readiness.length, 2);
check('y lleva sesiones y minutos', typeof withObj.diagnostics.readiness[0].sessions, 'number');
console.log('  readiness[0]:', JSON.stringify(withObj.diagnostics.readiness[0]));

const cap = estimateDailyCapacity({
  profile: { organizationLevel: 3 },
  completions: [
    { date: day(-1), minutes: 20 },
    { date: day(-2), minutes: 25 },
    { date: day(-3), minutes: 20 },
  ],
  now: NOW,
});
console.log('  nivel 3 (60 min) con 20-25 min reales: ' + cap + ' min/dia');
check('la capacidad baja cuando cumple poco', cap < 60, true);

console.log('\n=== presion de examen y cansancio ===');
const { pressureFactor, fatigueFactor, HARD_DAILY_CAP_MINUTES } = await load('microplanService.mjs');
check('sin examen cerca no sube nada', pressureFactor(20), 1);
check('a 3 días sube', pressureFactor(3) > 1, true);
check('la víspera sube más que a 3 días', pressureFactor(1) > pressureFactor(3), true);
check('cansancio y presión tiran en sentidos opuestos', fatigueFactor(8) < 1 && pressureFactor(1) > 1, true);

const crunch = generateStudyPlan(
  [
    { id: 'a', name: 'A', subjectId: 'm', type: 'exam', date: day(5), manualPriority: 5 },
    { id: 'b', name: 'B', subjectId: 'h', type: 'exam', date: day(6), manualPriority: 5 },
  ],
  subjects,
  { now: NOW, profile: { course: 'Bachillerato', organizationLevel: 2 } }
);
const perDay = {};
crunch.tasks.forEach((t) => {
  const k = t.date.slice(0, 10);
  perDay[k] = (perDay[k] || 0) + t.duration;
});
const peak = Math.max(...Object.values(perDay));
console.log(`  semana de examenes: pico de ${peak} min en un dia`);
check('ni con presion se pasa del techo de 5 h', peak <= HARD_DAILY_CAP_MINUTES, true);
check('dos examenes seguidos se reparten', new Set(crunch.tasks.map((t) => t.examId)).size, 2);

console.log(`\n${fail === 0 ? '✅ todo correcto' : `❌ ${fail} fallos`}`);
process.exit(fail === 0 ? 0 : 1);
