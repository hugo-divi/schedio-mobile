/**
 * Las tres preguntas del mini-onboarding de Planes, y en qué se convierten.
 *
 * Cada una sustituye una constante que hasta ahora era igual para todo el
 * mundo:
 *
 *  1. El máximo en un día  → `HARD_DAILY_CAP_MINUTES`, que eran 300 fijos.
 *  2. Un día normal        → el presupuesto diario, que se deducía de una
 *                            pregunta de hábitos (`CAPACITY_BY_ORGANIZATION`)
 *                            convertida a minutos a ojo.
 *  3. Un examen mañana     → la curva de presión, que era fija.
 *
 * Vive aparte de microplanService.js y sin imports de React Native para poder
 * ejecutarse en Node: scripts/check-plan-profile.mjs comprueba el mapeo con
 * estas mismas funciones. Mismo patrón que services/tabBarLayout.js y
 * services/streakRules.js.
 *
 * Se guarda la RESPUESTA, no el número. Si mañana se recalibra el mapeo, todo
 * el mundo se mueve solo; guardando minutos habría que migrar a cada usuario.
 */

/**
 * Las tres preguntas, en orden. El texto vive aquí y no en el componente para
 * que el script pueda comprobar que hay tantas opciones como valores en la
 * tabla de conversión — que es el fallo silencioso de este diseño: añadir una
 * opción y olvidarse de darle número.
 */
export const PLAN_QUESTIONS = [
  {
    key: 'maxDay',
    question: '¿Cuánto podrías estudiar como máximo en un día?',
    hint: 'El día que te lo propones de verdad, sin clase de por medio.',
    options: [
      { label: '1 hora' },
      { label: '2 horas' },
      { label: '3 horas' },
      { label: 'Más de 4', note: 'maratón' },
    ],
  },
  {
    key: 'normalDay',
    question: 'Un día normal entre semana, ¿cuánto estudias?',
    hint: 'Sin exámenes cerca. Sé sincero: el plan se ajusta a esto.',
    options: [
      { label: 'Casi nada' },
      { label: 'Media hora' },
      { label: 'Una hora' },
      { label: 'Dos horas o más' },
    ],
  },
  {
    key: 'examPressure',
    question: 'Si mañana tuvieras un examen importante, ¿cuánto le dedicarías?',
    hint: 'Lo que harías de verdad, no lo que deberías.',
    options: [
      { label: '30 minutos' },
      { label: '2 horas' },
      { label: '3 horas' },
      { label: 'Todo lo que pudiera', note: 'dejo el resto' },
    ],
  },
];

/** Techo absoluto del día, en minutos, por respuesta a la pregunta 1. */
export const MAX_DAY_MINUTES = [60, 120, 180, 300];

/** Presupuesto diario declarado, en minutos, por respuesta a la pregunta 2. */
export const NORMAL_DAY_MINUTES = [15, 30, 60, 120];

/**
 * Pico de la curva de presión por respuesta a la pregunta 3: cuánto se
 * multiplica el presupuesto el día antes de un examen.
 *
 * "Todo lo que pudiera" no es una cantidad, es una actitud — quien la elige
 * dice que vacía la agenda, no que estudie tres horas — así que se lleva el
 * pico más alto y no un número de horas.
 *
 * El tercer valor es 2, que es exactamente lo que hacía la curva fija de
 * antes: quien conteste "3 horas" obtiene el comportamiento actual sin
 * cambios. Eso lo comprueba el script.
 */
export const PRESSURE_PEAK = [1.3, 1.7, 2, 2.6];

/**
 * Cómo decae la presión al alejarse el examen, como fracción del exceso sobre
 * 1. Sale de la curva que ya existía (2 / 1,6 / 1,25 en 1, 3 y 7 días): con
 * pico 2 estos tres factores la reproducen clavada.
 */
export const PRESSURE_SHAPE = [
  { within: 1, of: 1 },
  { within: 3, of: 0.6 },
  { within: 7, of: 0.25 },
];

const isAnswer = (value, options) =>
  Number.isInteger(value) && value >= 0 && value < options.length;

/**
 * Normaliza lo que venga guardado. Devuelve `null` en cada respuesta que falte
 * o no valga, y quien lo use decide con qué la sustituye — que no es lo mismo
 * que inventarse un valor por defecto aquí.
 */
export const sanitizePlanSurvey = (survey) => {
  const out = {};
  PLAN_QUESTIONS.forEach(({ key, options }) => {
    const raw = Number(survey?.[key]);
    out[key] = isAnswer(raw, options) ? raw : null;
  });
  return out;
};

/** Si están las tres respuestas, que es cuando el plan puede usarlas. */
export const isPlanSurveyComplete = (survey) =>
  Object.values(sanitizePlanSurvey(survey)).every((v) => v !== null);

/**
 * Techo del día. Sin respuesta se queda en el que había para todos, que es lo
 * correcto para las cuentas anteriores a esta pregunta.
 */
export const maxDayMinutesFor = (survey, fallback) => {
  const { maxDay } = sanitizePlanSurvey(survey);
  return maxDay === null ? fallback : MAX_DAY_MINUTES[maxDay];
};

/** Minutos declarados para un día normal, o `null` si no contestó. */
export const normalDayMinutesFor = (survey) => {
  const { normalDay } = sanitizePlanSurvey(survey);
  return normalDay === null ? null : NORMAL_DAY_MINUTES[normalDay];
};

/**
 * La curva de presión de este alumno, en el mismo formato que consumía
 * `pressureFactor`: una lista de escalones de más cercano a más lejano.
 */
export const pressureStepsFor = (survey, fallbackSteps) => {
  const { examPressure } = sanitizePlanSurvey(survey);
  if (examPressure === null) return fallbackSteps;
  const peak = PRESSURE_PEAK[examPressure];
  return PRESSURE_SHAPE.map(({ within, of }) => ({
    within,
    factor: Math.round((1 + (peak - 1) * of) * 100) / 100,
  }));
};
