/**
 * Checks for the Planes screen's presentation logic.  ·  npm run check:plan-screen
 *
 * The screen itself (app/dashboard/plans.js) can't run outside React Native, but
 * the trickiest part of it — deciding an exam's current phase, whether it's
 * "hot" or "ready", and what its footer says — lives in the plain function
 * services/planPresentation.js, precisely so it can be checked here instead of
 * only read carefully.
 *
 * Copies services/*.js to a temp dir as .mjs for the same reason check-plan.mjs
 * does: this project's package.json has no "type": "module". The repo is never
 * written to.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const services = join(dirname(fileURLToPath(import.meta.url)), '..', 'services');
const here = mkdtempSync(join(tmpdir(), 'schedio-plan-screen-'));
for (const name of ['priority', 'taskCopy', 'planProfile', 'microplanService', 'planPresentation']) {
  writeFileSync(
    join(here, `${name}.mjs`),
    readFileSync(join(services, `${name}.js`), 'utf8')
      .replace(/from '\.\/priority'/g, "from './priority.mjs'")
      .replace(/from '\.\/taskCopy'/g, "from './taskCopy.mjs'")
      .replace(/from '\.\/planProfile'/g, "from './planProfile.mjs'")
      .replace(/from '\.\/microplanService'/g, "from './microplanService.mjs'")
  );
}
const load = (name) => import(`file://${join(here, name)}`);

const {
  daysUntilLabel,
  phaseIndexFor,
  dayLoadWidth,
  examProgressFor,
  formatMinutes,
  examSessionsFor,
  dayLabelFor,
  examVerdictFor,
} = await load('planPresentation.mjs');
const { STUDY_PHASES } = await load('microplanService.mjs');

let failures = 0;
const ok = (label, condition, detail = '') => {
  if (!condition) failures++;
  console.log(`${condition ? 'ok  ' : 'FALLA'} ${label}${detail ? `: ${detail}` : ''}`);
};

// ── daysUntilLabel ───────────────────────────────────────────────────────────

console.log('\n── daysUntilLabel ──');
ok('hoy', daysUntilLabel(0) === 'hoy');
ok('mañana', daysUntilLabel(1) === 'mañana');
ok('en 2 días', daysUntilLabel(2) === 'en 2 días');
ok('en 16 días', daysUntilLabel(16) === 'en 16 días');
ok('hace 1 día', daysUntilLabel(-1) === 'hace 1 día');
ok('hace 3 días', daysUntilLabel(-3) === 'hace 3 días');

// ── phaseIndexFor ────────────────────────────────────────────────────────────

console.log('\n── phaseIndexFor ──');
ok(
  'las 4 fases reales caen en su índice',
  STUDY_PHASES.every((phase, i) => phaseIndexFor(phase, false) === i),
  STUDY_PHASES.join(' → ')
);
ok('pánico va al final del arco', phaseIndexFor('MODO PÁNICO 🔥', true) === STUDY_PHASES.length - 1);
ok(
  'una fase desconocida (p. ej. ENTREGA) también va al final, no revienta',
  phaseIndexFor('ENTREGA', false) === STUDY_PHASES.length - 1
);
ok('sin fase, no revienta', phaseIndexFor(undefined, false) === STUDY_PHASES.length - 1);

// ── dayLoadWidth ─────────────────────────────────────────────────────────────

console.log('\n── dayLoadWidth ──');
ok('0 minutos → 0 (día sin carga visible)', dayLoadWidth(0) === 0);
ok('minutos negativos → 0, no un ancho negativo', dayLoadWidth(-5) === 0);
ok('una tarea corta ya se ve', dayLoadWidth(15) > 0);
ok('el techo es 26px aunque el día esté saturado', dayLoadWidth(600) === 26);
ok('creciente: más minutos nunca dan una barra más corta', (() => {
  const widths = [0, 15, 30, 60, 120, 300, 600].map(dayLoadWidth);
  return widths.every((w, i) => i === 0 || w >= widths[i - 1]);
})());

// ── examProgressFor ──────────────────────────────────────────────────────────

console.log('\n── examProgressFor ──');

const subjects = [{ id: 's1', name: 'Matemáticas', color: '#E0705A' }];
const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-18T12:00:00');
const iso = (offsetDays) => new Date(now.getTime() + offsetDays * DAY).toISOString();

const task = (overrides) => ({
  id: `t-${Math.random()}`,
  examId: 'e1',
  subjectId: 's1',
  duration: 40,
  completed: false,
  phase: 'INTRODUCCIÓN',
  isPanicMode: false,
  ...overrides,
});

// Caso 1: nada generado todavía para este examen (más allá del horizonte).
{
  const exam = { id: 'e1', name: 'Física', subjectId: 's1', date: new Date(now.getTime() + 40 * DAY) };
  const p = examProgressFor({ exam, subjects, microplans: [], todaysExamIds: new Set(), now });
  ok('sin tareas → notStarted', p.notStarted === true);
  ok('sin tareas → no "ready"', p.ready === false);
  ok('sin tareas → no "hot" (no hay de qué alarmarse todavía)', p.hot === false);
  ok('sin tareas → pie dice que aún no empieza', p.footerRight === 'aún no empieza');
  ok('sin tareas → fase "Por empezar"', p.phaseLabel === 'Por empezar');
}

// Caso 2: en marcha, ninguna sesión hecha, examen cerca → hot.
{
  const exam = { id: 'e1', name: 'Matemáticas II', subjectId: 's1', date: new Date(now.getTime() + 2 * DAY) };
  const microplans = [
    task({ date: iso(-2), phase: 'INTRODUCCIÓN', completed: true }),
    task({ date: iso(0), phase: 'ESTUDIO PROFUNDO', completed: false }),
    task({ date: iso(1), phase: 'PRÁCTICA', completed: false }),
  ];
  const p = examProgressFor({ exam, subjects, microplans, todaysExamIds: new Set(['e1']), now });
  ok('en marcha, cerca y no listo → hot', p.hot === true);
  ok('1 de 3 hechas', p.doneSessions === 1 && p.totalSessions === 3);
  ok('la fase actual es la de la última tarea de hoy o antes (ESTUDIO PROFUNDO)', p.phaseLabel === 'Estudio profundo');
  ok('con una tarea de hoy sin marcar, el pie dice "hoy le toca"', p.footerRight === 'hoy le toca');
}

// Caso 3: todas las sesiones hechas → ready, nunca "hot" a la vez.
{
  const exam = { id: 'e1', name: 'Inglés', subjectId: 's1', date: new Date(now.getTime() + 1 * DAY) };
  const microplans = [
    task({ date: iso(-3), completed: true }),
    task({ date: iso(-2), completed: true }),
    task({ date: iso(-1), phase: 'REPASO FINAL', completed: true }),
  ];
  const p = examProgressFor({ exam, subjects, microplans, todaysExamIds: new Set(), now });
  ok('todo hecho → ready', p.ready === true);
  ok('ready nunca es también hot, aunque esté cerca', p.hot === false);
  ok('ready → pie dice que no queda nada pendiente', p.footerRight === 'nada pendiente');
}

// Caso 4: en marcha pero lejos → ni hot ni ready, y el pie da el tiempo real.
{
  const exam = { id: 'e1', name: 'Química', subjectId: 's1', date: new Date(now.getTime() + 11 * DAY) };
  const microplans = [
    task({ date: iso(-4), completed: true, duration: 40 }),
    task({ date: iso(-1), completed: false, duration: 35 }),
    task({ date: iso(3), completed: false, duration: 40 }),
  ];
  const p = examProgressFor({ exam, subjects, microplans, todaysExamIds: new Set(), now });
  ok('lejos y en marcha → no hot', p.hot === false);
  ok('lejos y en marcha → no ready', p.ready === false);
  ok(
    'el pie suma los minutos de las tareas SIN marcar, no el total',
    p.footerRight === `${formatMinutes(35 + 40)} por delante`,
    p.footerRight
  );
}

// Caso 5: modo pánico — la fase real se ve en el pie, no se oculta.
{
  const exam = { id: 'e1', name: 'Historia', subjectId: 's1', date: new Date(now.getTime() + 1 * DAY) };
  const microplans = [task({ date: iso(0), phase: 'MODO PÁNICO 🔥', isPanicMode: true, completed: false })];
  const p = examProgressFor({ exam, subjects, microplans, todaysExamIds: new Set(), now });
  ok('pánico → va al último punto de la pista de fases', p.phaseIndex === STUDY_PHASES.length - 1);
  ok('pánico → el texto sigue diciendo la verdad, no la esconde', p.phaseLabel.toLowerCase().includes('pánico'), p.phaseLabel);
}

// ── detalle de un examen: cuándo estudio esto ────────────────────────────────

console.log('\n── examSessionsFor ──');
{
  const exam = { id: 'e1', name: 'Historia', subjectId: 's1', date: new Date(now.getTime() + 5 * DAY) };
  const microplans = [
    task({ id: 't3', date: iso(2), duration: 40, phase: 'PRÁCTICA', completed: false }),
    task({ id: 't1', date: iso(-2), duration: 30, phase: 'INTRODUCCIÓN', completed: true }),
    task({ id: 't2', date: iso(-1), duration: 35, phase: 'ESTUDIO PROFUNDO', completed: false }),
    { id: 'otro', examId: 'e2', date: iso(1), duration: 25 },
  ];
  const sessions = examSessionsFor({ exam, microplans, now });

  ok('solo las sesiones de ESTE examen', sessions.length === 3, String(sessions.length));
  ok(
    'vienen en orden de fecha',
    sessions.map((s) => s.id).join(',') === 't1,t2,t3',
    sessions.map((s) => s.id).join(',')
  );
  ok('la hecha va marcada', sessions[0].completed === true);
  ok('la hecha de un día pasado NO es retraso', sessions[0].overdue === false);
  ok('la sin marcar de un día pasado SÍ es retraso', sessions[1].overdue === true);
  ok('la futura no es retraso', sessions[2].overdue === false);
  ok('cada una lleva sus minutos', sessions[2].minutes === 40);
  ok('la fase se escribe legible', sessions[0].phaseLabel === 'Introducción', sessions[0].phaseLabel);
}

{
  const exam = { id: 'e1', name: 'X', subjectId: 's1', date: new Date(now.getTime() + 2 * DAY) };
  ok('sin plan, ninguna sesión', examSessionsFor({ exam, microplans: [], now }).length === 0);
  ok('microplans null no revienta', examSessionsFor({ exam, microplans: null, now }).length === 0);
  const hoy = examSessionsFor({ exam, microplans: [task({ date: iso(0) })], now });
  ok('la de hoy se marca como hoy', hoy[0].isToday === true);
  ok('la de hoy no cuenta como retraso', hoy[0].overdue === false);
}

console.log('\n── dayLabelFor ──');
{
  const label = dayLabelFor(new Date(2026, 10, 12));
  ok('etiqueta corta con día', /^[a-záéíóú]+ \d{1,2}$/.test(label), label);
  ok('una fecha inválida no revienta', dayLabelFor('no-es-fecha') === '');
}

console.log('\n── examVerdictFor: ¿llego? ──');
{
  const s = (over, done) => ({ completed: done, overdue: over, minutes: 30 });

  ok(
    'sin sesiones y con días por delante: aún no hay nada, no es alarma',
    examVerdictFor({ sessions: [], daysUntil: 9, examId: 'e1' }).kind === 'none'
  );
  ok(
    'todo hecho: preparado',
    examVerdictFor({ sessions: [s(false, true), s(false, true)], daysUntil: 3, examId: 'e1' })
      .kind === 'ready'
  );
  ok(
    'con sesiones atrasadas: retraso, no "vas cubierto"',
    examVerdictFor({ sessions: [s(true, false), s(false, false)], daysUntil: 3, examId: 'e1' })
      .kind === 'behind'
  );
  ok(
    'sin atrasos ni déficit: cubierto',
    examVerdictFor({ sessions: [s(false, false), s(false, false)], daysUntil: 6, examId: 'e1' })
      .kind === 'ontrack'
  );

  const diag = { unscheduled: [{ examId: 'e1', minutesShort: 45 }] };
  ok(
    'el déficit gana al retraso: es lo más grave',
    examVerdictFor({ sessions: [s(true, false)], daysUntil: 2, planDiagnostics: diag, examId: 'e1' })
      .kind === 'short'
  );
  ok(
    'el déficit de OTRO examen no contamina a este',
    examVerdictFor({ sessions: [s(false, false)], daysUntil: 5, planDiagnostics: diag, examId: 'e2' })
      .kind === 'ontrack'
  );
  ok(
    'sin diagnóstico (app recién abierta) sigue habiendo veredicto',
    examVerdictFor({ sessions: [s(false, false)], daysUntil: 5, planDiagnostics: null, examId: 'e1' })
      .kind === 'ontrack'
  );
  ok(
    'un examen preparado no se llama en déficit aunque el diagnóstico lo diga',
    examVerdictFor({ sessions: [s(false, true)], daysUntil: 2, planDiagnostics: diag, examId: 'e1' })
      .kind === 'ready'
  );
  ok(
    'el veredicto siempre trae texto',
    Boolean(examVerdictFor({ sessions: [s(true, false)], daysUntil: 1, examId: 'e1' }).text)
  );
}

console.log(failures === 0 ? '\n✅ todo correcto' : `\n❌ ${failures} comprobación(es) fallan`);
process.exit(failures === 0 ? 0 : 1);
