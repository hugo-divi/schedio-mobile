import { Platform } from 'react-native';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';
import {
  MAX_SUBJECTS_FREE,
  MAX_SUBJECTS_WEB,
  SUBJECT_COLORS_FREE,
  SUBJECT_COLORS_WEB,
} from './permissions';

// Subjects are picked on step 2, and the Prime offer does not appear until
// after step 5, so nobody choosing subjects can be Prime yet: this always
// hands out the free eight (ten on web, which has no Prime to offer at all —
// see permissions.js), never the Prime-only extras. The one seam is a
// student who buys Prime at the paywall and then walks all the way back to
// step 2 — they keep the free cap here and get the rest from their profile,
// which is a fair trade for not making this screen watch the entitlement.
export const SUBJECT_COLORS = Platform.OS === 'web' ? SUBJECT_COLORS_WEB : SUBJECT_COLORS_FREE;

export const EDUCATION_LEVELS = ['ESO', 'Bachillerato', 'Universidad', 'Otro'];

/**
 * The four modalidades of Bachillerato as the law defines them (Real Decreto
 * 243/2022, art. 8). The stored value is the label itself, as before.
 *
 * The list this replaces — Ciencias, Ciencias Sociales, Humanidades, Técnico —
 * was the pre-LOMLOE split and matched nothing a student is actually enrolled
 * in: "Técnico" no longer exists, Humanidades and Ciencias Sociales are one
 * modalidad (a student picks Latín II or Matemáticas Aplicadas II inside it),
 * and Artes and General were missing. It matters beyond the label: the subject
 * a student sits in the PAU as their modalidad exam depends on it.
 *
 * Artes has two vías by law (Plásticas and Música y Artes Escénicas). They are
 * one option here on purpose: the vía decides which obligatory subject they
 * take, and the subject list below already offers both — whichever they add is
 * the one they study. A fifth pill would ask them for something their subject
 * list already says.
 */
export const BACHILLERATO_BRANCHES = [
  'Ciencias y Tecnología',
  'Humanidades y Ciencias Sociales',
  'Artes',
  'General',
];

/** 1º or 2º. Only asked for Bachillerato, and required there: everything built
 *  around the PAU is for second-year students, and a first-year one being told
 *  their exam is in 260 days is noise, not motivation. */
export const BACHILLERATO_YEARS = [1, 2];

/**
 * Old modalidad values → the legal ones. Applied on read rather than through a
 * migration: nothing but the onboarding resume reads `branch` today, so there
 * is no stored data that has to agree with itself, only values to interpret.
 *
 * One value cannot be recovered. Before September 2026 `completeOnboarding`
 * wrote 'General' for anyone who skipped the question — every non-Bachillerato
 * account, and Bachillerato students who left it blank. 'General' is now a real
 * modalidad, so on those older documents it means "not answered" rather than
 * the modalidad. Anything that ever reads `branch` for a decision should treat
 * an old 'General' with that suspicion.
 */
const LEGACY_BRANCHES = {
  Ciencias: 'Ciencias y Tecnología',
  Técnico: 'Ciencias y Tecnología',
  'Ciencias Sociales': 'Humanidades y Ciencias Sociales',
  Humanidades: 'Humanidades y Ciencias Sociales',
};

export const normalizeBranch = (branch) => LEGACY_BRANCHES[branch] || branch || null;

/**
 * Autonomous communities, keyed by their ISO 3166-2:ES code.
 *
 * The code is what gets stored, not the label: it survives a rename or a
 * wording change, and it is the natural parent key for the school and
 * university lists planned later (class groups hanging off an institution,
 * institutions hanging off a region). Storing "Comunidad de Madrid" as a
 * string would mean migrating every account the day that list arrives.
 *
 * Also the field EBAU support needs — syllabus is set per community — which
 * is why it is worth asking now rather than chasing existing accounts later.
 */
export const REGIONS = [
  { code: 'AN', label: 'Andalucía' },
  { code: 'AR', label: 'Aragón' },
  { code: 'AS', label: 'Asturias' },
  { code: 'IB', label: 'Islas Baleares' },
  { code: 'CN', label: 'Canarias' },
  { code: 'CB', label: 'Cantabria' },
  { code: 'CL', label: 'Castilla y León' },
  { code: 'CM', label: 'Castilla-La Mancha' },
  { code: 'CT', label: 'Cataluña' },
  { code: 'VC', label: 'Comunidad Valenciana' },
  { code: 'EX', label: 'Extremadura' },
  { code: 'GA', label: 'Galicia' },
  { code: 'MD', label: 'Madrid' },
  { code: 'MC', label: 'Murcia' },
  { code: 'NC', label: 'Navarra' },
  { code: 'PV', label: 'País Vasco' },
  { code: 'RI', label: 'La Rioja' },
  { code: 'CE', label: 'Ceuta' },
  { code: 'ML', label: 'Melilla' },
];

export const regionLabelFor = (code) => REGIONS.find((r) => r.code === code)?.label ?? null;

/**
 * Self-reported attribution. Asked once, optional, and never gates anything.
 *
 * It used to sit below the fold of step 5, on the grounds that it was the
 * only step whose `canAdvance` returns an unconditional `true`. That saved a
 * screen and cost the thing the screen was for: step 5 is where the student
 * reads their own projected grade, and a question about marketing channels
 * sharing that screen competes with the one moment in the flow that is purely
 * about them. It now has step 8 to itself, after everything is decided and
 * before the dashboard — where nothing it competes with is left, and where it
 * still gates nothing (`canAdvance` returns `true` for step 8 too).
 *
 * The flow already loses people partway (see `abandonedOnboarding` in
 * functions/index.js), so this stays last: anyone who drops before it has
 * dropped after giving us everything that actually matters.
 *
 * Stored as the stable `value`, never the label, so rewording an option later
 * doesn't split the counts in two.
 */
export const ACQUISITION_SOURCES = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'friend', label: 'Un amigo o compañero' },
  { value: 'search', label: 'Buscando en internet' },
  { value: 'other', label: 'Otro sitio' },
];

export const MIN_SUBJECTS = 3;
// Free cap (web's slightly higher one included), for the reason spelled out
// above SUBJECT_COLORS.
export const MAX_SUBJECTS = Platform.OS === 'web' ? MAX_SUBJECTS_WEB : MAX_SUBJECTS_FREE;
export const MIN_SUBJECT_NAME = 2;

/**
 * Suggestions, never preselections — the student taps the ones they actually
 * take. Universidad and Otro get none: their subject lists are personal enough
 * that a wrong template is worse than an empty box.
 */
const TEMPLATES = {
  ESO: [
    'Matemáticas',
    'Lengua Castellana',
    'Inglés',
    'Biología y Geología',
    'Geografía e Historia',
    'Física y Química',
    'Educación Física',
    'Tecnología',
  ],
};

/**
 * Bachillerato suggestions, by year and modalidad, following the subjects Real
 * Decreto 243/2022 sets for each (arts. 9-13). Names are the ones students
 * actually use rather than the full legal ones — "Matemáticas CCSS II" for
 * "Matemáticas Aplicadas a las Ciencias Sociales II" — because they end up on
 * chips, plan rows and notifications, where the legal name would be truncated
 * everywhere it appears.
 *
 * The modalidad's own subjects come first and the common ones last: the common
 * four are the same for everyone and the student scans past them, while the
 * modalidad list is the part that makes the suggestion feel like it knows them.
 * Communities can add optional subjects of their own; anything missing here is
 * one line in the text box away.
 */
const BACH_COMMON = {
  1: ['Lengua Castellana I', 'Inglés I', 'Filosofía', 'Educación Física'],
  // All four are also PAU subjects (the student sits one of the two Historias).
  2: ['Lengua Castellana II', 'Inglés II', 'Historia de España', 'Historia de la Filosofía'],
};

const BACH_MODALITY = {
  'Ciencias y Tecnología': {
    1: [
      'Matemáticas I',
      'Física y Química',
      'Biología y Geología',
      'Dibujo Técnico I',
      'Tecnología e Ingeniería I',
    ],
    2: [
      'Matemáticas II',
      'Física',
      'Química',
      'Biología',
      'Dibujo Técnico II',
      'Tecnología e Ingeniería II',
      'Geología',
    ],
  },
  'Humanidades y Ciencias Sociales': {
    1: [
      'Latín I',
      'Matemáticas CCSS I',
      'Economía',
      'Griego I',
      'Historia del Mundo Contemporáneo',
      'Literatura Universal',
    ],
    2: [
      'Latín II',
      'Matemáticas CCSS II',
      'Empresa y Modelos de Negocio',
      'Geografía',
      'Griego II',
      'Historia del Arte',
    ],
  },
  // Both vías together — see BACHILLERATO_BRANCHES.
  Artes: {
    1: [
      'Dibujo Artístico I',
      'Cultura Audiovisual',
      'Proyectos Artísticos',
      'Volumen',
      'Análisis Musical I',
      'Artes Escénicas I',
    ],
    2: [
      'Dibujo Artístico II',
      'Diseño',
      'Fundamentos Artísticos',
      'Técnicas Gráfico-Plásticas',
      'Análisis Musical II',
      'Artes Escénicas II',
      'Historia de la Música y la Danza',
    ],
  },
  General: {
    1: ['Matemáticas Generales', 'Economía y Emprendimiento'],
    2: ['Ciencias Generales', 'Movimientos Culturales y Artísticos'],
  },
};

/**
 * Suggestions for the subject step. For Bachillerato they need the year: 1º and
 * 2º share almost no subject names, and a second-year student offered
 * "Matemáticas I" learns the app does not know what course they are in. With a
 * year but no modalidad they still get the four common subjects.
 */
export const templateFor = (educationLevel, branch, courseYear) => {
  if (educationLevel === 'Bachillerato') {
    if (!courseYear) return [];
    const modality = BACH_MODALITY[normalizeBranch(branch)]?.[courseYear] || [];
    return [...modality, ...BACH_COMMON[courseYear]];
  }
  return TEMPLATES[educationLevel] || [];
};

export const REVIEW_FREQUENCY = [
  {
    value: 'never',
    label: 'Nunca / Raramente',
    desc: 'Estudias sobre todo en los días previos al examen.',
  },
  {
    value: 'sometimes',
    label: 'A veces, según la asignatura',
    desc: 'Con algunas repasas y con otras lo dejas para el final.',
  },
  {
    value: 'regularly',
    label: 'Regularmente',
    desc: 'Después de clase o cuando se acerca una evaluación.',
  },
  { value: 'always', label: 'Siempre', desc: 'Repasas de forma constante, haya examen o no.' },
];

/**
 * Labels are written from the student's side — the obstacle they'd recognise in
 * themselves — rather than as categories of system. The `value` and
 * `organizationLevel` behind each one are unchanged, so nothing downstream
 * moves: this is wording, not a remodelled question.
 */
export const TASK_MANAGEMENT = [
  {
    value: 'memory',
    label: 'Se me olvida todo, no apunto nada',
    desc: 'Tiras de memoria y de lo que te recuerden en clase.',
    // Feeds `organizationLevel`, which is what estimateDailyCapacity in
    // microplanService budgets the daily plan against. Dropping this field
    // would leave the planner stuck on its default of 75 min a day.
    organizationLevel: 1,
  },
  {
    value: 'scattered',
    label: 'Apunto cosas, pero pierdo el hilo',
    desc: 'Cada cosa acaba en un sitio distinto: agenda, móvil, folios.',
    organizationLevel: 2,
  },
  {
    value: 'calendar',
    label: 'Tengo un sitio fijo, pero no lo miro tanto como debería',
    desc: 'Un calendario o una app de notas donde va todo.',
    organizationLevel: 4,
  },
  {
    value: 'organized',
    label: 'Tengo todo controlado, sé qué me queda pendiente',
    desc: 'Lista central y plazos claros, siempre al día.',
    organizationLevel: 5,
  },
];

export const organizationLevelFor = (taskManagement) =>
  TASK_MANAGEMENT.find((o) => o.value === taskManagement)?.organizationLevel ?? 3;

/**
 * A range and a mechanism, never a single number and never a promise.
 *
 * The headroom left by weak habits is what Schedio can actually reclaim, so the
 * uplift comes from the habits and is then squeezed by how close the student
 * already is to a 10 — a 9,4 has almost nowhere to go, however badly organised.
 *
 * NOT CALIBRATED. These weights are a starting point to be checked against real
 * before/after data once there is any; they are deliberately conservative.
 */
export const estimatePotential = ({
  currentGrade,
  educationLevel,
  reviewFrequency,
  taskManagement,
}) => {
  const grade = Number.isFinite(currentGrade) ? currentGrade : 5;

  const fromTasks = { memory: 1.2, scattered: 0.9, calendar: 0.5, organized: 0.3 };
  const fromReview = { never: 0.5, sometimes: 0.35, regularly: 0.15, always: 0 };

  const rawUplift = (fromTasks[taskManagement] ?? 0.6) + (fromReview[reviewFrequency] ?? 0.25);

  // Scaled by how much room is left between here and a 10, with a small floor
  // so a well-organised student isn't told the app does nothing for them.
  //
  // K was raised from 1.3 to 1.9 after the first pass read as too timid: a
  // student at 6 was shown roughly +0,5, which undersold what better habits
  // plausibly buy. Headroom is what keeps that increase honest — the same
  // habits push a 6 far more than a 9, because there's more slack to recover.
  const headroom = Math.max(0, (10 - grade) / 10);
  const gain = Math.max(0.15, rawUplift * headroom * 1.9);

  // Never claim more than 60% of the gap that is actually left. Without this,
  // bad habits on a 9,5 came out as a promised 10.
  const ceiling = grade + (10 - grade) * 0.6;

  // Nudged up further on top of the already-conservative baseline above, per
  // explicit product decision: the range read as too modest to sell the
  // potential, so both ends are pushed higher before the same clamps apply
  // (still capped at the ceiling and at 10, so this never produces an
  // impossible number, only a less timid one).
  //
  // Tercera pasada: de 0,45 a 0,75. Medido sobre los 192 casos de la banda
  // realista (notas de 4 a 9,4 × las cuatro respuestas de organización × las
  // cuatro de repaso), eso sube el alto del rango **0,22 de media, 0,30 como
  // mucho** — dentro de las dos o tres décimas que se pedían, y sin que ningún
  // caso se pase. Con 0,8 algunos llegaban a 0,40, ya fuera de rango.
  //
  // Los topes siguen mandando y son los que hacen que esto sea honesto: 41 de
  // los 192 casos no se mueven ni una décima porque ya están contra el techo.
  // Un 9,4 sigue dando 9,6–9,8 exactamente igual que antes, porque el 60% del
  // hueco que le queda es todo lo que esto puede prometer jamás.
  const BOOST = 0.75;

  const round = (n) => Math.round(Math.min(10, Math.min(ceiling, n)) * 10) / 10;
  let low = round(grade + gain * 0.7 + BOOST);
  let high = round(grade + gain * 1.3 + BOOST);

  // For students already close to a 10, the ceiling clamp above can round
  // both ends to the same number — "9,8–9,8" reads as a bug, not a range.
  // Pull the low end back down to make room, but never below the grade
  // they're starting from.
  if (high <= low) {
    low = Math.max(round(grade), round(high - 0.2));
  }

  const reasons = [];
  if (taskManagement === 'memory' || taskManagement === 'scattered') {
    reasons.push('Llevar los plazos en un solo sitio evita la mayoría de sustos de última hora.');
  } else {
    reasons.push('Ya tienes el hábito de organizarte; Schedio te quita el trabajo de mantenerlo.');
  }
  if (reviewFrequency === 'never' || reviewFrequency === 'sometimes') {
    reasons.push('Repartir el repaso en sesiones cortas rinde más que concentrarlo la víspera.');
  } else {
    reasons.push('Repasas de forma constante: el plan te dirá dónde hace más falta ese repaso.');
  }
  if (grade < 6) {
    reasons.push('Desde donde partes, ordenar el tiempo es lo que más margen de mejora deja.');
  } else if (grade >= 8) {
    reasons.push('A tu nivel las ganancias son pequeñas pero sostenidas: constancia, no milagros.');
  } else {
    reasons.push('Tu nivel permite crecer sobre todo mejorando la gestión del tiempo.');
  }

  return { range: [low, high], reasons };
};

// ── Persistence ─────────────────────────────────────────────────────────────

/**
 * Where a signed-in account should land. Nothing used to route back into the
 * onboarding except registration, so an account that closed the app halfway
 * through went to the dashboard and never saw the flow again.
 */
export const needsOnboarding = async (uid) => {
  if (!uid) return false;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    // No document means no profile at all, which is as un-onboarded as an
    // account gets. This returned `false` — sending exactly the accounts that
    // most need the flow straight past it.
    return snap.exists() ? !snap.data()?.onboardingCompleted : true;
  } catch (error) {
    // A read failure shouldn't trap anyone in the onboarding.
    console.warn('Could not check onboarding state', error);
    return false;
  }
};

/** Whatever the student has entered so far, plus where they stopped. */
export const loadOnboarding = async (uid) => {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const data = snap.data() || {};
    return {
      completed: !!data.onboardingCompleted,
      ...(data.onboardingData || {}),
    };
  } catch (error) {
    console.warn('Could not load onboarding progress', error);
    return null;
  }
};

/**
 * Saved on every step rather than at the end: the whole point of storing the
 * step is that closing the app mid-flow doesn't cost the student their answers.
 */
export const saveOnboardingStep = async (uid, patch) => {
  if (!uid) return;
  try {
    await setDoc(
      doc(db, 'users', uid),
      {
        onboardingData: { ...patch, updatedAt: new Date().toISOString() },
      },
      { merge: true }
    );
  } catch (error) {
    console.warn('Could not save onboarding progress', error);
  }
};

/**
 * Closes the flow: promotes the answers to the fields the rest of the app
 * reads, and creates the subjects for real. Until this runs, the subjects only
 * exist inside `onboardingData` and no other screen can see them.
 */
export const completeOnboarding = async (uid, data) => {
  const {
    educationLevel,
    branch,
    courseYear,
    takesPau,
    currentGrade,
    region,
    subjects = [],
    taskManagement,
    reviewFrequency,
    estimatedRange,
    estimationReason,
    acquisitionSource,
  } = data;

  const created = await Promise.all(
    subjects.map((subject) =>
      addDoc(collection(db, 'subjects'), {
        userId: uid,
        name: subject.name,
        color: subject.color,
        // Neutral until the student says otherwise in their profile; the
        // priority model reads this on a 1-10 scale.
        difficulty: 5,
        createdAt: new Date(),
      })
    )
  );

  await updateDoc(doc(db, 'users', uid), {
    course: educationLevel,
    // Null outside Bachillerato, and null when skipped. This used to fall back
    // to 'General', which was harmless while no modalidad had that name and is
    // wrong now that one does — see LEGACY_BRANCHES.
    branch: educationLevel === 'Bachillerato' ? normalizeBranch(branch) : null,
    // 1 or 2. What decides whether this student sees anything about the PAU.
    courseYear: educationLevel === 'Bachillerato' ? courseYear || null : null,
    // The switch for everything PAU-shaped: countdown, grade calculator, the
    // exam-period plan. Only ever true for 2º de Bachillerato; `!== false` so a
    // 2º student who never saw the box (a flow resumed from before it existed)
    // lands on the same default as one who left it ticked.
    takesPau: educationLevel === 'Bachillerato' && courseYear === 2 ? takesPau !== false : false,
    grade: currentGrade,
    // Promoted to a top-level field so it can be queried directly — this is
    // the one that answers "where are our students" without unpacking
    // `onboardingData`, and the one a future institution list joins against.
    region: region || null,
    organizationLevel: organizationLevelFor(taskManagement),
    // Promoted out of `onboardingData` because the planner reads it: it sets how
    // much of the work the plan leaves for the end (`gammaFor` in
    // microplanService). It was already being asked and only feeding the
    // potential-grade estimate, so this is a free signal, not a new question.
    reviewFrequency: reviewFrequency || null,
    // Promoted so Profile can show the day-one estimate back to the student
    // instead of it sitting unread inside `onboardingData` forever.
    estimatedRange: estimatedRange || null,
    estimationReason: estimationReason || null,
    // Marketing only, and optional — null just means they skipped it.
    acquisitionSource: acquisitionSource || null,
    onboardingCompleted: true,
    isNewAccount: true,
    'onboardingData.completedAt': new Date().toISOString(),
    updatedAt: new Date(),
  });

  return created.map((ref, index) => ({ id: ref.id, ...subjects[index] }));
};
