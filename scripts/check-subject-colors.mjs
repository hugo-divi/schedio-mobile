/**
 * Checks for the subject palette.  ·  npm run check:subject-colors
 *
 * Los colores de materia tienen dos reglas que es fácil romper sin darse
 * cuenta al añadir un tono:
 *
 *  1. **Ninguno cerca del azul de acento.** #2979FF significa "seleccionado"
 *     en toda la app; una materia de ese azul compite con esa señal. La paleta
 *     anterior tenía `tic` (#4C9BE0) a 10° del acento — el mismo azul a
 *     efectos prácticos — y `fisica` y `lengua` a 20°.
 *  2. **Ordenados por tono**, y suficientemente separados entre sí para que
 *     dos materias no se confundan en el punto de ~24px que dibuja la ficha.
 *
 * Este script las comprueba sobre theme/tokens.js, que es de donde salen. Se
 * lee el fichero como texto y se extraen los hex: tokens.js importa
 * `react-native` (para `Platform.select`) y no se puede importar en Node.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'theme', 'tokens.js'), 'utf8');

/** Los hex de un bloque `nombre: { clave: '#RRGGBB', ... }`. */
const blockOf = (key) => {
  const block = source.match(new RegExp(`${key}: \\{([\\s\\S]*?)\\n  \\}`));
  if (!block) throw new Error(`No se encuentra el bloque ${key} en theme/tokens.js`);
  return [...block[1].matchAll(/(\w+): '(#[0-9A-Fa-f]{6})'/g)].map((m) => ({
    name: m[1],
    hex: m[2].toUpperCase(),
  }));
};

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hueOf = (hex) => {
  let [r, g, b] = hex2rgb(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (!d) return 0;
  let h;
  if (mx === r) h = 60 * (((g - b) / d) % 6);
  else if (mx === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return h < 0 ? h + 360 : h;
};
/** Distancia angular más corta entre dos tonos. */
const hueGap = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

const ACCENT = (source.match(/accent: '(#[0-9A-Fa-f]{6})'/) || [])[1];
const ACCENT_HUE = hueOf(ACCENT.toUpperCase());
/** Banda alrededor del acento donde no puede caer ninguna materia. */
const GUARD = 32;
/** Separación mínima entre dos materias para que se distingan en el punto. */
const MIN_SEPARATION = 12;

let failures = 0;
const ok = (label, condition, detail = '') => {
  if (!condition) failures++;
  console.log(`${condition ? 'ok  ' : 'FALLA'} ${label}${detail ? `: ${detail}` : ''}`);
};

const free = blockOf('subjects');
const extra = blockOf('subjectsExtra');
const all = [...free, ...extra].map((c) => ({ ...c, hue: hueOf(c.hex) }));

console.log(`\nacento ${ACCENT} · tono ${ACCENT_HUE.toFixed(1)}° · banda prohibida ±${GUARD}°`);

console.log('\n── tamaños ──');
ok('ocho colores gratuitos', free.length === 8, `${free.length}`);
ok('doce más con Prime', extra.length === 12, `${extra.length}`);
ok('veinte en total, uno por materia del tope de Prime', all.length === 20);

console.log('\n── ninguno se confunde con el acento ──');
all.forEach((c) => {
  const d = hueGap(c.hue, ACCENT_HUE);
  ok(
    `${c.name.padEnd(11)} ${c.hex} ${String(Math.round(c.hue)).padStart(3)}°`,
    d >= GUARD,
    `${Math.round(d)}° del acento`
  );
});

console.log('\n── ordenados por tono ──');
const freeHues = free.map((c) => hueOf(c.hex));
ok(
  'las gratuitas van de menor a mayor tono',
  freeHues.every((h, i) => i === 0 || h > freeHues[i - 1]),
  freeHues.map((h) => Math.round(h)).join('° → ') + '°'
);
const extraHues = extra.map((c) => hueOf(c.hex));
ok(
  'las de Prime también',
  extraHues.every((h, i) => i === 0 || h > extraHues[i - 1]),
  extraHues.map((h) => Math.round(h)).join('° → ') + '°'
);

console.log('\n── ninguna pareja se parece demasiado ──');
const sorted = [...all].sort((a, b) => a.hue - b.hue);
let worst = { gap: 360 };
sorted.forEach((c, i) => {
  if (i === 0) return;
  const gap = hueGap(c.hue, sorted[i - 1].hue);
  if (gap < worst.gap) worst = { gap, a: sorted[i - 1].name, b: c.name };
});
ok(
  `la pareja más parecida se separa al menos ${MIN_SEPARATION}°`,
  worst.gap >= MIN_SEPARATION,
  `${worst.a} y ${worst.b}, ${worst.gap.toFixed(1)}°`
);
ok(
  'no hay dos colores repetidos',
  new Set(all.map((c) => c.hex)).size === all.length
);
ok(
  'no hay dos nombres repetidos',
  new Set(all.map((c) => c.name)).size === all.length
);

console.log(failures === 0 ? '\n✅ todo correcto' : `\n❌ ${failures} comprobación(es) fallan`);
process.exit(failures === 0 ? 0 : 1);
