import { doc, getDoc, setDoc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';
import { tokens } from '../theme/tokens';
import { MAX_SUBJECTS_FREE } from './permissions';

/** The design system's closed subject palette, as a flat list for assignment. */
export const SUBJECT_COLORS = Object.values(tokens.colors.subjects);

export const EDUCATION_LEVELS = ['ESO', 'Bachillerato', 'Universidad', 'Otro'];

export const BACHILLERATO_BRANCHES = ['Ciencias', 'Ciencias Sociales', 'Humanidades', 'Técnico'];

export const MIN_SUBJECTS = 3;
// Nobody is Prime yet during onboarding, so the free cap always applies here.
export const MAX_SUBJECTS = MAX_SUBJECTS_FREE;
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
  'Bachillerato:Ciencias': [
    'Matemáticas II',
    'Física',
    'Química',
    'Biología',
    'Lengua Castellana',
    'Inglés',
    'Historia de España',
  ],
  'Bachillerato:Ciencias Sociales': [
    'Matemáticas CCSS',
    'Economía',
    'Historia del Mundo',
    'Geografía',
    'Lengua Castellana',
    'Inglés',
    'Historia de España',
  ],
  'Bachillerato:Humanidades': [
    'Latín',
    'Griego',
    'Historia del Arte',
    'Filosofía',
    'Lengua Castellana',
    'Inglés',
    'Historia de España',
  ],
  'Bachillerato:Técnico': [
    'Dibujo Técnico',
    'Tecnología Industrial',
    'Física',
    'Matemáticas II',
    'Lengua Castellana',
    'Inglés',
    'Historia de España',
  ],
};

export const templateFor = (educationLevel, branch) => {
  if (educationLevel === 'Bachillerato') return TEMPLATES[`Bachillerato:${branch}`] || [];
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

export const TASK_MANAGEMENT = [
  {
    value: 'memory',
    label: 'Solo memoria, voy sobre la marcha',
    desc: 'No apuntas plazos en ningún sitio.',
    // Feeds `organizationLevel`, which is what estimateDailyCapacity in
    // microplanService budgets the daily plan against. Dropping this field
    // would leave the planner stuck on its default of 75 min a day.
    organizationLevel: 1,
  },
  {
    value: 'scattered',
    label: 'Notas dispersas, sin sistema claro',
    desc: 'Apuntas cosas, pero cada una en un sitio distinto.',
    organizationLevel: 2,
  },
  {
    value: 'calendar',
    label: 'Calendario o app de notas',
    desc: 'Tienes un sitio fijo donde apuntar, aunque no lo revises siempre.',
    organizationLevel: 4,
  },
  {
    value: 'organized',
    label: 'Organizado: lista central, plazos claros',
    desc: 'Sabes en todo momento qué tienes pendiente y para cuándo.',
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

  const round = (n) => Math.round(Math.min(10, Math.min(ceiling, n)) * 10) / 10;
  const low = round(grade + gain * 0.7);
  const high = round(grade + gain * 1.3);

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
    return snap.exists() ? !snap.data()?.onboardingCompleted : false;
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
  const { educationLevel, branch, currentGrade, subjects = [], taskManagement } = data;

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
    branch: branch || 'General',
    grade: currentGrade,
    organizationLevel: organizationLevelFor(taskManagement),
    onboardingCompleted: true,
    isNewAccount: true,
    'onboardingData.completedAt': new Date().toISOString(),
    updatedAt: new Date(),
  });

  return created.map((ref, index) => ({ id: ref.id, ...subjects[index] }));
};
