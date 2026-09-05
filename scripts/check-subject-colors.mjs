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

/** Luminancia relativa de WCAG, para poder calcular contrastes de verdad. */
const luminanceOf = (hex) => {
  const [r, g, b] = hex2rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a, b) => {
  const [hi, lo] = [luminanceOf(a), luminanceOf(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const saturationOf = (hex) => {
  const [r, g, b] = hex2rgb(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  return mx === mn ? 0 : ((mx - mn) / (1 - Math.abs(2 * l - 1))) * 100;
};
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
/**
 * Separación mínima **de matiz** entre dos materias vecinas.
 *
 * Con veinte colores en los ~296° que quedan fuera de la banda del acento, la
 * media sale a 14,8°: exigir 12 a todas las parejas es apurado y, sobre todo,
 * mide lo que no toca. Dos colores a 11° pero uno vivo y otro apagado se
 * distinguen sin esfuerzo; dos a 14° con la misma saturación y la misma luz,
 * no. Por eso la regla de abajo acepta cualquiera de las dos separaciones —
 * matiz **o** tonalidad — en vez de exigir siempre la primera.
 */
const MIN_SEPARATION = 12;

/**
 * Diferencia de saturación que, por sí sola, ya distingue dos colores vecinos
 * aunque su matiz esté cerca. La paleta alterna ~72% y ~30%, así que toda
 * pareja consecutiva se lleva unos 42 puntos.
 */
const MIN_SATURATION_STEP = 20;

/**
 * La inicial de la materia se pinta en BLANCO dentro del círculo, a 14px en
 * negrita. Eso no es "texto grande" para WCAG, así que pide 4,5:1 — y es la
 * regla que faltaba aquí: la paleta anterior tenía **diez de veinte colores
 * por debajo de 3:1**, con el cian en 1,99:1 y la letra casi ilegible. Ahora
 * el contraste es lo que fija la luminosidad de cada tono, no algo que se
 * mira después.
 */
const INITIAL_COLOR = '#FFFFFF';
const MIN_INITIAL_CONTRAST = 4.5;

/** El círculo va sobre la tarjeta, así que también tiene que despegarse de ella. */
const CARD = '#242424';
const MIN_CARD_CONTRAST = 3;

/**
 * Variedad de tonalidad, no solo de matiz. Con la saturación idéntica en las
 * veinte (58% en todas, que es como estaba) la paleta se leía como una sola
 * pared de color aunque los tonos estuvieran bien repartidos.
 */
const MIN_SATURATION_RANGE = 25;

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

console.log('\n── la inicial blanca se lee encima de todos ──');
all.forEach((c) => {
  const ratio = contrast(c.hex, INITIAL_COLOR);
  ok(`${c.name.padEnd(11)} ${c.hex}`, ratio >= MIN_INITIAL_CONTRAST, `${ratio.toFixed(2)}:1`);
});

console.log('\n── y todos se despegan de la tarjeta ──');
const worstCard = all.reduce(
  (acc, c) => {
    const ratio = contrast(c.hex, CARD);
    return ratio < acc.ratio ? { ratio, name: c.name } : acc;
  },
  { ratio: Infinity, name: null }
);
ok(
  `el que menos, sobre ${CARD}`,
  worstCard.ratio >= MIN_CARD_CONTRAST,
  `${worstCard.name} a ${worstCard.ratio.toFixed(2)}:1`
);

console.log('\n── distintas tonalidades, no solo distintos tonos ──');
const sats = all.map((c) => saturationOf(c.hex));
const satRange = Math.max(...sats) - Math.min(...sats);
ok(
  'la saturación varía entre los colores',
  satRange >= MIN_SATURATION_RANGE,
  `${satRange.toFixed(0)} puntos (de ${Math.min(...sats).toFixed(0)}% a ${Math.max(...sats).toFixed(0)}%)`
);

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
const tooClose = [];
sorted.forEach((c, i) => {
  if (i === 0) return;
  const prev = sorted[i - 1];
  const gap = hueGap(c.hue, prev.hue);
  const satStep = Math.abs(saturationOf(c.hex) - saturationOf(prev.hex));
  // Vale con una de las dos: o se separan de matiz, o uno es vivo y el otro
  // apagado. Lo que no puede pasar es que se parezcan en las dos cosas.
  if (gap < MIN_SEPARATION && satStep < MIN_SATURATION_STEP) {
    tooClose.push(`${prev.name}/${c.name} (${gap.toFixed(0)}° y ${satStep.toFixed(0)} pts)`);
  }
});
ok(
  'ninguna pareja vecina se parece a la vez en matiz y en tonalidad',
  tooClose.length === 0,
  tooClose.length ? tooClose.join(', ') : 'ninguna'
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
