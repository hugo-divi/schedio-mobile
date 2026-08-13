/**
 * What a study task actually tells the student to do.
 *
 * The plan used to emit labels ("Estudio de temas complejos de Historia") rather
 * than instructions. A label tells you which subject to feel guilty about; an
 * instruction tells you what to open and what to do with it.
 *
 * Two inputs decide the wording: the phase (which activity is due) and the exam
 * format (how that activity looks for this kind of subject). Format is inferred
 * from the subject name at zero cost to the student — no question, no catalogue
 * to maintain.
 *
 * ─── Why format and not "subject type" ───
 * Because it scales. ESO and Bachillerato have a small, stable subject list, but
 * a university catalogue is thousands of names across degrees and years and it
 * changes yearly. The exam format is the thing that actually determines how you
 * study, it is knowable in one tap by any student for any subject anywhere, and
 * it stays on the right side of Schedio's line: telling you *how* to study is
 * organising, knowing what's inside Termodinámica would be teaching.
 *
 * v1 infers format and never asks. `test` exists in the table but nothing infers
 * it — no subject name implies a multiple-choice exam. It's the slot for the
 * one-tap override, when that gets built.
 */

export const EXAM_FORMATS = ['problemas', 'desarrollo', 'test', 'idioma'];

/** Safest default: a written-development exam is the most common shape and the
 *  least wrong when applied to something it isn't. */
export const DEFAULT_FORMAT = 'desarrollo';

/**
 * Roots, not full names. University subjects are compound ("Fundamentos de
 * Programación", "Termodinámica Aplicada II") but they contain the same handful
 * of stems, so matching on stems covers a lot of ground with no catalogue.
 */
const FORMAT_ROOTS = {
  problemas: [
    'matem',
    'calcul',
    'algebra',
    'álgebra',
    'geometr',
    'estadist',
    'estadíst',
    'fisic',
    'físic',
    'quimic',
    'químic',
    'termo',
    'mecanic',
    'mecánic',
    'tecnolog',
    'dibujo',
    'program',
    'algoritm',
    'circuit',
    'electron',
    'electrón',
    'econom',
    'contab',
    'financ',
  ],
  idioma: [
    'ingl',
    'franc',
    'alem',
    'italian',
    'portugu',
    'latin',
    'latín',
    'griego',
    'valenc',
    'català',
    'catalan',
    'euskera',
    'gallego',
    'galego',
    'idioma',
  ],
  desarrollo: [
    'histor',
    'geograf',
    'filosof',
    'biolog',
    'geolog',
    'literat',
    'lengua',
    'psicolog',
    'derecho',
    'anatom',
    'arte',
    'sociolog',
    'religi',
    'etica',
    'ética',
  ],
};

const normalize = (value) =>
  String(value || '')
    .toLowerCase()
    .trim();

/**
 * Best guess at how a subject is examined, from its name alone.
 *
 * Checked in a fixed order so a compound name resolves predictably: "Física y
 * Química" hits `problemas` before anything else could claim it. Anything
 * unmatched falls to DEFAULT_FORMAT rather than guessing.
 */
export const inferExamFormat = (subjectName) => {
  const name = normalize(subjectName);
  if (!name) return DEFAULT_FORMAT;

  const ordered = ['problemas', 'idioma', 'desarrollo'];
  const hit = ordered.find((format) => FORMAT_ROOTS[format].some((root) => name.includes(root)));
  return hit || DEFAULT_FORMAT;
};

/**
 * Copy table: phase → format → variants.
 *
 * Several variants per cell so the same sentence doesn't appear five days
 * running. `{A}` is replaced with the subject name.
 *
 * The arc is deliberate. Early phases meet the student where they are — reading
 * and organising — and every format converges on active recall for the final
 * review, because that is the only study behaviour that reliably predicts the
 * grade. Nobody prepares for an exam by rereading on the eve of it.
 */
const COPY = {
  INTRODUCCIÓN: {
    problemas: [
      'Lee los ejemplos resueltos de {A} y quédate con el procedimiento',
      'Haz 3 ejercicios fáciles de {A} con los apuntes delante',
    ],
    desarrollo: [
      'Lee el tema de {A} entero, sin pararte a memorizar',
      'Lee {A} y subraya solo fechas, nombres y definiciones',
    ],
    test: [
      'Lee {A} por encima y quédate con los conceptos que se repiten',
      'Ojea {A} y marca lo que te suene a pregunta de test',
    ],
    idioma: [
      'Lee el texto de {A} sin buscar cada palabra: quédate con la idea',
      'Marca en {A} el vocabulario que se repite',
    ],
  },
  'ESTUDIO PROFUNDO': {
    problemas: [
      'Hoja de fórmulas de {A}: cuándo se usa cada una y con qué se confunde',
      'Repasa {A} y marca los pasos donde siempre te atascas',
      'Ejercicios de {A} de dificultad media, con los apuntes cerrados',
    ],
    desarrollo: [
      'Esquema de una cara de {A} conectando causas y consecuencias',
      'Vuelve a {A} y subraya solo lo que no sabrías explicar',
      'Coge tu esquema de {A} y explícalo en voz alta',
    ],
    test: [
      'Haz una lista de {A} con los conceptos que se parecen entre sí',
      'Repasa {A} y anota los detalles que distinguen unos conceptos de otros',
    ],
    idioma: [
      'Agrupa el vocabulario de {A} por temas, no por orden',
      'Escribe 5 frases usando lo de {A}, sin mirar',
    ],
  },
  PRÁCTICA: {
    problemas: [
      '10 ejercicios de {A} del tema que peor lleves, sin mirar apuntes',
      'Busca un examen antiguo de {A} y hazlo con tiempo',
      'Repite los ejercicios de {A} que fallaste, sin ver la solución',
    ],
    desarrollo: [
      'Coge una pregunta de examen de {A} y desarróllala entera',
      'Relaciona dos temas de {A}: qué tienen que ver entre sí',
      'Explícale un tema de {A} a alguien, en voz alta',
    ],
    test: [
      'Hazte un test de {A} y apunta solo las que falles',
      'Repasa las preguntas de {A} que fallaste y por qué',
    ],
    idioma: [
      'Haz un ejercicio de {A} cronometrado, como en el examen',
      'Escribe un texto corto de {A} usando el vocabulario nuevo',
    ],
  },
  'REPASO FINAL': {
    problemas: [
      'Escribe de memoria las fórmulas de {A}. Las que falles, esas repasas',
      'Un ejercicio de cada tipo de {A}, cronometrado',
    ],
    desarrollo: [
      'Tapa los apuntes de {A} y cuéntate el tema. Lo que no salga, márcalo',
      'Repasa solo tus esquemas de {A}, no los apuntes',
    ],
    test: [
      'Repasa solo las preguntas de {A} que fallaste antes',
      'Repaso rápido de {A}: los conceptos que confundes entre sí',
    ],
    idioma: ['Repasa solo el vocabulario de {A} que fallaste', 'Lee tus frases de {A} en voz alta'],
  },
  'MODO PÁNICO 🔥': {
    problemas: ['{A}: las fórmulas y un ejercicio tipo de cada una. Nada más'],
    desarrollo: ['{A}: solo los titulares. Fechas, nombres y la idea de cada tema'],
    test: ['{A}: los conceptos que más se repiten. No entres en detalle'],
    idioma: ['{A}: vocabulario y las estructuras que más caen'],
  },
};

/**
 * Stable variant picker.
 *
 * Keyed off the task id rather than the day index so a task keeps its wording
 * across regenerations — the plan is rebuilt daily and text that changed every
 * morning would read as a different task.
 */
const variantFor = (key, count) => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % count;
};

/**
 * @param {Object} input
 * @param {string} input.phase - phase name, must be a key of COPY
 * @param {string} input.format - one of EXAM_FORMATS
 * @param {string} input.subjectName - substituted for {A}
 * @param {string} input.seed - stable key for variant selection (the task id)
 * @returns {string}
 */
export const pickTaskText = ({ phase, format, subjectName, seed = '' }) => {
  const byFormat = COPY[phase];
  if (!byFormat) return `Repasa ${subjectName}`;

  const variants = byFormat[format] || byFormat[DEFAULT_FORMAT];
  const chosen = variants[variantFor(seed || phase, variants.length)];
  return chosen.replace(/\{A\}/g, subjectName);
};

/**
 * Hand-ins aren't studied in phases, they're worked on and finished — so they
 * ignore format entirely and name the thing itself.
 */
export const taskHandInText = (eventName, { isFinal, isOnly } = {}) => {
  if (isOnly) return `Hacer: ${eventName}`;
  return isFinal ? `Terminar: ${eventName}` : `Avanzar con: ${eventName}`;
};
