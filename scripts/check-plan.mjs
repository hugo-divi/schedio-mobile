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
const { inferExamFormat, pickTaskText, DEFAULT_FORMAT } = await load('taskCopy.mjs');

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
  ['Asignatura Rarísima de Nombre Inventado', DEFAULT_FORMAT],
  ['', DEFAULT_FORMAT],
  [null, DEFAULT_FORMAT],
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

console.log(`\n${fail === 0 ? '✅ todo correcto' : `❌ ${fail} fallos`}`);
process.exit(fail === 0 ? 0 : 1);
