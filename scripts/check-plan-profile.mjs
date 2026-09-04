/**
 * Checks for the plan mini-onboarding.  ·  npm run check:plan-profile
 *
 * Las tres preguntas sustituyen tres constantes que eran iguales para todo el
 * mundo. Lo que hay que proteger:
 *
 *  1. **Que nadie empeore por contestar.** El plan llevaba meses calibrado con
 *     una curva de presión fija; la respuesta central tiene que reproducirla
 *     clavada, o quien conteste "3 horas" se encontraría un plan distinto sin
 *     haber pedido ningún cambio.
 *  2. **Que quien no conteste siga como estaba.** Las cuentas anteriores a
 *     esta pregunta no tienen respuestas, y eso no puede romper nada.
 *  3. **Que cada opción tenga número.** El fallo silencioso de este diseño es
 *     añadir una opción a la lista y olvidarse de la tabla de conversión: la
 *     opción nueva daría `undefined` y el plan saldría vacío.
 *
 * Copia services/planProfile.js a un temporal como .mjs por la misma razón que
 * el resto de check-*.mjs: el proyecto usa ESM pero package.json no declara
 * "type": "module". El repositorio no se toca.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const services = join(dirname(fileURLToPath(import.meta.url)), '..', 'services');
const here = mkdtempSync(join(tmpdir(), 'schedio-plan-profile-'));
writeFileSync(join(here, 'planProfile.mjs'), readFileSync(join(services, 'planProfile.js'), 'utf8'));

const {
  PLAN_QUESTIONS,
  MAX_DAY_MINUTES,
  NORMAL_DAY_MINUTES,
  PRESSURE_PEAK,
  sanitizePlanSurvey,
  isPlanSurveyComplete,
  maxDayMinutesFor,
  normalDayMinutesFor,
  pressureStepsFor,
} = await import(`file://${join(here, 'planProfile.mjs')}`);

/** La curva fija que había antes de existir la pregunta. */
const LEGACY_STEPS = [
  { within: 1, factor: 2 },
  { within: 3, factor: 1.6 },
  { within: 7, factor: 1.25 },
];
const LEGACY_CAP = 300;

let failures = 0;
const ok = (label, condition, detail = '') => {
  if (!condition) failures++;
  console.log(`${condition ? 'ok  ' : 'FALLA'} ${label}${detail ? `: ${detail}` : ''}`);
};

console.log('\n── cada opción tiene su número ──');
ok('son tres preguntas', PLAN_QUESTIONS.length === 3, `${PLAN_QUESTIONS.length}`);
const TABLES = { maxDay: MAX_DAY_MINUTES, normalDay: NORMAL_DAY_MINUTES, examPressure: PRESSURE_PEAK };
PLAN_QUESTIONS.forEach(({ key, options }) => {
  const table = TABLES[key];
  ok(
    `"${key}" tiene tantos valores como opciones`,
    Array.isArray(table) && table.length === options.length,
    `${options.length} opciones, ${table?.length} valores`
  );
  ok(
    `"${key}": ningún valor es undefined`,
    (table || []).every((v) => Number.isFinite(v))
  );
  ok(
    `"${key}": los valores van de menos a más`,
    (table || []).every((v, i) => i === 0 || v > table[i - 1]),
    (table || []).join(' < ')
  );
  ok(`"${key}": toda opción tiene etiqueta`, options.every((o) => o.label));
});

console.log('\n── la respuesta central no cambia nada ──');
const CENTRAL = { maxDay: 3, normalDay: 2, examPressure: 2 };
const centralSteps = pressureStepsFor(CENTRAL, LEGACY_STEPS);
ok(
  'contestar "3 horas" reproduce la curva de presión de siempre',
  JSON.stringify(centralSteps) === JSON.stringify(LEGACY_STEPS),
  JSON.stringify(centralSteps)
);
ok(
  'contestar "Más de 4" deja el techo del día donde estaba',
  maxDayMinutesFor(CENTRAL, LEGACY_CAP) === LEGACY_CAP,
  `${maxDayMinutesFor(CENTRAL, LEGACY_CAP)} min`
);

console.log('\n── quien no ha contestado sigue igual ──');
[undefined, null, {}, { maxDay: 9 }, { examPressure: 'mucho' }, { normalDay: 1.5 }].forEach(
  (survey, i) => {
    ok(
      `entrada inválida #${i + 1}: el techo se queda en el de antes`,
      maxDayMinutesFor(survey, LEGACY_CAP) === LEGACY_CAP
    );
    ok(
      `entrada inválida #${i + 1}: la curva se queda en la de antes`,
      pressureStepsFor(survey, LEGACY_STEPS) === LEGACY_STEPS
    );
  }
);
ok('sin respuesta no hay minutos declarados', normalDayMinutesFor({}) === null);
ok('una encuesta vacía no está completa', !isPlanSurveyComplete({}));
ok('a falta de una respuesta, tampoco', !isPlanSurveyComplete({ maxDay: 1, normalDay: 2 }));
ok('con las tres, sí', isPlanSurveyComplete(CENTRAL));
ok(
  'un cero es una respuesta válida, no un hueco',
  isPlanSurveyComplete({ maxDay: 0, normalDay: 0, examPressure: 0 }),
  'la primera opción de cada pregunta'
);

console.log('\n── la presión crece con la respuesta ──');
const peakOf = (i) => pressureStepsFor({ maxDay: 0, normalDay: 0, examPressure: i }, LEGACY_STEPS)[0].factor;
const peaks = PRESSURE_PEAK.map((_, i) => peakOf(i));
ok(
  'quien vacía la agenda recibe más presión que quien da 30 minutos',
  peaks.every((p, i) => i === 0 || p > peaks[i - 1]),
  peaks.join(' < ')
);
ok('ningún pico baja de 1 (nunca resta presupuesto)', peaks.every((p) => p >= 1));

console.log('\n── la curva siempre decae al alejarse el examen ──');
PRESSURE_PEAK.forEach((_, i) => {
  const steps = pressureStepsFor({ maxDay: 0, normalDay: 0, examPressure: i }, LEGACY_STEPS);
  ok(
    `respuesta ${i + 1}: ${steps.map((s) => s.factor).join(' → ')}`,
    steps.every((s, j) => j === 0 || s.factor < steps[j - 1].factor) &&
      steps.every((s) => s.factor >= 1)
  );
});

console.log('\n── el reparto completo ──');
PLAN_QUESTIONS.forEach(({ key, options }) => {
  console.log(`  ${key}`);
  options.forEach((o, i) => {
    const value =
      key === 'maxDay'
        ? `${MAX_DAY_MINUTES[i]} min de techo`
        : key === 'normalDay'
          ? `${NORMAL_DAY_MINUTES[i]} min al día`
          : `presión ×${PRESSURE_PEAK[i]}`;
    console.log(`    ${o.label.padEnd(18)} → ${value}`);
  });
});

console.log('\n── sanitize deja las tres claves siempre ──');
const clean = sanitizePlanSurvey({ maxDay: 2 });
ok(
  'devuelve las tres claves aunque falten respuestas',
  Object.keys(clean).length === 3 && clean.maxDay === 2 && clean.normalDay === null,
  JSON.stringify(clean)
);

console.log(failures === 0 ? '\n✅ todo correcto' : `\n❌ ${failures} comprobación(es) fallan`);
process.exit(failures === 0 ? 0 : 1);
