/**
 * Checks for the date/number formatting.  ·  npm run check:locale-format
 *
 * `services/localeFormat.js` es lo que hace que el interruptor de inglés
 * alcance también a las fechas. Tiene dos maneras silenciosas de romperse:
 *
 *  1. **Un formato con nombre al que le falta un idioma.** Los patrones viven
 *     en una tabla `{ es, en }`; si alguien añade un formato y solo rellena
 *     `es`, date-fns recibe `undefined` y revienta en tiempo de ejecución, en
 *     la pantalla del alumno, no aquí.
 *  2. **Gramática española colada en el patrón inglés.** El motivo de que este
 *     módulo exista es que los sitios de llamada llevaban `"d 'de' MMMM"`
 *     incrustado: cambiar solo el objeto de locale daba "5 de October". Un
 *     `'de'` entrecomillado en la columna `en` reintroduce exactamente ese
 *     fallo, y a simple vista no se ve.
 *
 * Se importa el módulo de verdad (no se lee como texto): no depende de React
 * Native, justo para poder ejecutarlo aquí.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// El proyecto es ESM pero package.json no declara "type": "module", así que
// una copia con extensión .mjs es lo que permite importarlo — el mismo truco
// que usan los demás check:*. A diferencia de ellos, este módulo sí tiene una
// dependencia real (date-fns), así que la copia va dentro del proyecto y no en
// el temporal del sistema: desde fuera, Node no encuentra node_modules.
const cache = join(root, 'node_modules', '.cache', 'schedio');
mkdirSync(cache, { recursive: true });
const copy = join(cache, 'localeFormat.mjs');
copyFileSync(join(root, 'services', 'localeFormat.js'), copy);

const { DATE_FORMATS, WEEKDAY_INITIALS, formatDate, formatNumber, resolveLanguage, intlLocale } =
  await import(pathToFileURL(copy).href);

const LANGS = ['es', 'en'];
const failures = [];
const fail = (msg) => failures.push(msg);

// 1. Todo formato con nombre existe en los dos idiomas y no está vacío.
for (const [name, patterns] of Object.entries(DATE_FORMATS)) {
  for (const lang of LANGS) {
    if (!patterns[lang]) fail(`El formato "${name}" no tiene patrón para "${lang}".`);
  }
}

// 2. Ningún patrón inglés arrastra gramática española entrecomillada.
for (const [name, patterns] of Object.entries(DATE_FORMATS)) {
  const literals = [...String(patterns.en ?? '').matchAll(/'([^']*)'/g)].map((m) => m[1]);
  for (const literal of literals) {
    if (/^(de|del|a|las?)$/i.test(literal.trim())) {
      fail(`El formato "${name}" deja "${literal}" en el patrón inglés: "${patterns.en}".`);
    }
  }
}

// 3. Todo formato se renderiza sin lanzar, y da algo distinto de la cadena vacía.
const sample = new Date(2026, 9, 5); // lunes 5 de octubre de 2026
for (const name of Object.keys(DATE_FORMATS)) {
  for (const lang of LANGS) {
    let out;
    try {
      out = formatDate(sample, name, lang);
    } catch (error) {
      fail(`formatDate(sample, "${name}", "${lang}") lanza: ${error.message}`);
      continue;
    }
    if (!out || !String(out).trim()) fail(`formatDate(sample, "${name}", "${lang}") sale vacío.`);
    if (/\bde\b/.test(out) && lang === 'en') {
      fail(`"${name}" en inglés sale como "${out}" — lleva un "de" español.`);
    }
  }
}

// 4. Los dos idiomas tienen que diferenciarse de verdad en los formatos con
//    nombre de mes o de día; si no, el interruptor no se nota.
for (const name of ['dayMonthLong', 'monthYear', 'weekdayLong', 'weekdayLongDayMonth']) {
  if (formatDate(sample, name, 'es') === formatDate(sample, name, 'en')) {
    fail(`"${name}" sale igual en los dos idiomas: "${formatDate(sample, name, 'es')}".`);
  }
}

// 5. Un formato desconocido tiene que lanzar, no colarse hasta la pantalla.
try {
  formatDate(sample, 'noExiste', 'es');
  fail('formatDate acepta un formato inexistente en vez de lanzar.');
} catch {
  /* esperado */
}

// 6. Siete iniciales por idioma, empezando en lunes como las rejillas.
for (const lang of LANGS) {
  const initials = WEEKDAY_INITIALS[lang];
  if (!initials || initials.length !== 7) {
    fail(`WEEKDAY_INITIALS.${lang} debería tener 7 entradas, tiene ${initials?.length}.`);
  }
}

// 7. Idiomas no soportados o etiquetas largas caen a español sin romperse.
for (const [input, expected] of [
  ['en-GB', 'en'],
  ['es-ES', 'es'],
  ['fr', 'es'],
  [undefined, 'es'],
  [null, 'es'],
]) {
  if (resolveLanguage(input) !== expected) {
    fail(`resolveLanguage(${JSON.stringify(input)}) = "${resolveLanguage(input)}", esperado "${expected}".`);
  }
}

// 8. Los números también cambian de separador.
if (formatNumber(12500, 'es') === formatNumber(12500, 'en')) {
  fail(`formatNumber no distingue idiomas: ${formatNumber(12500, 'es')} en ambos.`);
}

if (failures.length) {
  console.error('check:locale-format — FALLOS\n');
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}

console.log('check:locale-format — OK');
console.log(`  ${Object.keys(DATE_FORMATS).length} formatos × ${LANGS.length} idiomas`);
console.log(`  es: ${intlLocale('es')}   en: ${intlLocale('en')}`);
for (const name of ['dayMonthLong', 'weekdayLongDayMonth', 'monthYear']) {
  console.log(`  ${name.padEnd(20)} es "${formatDate(sample, name, 'es')}"   en "${formatDate(sample, name, 'en')}"`);
}
