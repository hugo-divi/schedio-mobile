/**
 * Checks for what "Hoy" on Inicio says.  ·  npm run check:today-copy
 *
 * The AI line is often unavailable (daily quota, budget breaker, network), so
 * the headline is built from the plan alone in services/todayCopy.js. This
 * runs the real file over every situation a day can be in and checks the
 * headline names the right thing, the numbers add up, optional tasks never
 * keep a day "unfinished", and the same day always reads the same.
 *
 * Copies services/todayCopy.js to a temp .mjs for the same reason as the
 * other check-*.mjs. The repository isn't touched.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const here = mkdtempSync(join(tmpdir(), 'schedio-today-copy-'));
writeFileSync(
  join(here, 'todayCopy.mjs'),
  readFileSync(join(root, 'services', 'todayCopy.js'), 'utf8')
);
const { buildTodayView, TIPS } = await import(`file://${join(here, 'todayCopy.mjs')}`);

let failures = 0;
const ok = (label, condition, detail = '') => {
  if (!condition) failures++;
  console.log(`${condition ? 'ok  ' : 'FALLA'} ${label}${detail ? `: ${detail}` : ''}`);
};

const NOW = new Date(2026, 10, 3, 17, 0);
const inDays = (n) => new Date(2026, 10, 3 + n, 12, 0);
const task = (id, subjectName, duration, extra = {}) => ({
  id,
  subjectName,
  duration,
  text: `Tarea de ${subjectName}`,
  completed: false,
  ...extra,
});
const exam = (subjectName, days) => ({ name: 'Tema 4', subjectName, date: inDays(days) });
const view = (input) => buildTodayView({ now: NOW, ...input });

console.log('\n── cada situación dice lo que toca ──');
let v = view({ tasks: [task('a', 'Química', 30)], exams: [exam('Química', 5)] });
ok(
  'una sesión → la nombra con sus minutos',
  v.state === 'pending' && v.headline === 'Hoy toca Química · 30 min',
  v.headline
);

v = view({
  tasks: [task('a', 'Química', 30), task('b', 'Inglés', 20)],
  exams: [exam('Química', 5)],
});
ok(
  'varias → total y por dónde empezar',
  v.headline === 'Hoy: 50 min de estudio' && v.detail.startsWith('Empieza por Química'),
  `${v.headline} / ${v.detail}`
);
ok('la siguiente es la primera pendiente del plan', v.next?.id === 'a');

v = view({
  tasks: [task('a', 'Química', 30, { completed: true }), task('b', 'Inglés', 20)],
  exams: [exam('Química', 5)],
});
ok(
  'a medias → lo que queda',
  v.state === 'partial' &&
    v.headline === 'Te quedan 20 min' &&
    v.detail.startsWith('Sigue con Inglés'),
  `${v.headline} / ${v.detail}`
);
ok('cuenta hechas y total', v.doneCount === 1 && v.total === 2);

v = view({
  tasks: [
    task('a', 'Química', 30, { completed: true }),
    task('b', 'Inglés', 20, { isOptional: true }),
  ],
});
ok('solo queda una opcional → el día está hecho', v.state === 'done', v.headline);

v = view({
  tasks: [
    task('a', 'Química', 30, { completed: true }),
    task('b', 'Inglés', 25, { completed: true }),
  ],
});
ok(
  'todo hecho → completado con los minutos',
  v.state === 'done' && v.detail === '55 min estudiados en 2 sesiones.',
  v.detail
);

v = view({ tasks: [task('a', 'Historia', 45)], exams: [exam('Historia', 1)] });
ok(
  'examen mañana → lo dice y habla de repaso final',
  v.state === 'exam_tomorrow' &&
    v.headline === 'Mañana es tu examen de Historia' &&
    v.detail.includes('45 min'),
  `${v.headline} / ${v.detail}`
);

v = view({ tasks: [], exams: [exam('Historia', 0)] });
ok(
  'examen hoy → manda sobre todo lo demás',
  v.state === 'exam_today' && v.headline === 'Hoy es tu examen de Historia'
);

v = view({ tasks: [], exams: [exam('Física', 6)] });
ok(
  'nada hoy pero hay examen → lo dice y cuándo',
  v.state === 'empty' && v.detail.includes('Física') && v.detail.includes('en 6 días'),
  v.detail
);

v = view({ tasks: [], exams: [] });
ok(
  'sin exámenes → invita a añadir uno',
  v.state === 'no_exams' && v.headline === 'Añade tu próximo examen'
);

v = view({ tasks: [task('a', 'Química', 30)], exams: [exam('Física', -2)] });
ok('un examen pasado no cuenta como próximo', v.state === 'pending');

console.log('\n── las frases predeterminadas ──');
v = view({ tasks: [task('a', 'Química', 30)], streak: 6 });
ok('con racha, la frase la usa', v.tip.includes('6'), v.tip);
ok('ninguna frase deja huecos sin rellenar', !/[{}]/.test(v.tip));
const allTips = Object.values(TIPS).flat();
ok(
  'ninguna frase promete notas',
  allTips.every((line) => !/(aprobar|nota|sobresaliente|garantiz)/i.test(line))
);
ok(
  'ninguna frase echa nada en cara',
  allTips.every((line) => !/(otra vez|deberías|vago|fallaste)/i.test(line))
);

console.log('\n── estable dentro del día ──');
const a = view({ tasks: [task('a', 'Química', 30)] });
const b = view({ tasks: [task('a', 'Química', 30)] });
ok('el mismo día, la misma frase', a.tip === b.tip && a.headline === b.headline);
const days = new Set(
  Array.from(
    { length: 6 },
    (_, i) =>
      buildTodayView({ tasks: [task('a', 'Química', 30)], now: new Date(2026, 10, 3 + i, 17) }).tip
  )
);
ok('en una semana no sale siempre la misma', days.size > 1, `${days.size} distintas`);

console.log(failures === 0 ? '\n✅ todo correcto' : `\n❌ ${failures} comprobación(es) fallan`);
process.exit(failures === 0 ? 0 : 1);
