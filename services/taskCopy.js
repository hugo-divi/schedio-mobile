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
 *
 * ─── What these sentences are, and are not ───
 * They are templates picked by two variables, not a judgement about this
 * student's material. The planner distributes time and assigns a phase; this
 * file gives that phase a sentence. Nothing here knows what is on the exam.
 *
 * So every line must be answerable by a student who has told us nothing beyond
 * the subject name and a date. "10 ejercicios seguidos, sin mirar apuntes" is
 * fine. "10 ejercicios del tema que peor lleves" was not, and used to be here:
 * it reads as guidance while quietly handing the decision back, and it promises
 * a kind of knowledge the app does not have. References to earlier work
 * ("los que fallaste", "tus esquemas") are allowed only because a previous phase
 * in the same arc asked for exactly that.
 */

export const EXAM_FORMATS = ['problemas', 'desarrollo', 'test', 'idioma'];

/**
 * `null` means "we don't know how this subject is examined", and that is a real
 * answer, not a gap to paper over.
 *
 * This used to default to 'desarrollo'. A guess is worse than silence here:
 * "Proyecto Integrado" and "Métodos Cuantitativos" match no root, and telling
 * their student to "subrayar fechas, nombres y definiciones" is nonsense that
 * costs trust. Unmatched subjects get the phase's neutral wording, which is
 * true for any subject anywhere.
 */
export const UNKNOWN_FORMAT = null;

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
  if (!name) return UNKNOWN_FORMAT;

  const ordered = ['problemas', 'idioma', 'desarrollo'];
  const hit = ordered.find((format) => FORMAT_ROOTS[format].some((root) => name.includes(root)));
  return hit || UNKNOWN_FORMAT;
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
/**
 * The base layer: one wording per phase that holds for any subject on earth.
 *
 * The phase is the part the planner genuinely knows — it comes from where the
 * day sits in the exam's window, not from guessing what the subject is. So the
 * phase carries the sentence, and the format only refines it when a root matched
 * with confidence. No match, no invention.
 */
const NEUTRAL = {
  INTRODUCCIÓN: [
    'Primer contacto con {A}: léelo entero sin intentar memorizar',
    'Ojea {A} y quédate con de qué va cada parte',
  ],
  'ESTUDIO PROFUNDO': [
    'Trabaja {A} a fondo: resume o esquematiza, con los apuntes cerrados',
    'Vuelve sobre {A} y marca lo que no sabrías explicar',
  ],
  PRÁCTICA: [
    'Ponte a prueba con {A} como en el examen: sin apuntes y con tiempo',
    'Practica {A} con lo que más te cueste, sin mirar la solución',
  ],
  'REPASO FINAL': [
    'Tapa {A} y recupera lo que puedas. Lo que no salga, eso repasas',
    'Repaso rápido de {A}: solo lo que fallaste antes',
  ],
  'MODO PÁNICO 🔥': [
    '{A}: solo lo esencial, lo que más cae. No entres en detalle',
    '{A}: repasa lo que peor lleves y déjalo ahí',
    '{A}: una vuelta rápida a todo, sin pararte',
  ],
};

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
      '10 ejercicios seguidos de {A}, sin mirar apuntes',
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
  // Panic days now hold two or three sessions of the same exam, so a single
  // variant per format meant three identical rows stacked on one day.
  'MODO PÁNICO 🔥': {
    problemas: [
      '{A}: las fórmulas y un ejercicio tipo de cada una. Nada más',
      '{A}: repite los ejercicios que peor te salieron',
      '{A}: un examen antiguo entero, con el reloj',
    ],
    desarrollo: [
      '{A}: solo los titulares. Fechas, nombres y la idea de cada tema',
      '{A}: cuéntate cada tema en dos frases, sin mirar',
      '{A}: repasa lo que hayas marcado y nada más',
    ],
    test: [
      '{A}: los conceptos que más se repiten. No entres en detalle',
      '{A}: hazte un test rápido y quédate con los fallos',
      '{A}: repasa solo lo que confundes entre sí',
    ],
    idioma: [
      '{A}: vocabulario y las estructuras que más caen',
      '{A}: repasa las palabras que sigues fallando',
      '{A}: lee en voz alta lo que tengas preparado',
    ],
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
 * @param {number} [input.index] - which session of this exam on this day (0-based).
 *   Offsets the variant so two sessions of the same exam on the same day never
 *   land on the same sentence: the hash alone collides often, and a panic day
 *   holding three identical rows reads as a bug.
 * @returns {string}
 */
export const pickTaskText = ({ phase, format, subjectName, seed = '', index = 0 }) => {
  // Format-specific wording only when a root actually matched; otherwise the
  // phase's neutral line, which never claims to know what kind of subject it is.
  const variants = (format && COPY[phase]?.[format]) || NEUTRAL[phase];
  if (!variants) return `Repasa ${subjectName}`;

  const pick = (variantFor(seed || phase, variants.length) + index) % variants.length;
  return variants[pick].replace(/\{A\}/g, subjectName);
};

/**
 * Hand-ins aren't studied in phases, they're worked on and finished — so they
 * ignore format entirely and name the thing itself.
 */
export const taskHandInText = (eventName, { isFinal, isOnly } = {}) => {
  if (isOnly) return `Hacer: ${eventName}`;
  return isFinal ? `Terminar: ${eventName}` : `Avanzar con: ${eventName}`;
};
