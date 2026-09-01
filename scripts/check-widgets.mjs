/**
 * Checks for the home screen widgets.  ·  npm run check:widgets
 *
 * Widgets fail silently. They are built in a headless process, drawn by the
 * launcher, and when anything at all goes wrong the student does not get an
 * error — they get a transparent rectangle that still occupies the cells.
 * That is how the Medium and Large widgets shipped invisible: a React
 * Fragment (`<>…</>`) inside them, which `buildWidgetTree` cannot walk, so
 * the render threw and nothing was ever drawn.
 *
 * So this runs the real widgets through the real `buildWidgetTree` — the same
 * function the native side calls — across every model state, and asserts the
 * things that are easy to break and impossible to see:
 *
 *   · every size renders in every state (no Fragments, no `null` components)
 *   · no text prop is `undefined`/`"undefined"`
 *   · every colour survives `convertColor` as a hex Android can parse
 *     (`Color.parseColor` throws on anything else, blanking the widget)
 *   · icons are SvgWidget, never IconWidget with a font that isn't bundled
 *
 * Run it after touching widgets/ScheduioWidget.js. `--json <file>` dumps the
 * rendered trees, which is what the design preview is built from.
 *
 * ─── Why the require hook ───
 * The widgets are ESM + JSX and package.json has no `"type": "module"`, so
 * Node cannot load them as-is. Rather than disturb Metro's Babel config for a
 * script, project files are compiled on require, and the two native-facing
 * modules (`react-native`, `react-native-android-widget`) are stubbed: the
 * widget parts of the library are plain JS, so this exercises the real code.
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(ROOT, 'node_modules/react-native-android-widget/lib/commonjs');

/* ── compile project ESM + JSX on require ─────────────────────────────── */
const Module = require('node:module');
const fs = require('node:fs');
const babel = require('@babel/core');

const compileJs = Module._extensions['.js'];
Module._extensions['.js'] = (mod, filename) => {
  if (filename.includes('node_modules')) return compileJs(mod, filename);
  const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    babelrc: false,
    configFile: false,
    plugins: [
      ['@babel/plugin-transform-react-jsx', { runtime: 'classic' }],
      '@babel/plugin-transform-modules-commonjs',
    ],
  });
  mod._compile(code, filename);
};

/* ── stub the two modules that need a device ──────────────────────────── */
const fake = (id, exports) => {
  require.cache[id] = { id, filename: id, loaded: true, exports };
};
fake('RN', {
  Platform: { OS: 'android', select: (o) => o.android ?? o.default },
  Image: { resolveAssetSource: (source) => ({ uri: String(source) }) },
});
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'react-native') return 'RN';
  if (request === 'react-native-android-widget') return 'RNAW';
  return resolve.call(this, request, ...rest);
};
fake(
  'RNAW',
  Object.fromEntries(
    ['FlexWidget', 'TextWidget', 'SvgWidget', 'ImageWidget', 'OverlapWidget'].map((name) => [
      name,
      require(join(LIB, `widgets/${name}.js`))[name],
    ])
  )
);

const { buildWidgetTree } = require(join(LIB, 'api/build-widget-tree.js'));
const { renderWidgetForName } = require(join(ROOT, 'widgets/ScheduioWidget.js'));

/* ── the states a widget can find itself in ───────────────────────────── */
const NOW = new Date();
const day = (n) => new Date(NOW.getTime() + n * 86400000).toISOString();
const exam = (id, name, color) => ({ id, name, color });
const task = (id, text) => ({ id, text });

const STATES = {
  'nunca sincronizado': { synced: false, hasExam: false, streak: 0, exams: [], tasksToday: [] },
  'sin examen, sin racha': { synced: true, hasExam: false, streak: 0, exams: [], tasksToday: [] },
  'sin examen, con racha': { synced: true, hasExam: false, streak: 12, exams: [], tasksToday: [] },
  'examen hoy': {
    synced: true,
    hasExam: true,
    streak: 21,
    examDateIso: day(0),
    exams: [exam('e1', 'Filosofía', '#8A6FD4')],
    tasksToday: [task('t1', 'Repaso final de Kant')],
  },
  'examen mañana': {
    synced: true,
    hasExam: true,
    streak: 4,
    examDateIso: day(1),
    exams: [exam('e1', 'Química', '#3FA76B')],
    tasksToday: [task('t1', 'Formulación orgánica')],
  },
  'examen en 8 días, sin tareas': {
    synced: true,
    hasExam: true,
    streak: 0,
    examDateIso: day(8),
    exams: [exam('e1', 'Historia de España', '#C9922F')],
    tasksToday: [],
  },
  'examen en 12 días, 3 tareas': {
    synced: true,
    hasExam: true,
    streak: 6,
    examDateIso: day(12),
    exams: [exam('e1', 'Matemáticas II', '#E0705A')],
    tasksToday: [
      task('t1', 'Repasar límites'),
      task('t2', 'Hacer 10 integrales por partes'),
      task('t3', 'Test de derivadas'),
    ],
  },
  'examen a 140 días': {
    synced: true,
    hasExam: true,
    streak: 3,
    examDateIso: day(140),
    exams: [exam('e1', 'Tecnología', '#2FA4A6')],
    tasksToday: [],
  },
  '3 exámenes el mismo día': {
    synced: true,
    hasExam: true,
    streak: 9,
    examDateIso: day(2),
    exams: [
      exam('e1', 'Lengua', '#6C6FD4'),
      exam('e2', 'Inglés', '#D46A9A'),
      exam('e3', 'TIC', '#4C9BE0'),
    ],
    tasksToday: [task('t1', 'Comentario de texto')],
  },
  'nombre larguísimo': {
    synced: true,
    hasExam: true,
    streak: 100,
    examDateIso: day(3),
    exams: [exam('e1', 'Fundamentos de Programación Orientada a Objetos II', '#4C9BE0')],
    tasksToday: [task('t1', 'Repasar herencia, polimorfismo y encapsulación a fondo')],
  },
  'hasExam sin fecha (caché antigua)': {
    synced: true,
    hasExam: true,
    streak: 2,
    examDateIso: null,
    exams: [exam('e1', 'Historia', '#C9922F')],
    tasksToday: [],
  },
  'modelo mínimo (campos ausentes)': { synced: true, hasExam: false, streak: 1 },
};

let fail = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${actual}${ok ? '' : ` (esperado ${expected})`}`);
};

const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
const walk = (node, visit) => {
  visit(node);
  (node?.children ?? []).forEach((child) => walk(child, visit));
};

const problems = [];
const trees = {};

console.log('=== todos los tamaños, en todos los estados ===');
for (const [label, model] of Object.entries(STATES)) {
  for (const size of ['Small', 'Medium', 'Large']) {
    const name = `${size.padEnd(6)} · ${label}`;
    try {
      const tree = buildWidgetTree(renderWidgetForName(size, model));
      trees[name] = { size, label, model, tree };

      walk(tree, (node) => {
        const p = node?.props ?? {};
        if (node?.type === 'IconWidget') {
          problems.push(`${name}: IconWidget (fuente no empaquetada) — usa SvgWidget`);
        }
        if ('text' in p && (p.text == null || String(p.text).includes('undefined'))) {
          problems.push(`${name}: texto inválido (${JSON.stringify(p.text)})`);
        }
        for (const key of ['color', 'backgroundColor']) {
          if (p[key] != null && !HEX.test(p[key])) {
            problems.push(`${name}: ${key} ilegible para Color.parseColor (${p[key]})`);
          }
        }
      });

      let nodes = 0;
      walk(tree, () => nodes++);
      console.log(`ok   ${name} (${nodes} vistas)`);
    } catch (error) {
      fail++;
      console.log(`FAIL ${name}\n       ${String(error.message).split('\n')[0]}`);
    }
  }
}

console.log('\n=== invariantes ===');
problems.forEach((problem) => console.log(`FAIL ${problem}`));
fail += problems.length;
check('sin problemas de dibujo', problems.length, 0);

// The 2x2 is the one people actually keep on the home screen: it has room for
// three rows, and only three.
const small = trees['Small  · examen en 12 días, 3 tareas'];
const texts = [];
walk(small.tree, (node) => 'text' in (node.props ?? {}) && texts.push(node.props.text));
check('2x2 · dice la asignatura', texts.includes('MATEMÁTICAS II'), true);
check('2x2 · dice cuántos días', texts.includes('12'), true);
check(
  '2x2 · y la fecha',
  texts.some((t) => /^\d+ [a-z]{3}$/.test(t)),
  true
);
check('2x2 · sin ceros inventados', texts.includes('0'), false);
check(
  '2x2 · nada de texto sin recortar',
  (() => {
    let free = 0;
    walk(small.tree, (node) => {
      if ('text' in (node.props ?? {}) && node.props.text.length > 8 && !node.props.maxLines)
        free++;
    });
    return free;
  })(),
  0
);

const empty = trees['Small  · nunca sincronizado'];
const emptyTexts = [];
walk(empty.tree, (node) => 'text' in (node.props ?? {}) && emptyTexts.push(node.props.text));
check('recién añadido · no inventa datos', emptyTexts.includes('0'), false);
check('recién añadido · invita a abrir la app', emptyTexts.includes('Toca para empezar'), true);

// El 4x4 es gratis para todo el mundo: enseña el plan, no un anuncio de Prime.
const large = trees['Large  · examen en 12 días, 3 tareas'];
const has = (tree, text) => {
  let found = false;
  walk(tree, (node) => {
    if ((node.props ?? {}).text === text) found = true;
  });
  return found;
};
check('4x4 · lista las tareas de hoy', has(large.tree, 'Repasar límites'), true);
check('4x4 · las tres, no solo la primera', has(large.tree, 'Test de derivadas'), true);
check('4x4 · sin anuncio de Prime', has(large.tree, 'Tamaño grande incluido con Prime'), false);

const jsonFlag = process.argv.indexOf('--json');
if (jsonFlag !== -1 && process.argv[jsonFlag + 1]) {
  writeFileSync(process.argv[jsonFlag + 1], JSON.stringify(trees, null, 2));
  console.log(`\nárboles escritos en ${process.argv[jsonFlag + 1]}`);
}

console.log(`\n${fail === 0 ? '✅ todo correcto' : `❌ ${fail} fallos`}`);
process.exit(fail === 0 ? 0 : 1);
