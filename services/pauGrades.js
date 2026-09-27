/**
 * Las cuentas de la PAU: nota de acceso, nota de admisión y la pregunta
 * inversa —qué hace falta sacar para llegar a un objetivo.
 *
 * Sin una sola importación, igual que services/pau.js: lo ejecuta
 * `npm run check:pau` en Node. Una fórmula equivocada aquí no se ve en
 * pantalla, se ve en junio.
 *
 * La fuente es el Real Decreto 534/2024. Lo que la ley fija y no se toca:
 *
 *  · La nota de acceso es **60% de la media de Bachillerato + 40% de la PAU**
 *    (art. 15.1), con tres decimales.
 *  · La PAU tiene que dar **4 o más** para contar (art. 14.2) y el acceso
 *    **5 o más** para que haya acceso (art. 15.2).
 *  · La fase de acceso son cuatro ejercicios, o **cinco donde hay lengua
 *    cooficial** (art. 12).
 *
 * Lo que la ley **ya no** fija, y por eso aquí es un parámetro y no una
 * constante: las ponderaciones de la fase de admisión. Desde 2025 las publica
 * cada universidad (art. 22), así que 0,2 es el valor habitual, no el legal.
 */

/** Las cuatro materias de la fase de acceso, en el orden en que se leen. */
export const ACCESS_SLOTS = [
  { role: 'lengua', label: 'Lengua Castellana II' },
  { role: 'historia', label: 'Historia de España' },
  { role: 'extranjera', label: 'Inglés II' },
  { role: 'modalidad', label: 'Materia de modalidad' },
];

/**
 * La quinta materia, donde la hay. El nombre lo pone la comunidad que el
 * estudiante ya eligió en el onboarding, así que a quien no le corresponde ni
 * le aparece la casilla.
 *
 * En Navarra el euskera solo es cooficial en parte del territorio; por eso
 * esto nunca se marca solo, siempre lo decide el estudiante.
 */
export const COOFFICIAL_BY_REGION = {
  GA: 'Lengua Gallega II',
  CT: 'Lengua Catalana II',
  IB: 'Lengua Catalana II',
  VC: 'Valenciano II',
  PV: 'Lengua Vasca II',
  NC: 'Lengua Vasca II',
};

export const cooficialFor = (region) => COOFFICIAL_BY_REGION[region] || null;

/** Sin acentos y en minúsculas: el estudiante escribe sus materias a mano. */
const normalize = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

/**
 * Qué papel juega una materia en la PAU, a partir de su nombre.
 *
 * Por contenido y no por igualdad exacta, porque las plantillas sugieren
 * "Lengua Castellana II" pero mucha gente la escribe "Lengua" a secas. Vale
 * más acertar con un nombre escrito a mano que exigir el nombre legal.
 */
export const roleFor = (name) => {
  const n = normalize(name);
  if (!n) return null;
  if (n.includes('castellana') || n === 'lengua' || n.startsWith('lengua y')) return 'lengua';
  if (n.includes('gallega') || n.includes('galega')) return 'cooficial';
  if (
    n.includes('catalana') ||
    n.includes('valencian') ||
    n.includes('vasca') ||
    n.includes('euskera')
  )
    return 'cooficial';
  if (n.includes('historia de espana') || n.includes('historia de la filosofia')) return 'historia';
  if (
    n.includes('ingles') ||
    n.includes('frances') ||
    n.includes('aleman') ||
    n.includes('italiano') ||
    n.includes('portugues')
  )
    return 'extranjera';
  if (
    n.includes('matematicas') ||
    n.includes('latin') ||
    n.includes('dibujo artistico') ||
    n.includes('analisis musical') ||
    n.includes('artes escenicas') ||
    n.includes('ciencias generales')
  )
    return 'modalidad';
  return null;
};

/** Un objetivo de Perfil → Materias sirve como nota esperada; si no hay, no. */
const targetOf = (subject) => {
  const target = Number(subject?.targetGrade);
  return Number.isFinite(target) && target >= 1 && target <= 10 ? target : null;
};

/**
 * Las filas de la fase de acceso, ya rellenadas con lo que la app sabe.
 *
 * `source` es lo que la pantalla enseña junto a cada nota: decir de dónde sale
 * un número es lo que evita que el estudiante piense que nos lo hemos
 * inventado, y le dice dónde cambiarlo para siempre (en sus materias) en vez
 * de solo aquí.
 */
export const buildExamRows = ({
  subjects = [],
  region,
  includeCooficial = false,
  fallback = 6,
}) => {
  const used = new Set();
  const pick = (role) => {
    const found = subjects.find((s) => !used.has(s) && roleFor(s?.name) === role);
    if (found) used.add(found);
    return found;
  };

  const rows = ACCESS_SLOTS.map((slot) => {
    const subject = pick(slot.role);
    const target = targetOf(subject);
    return {
      role: slot.role,
      name: subject?.name || slot.label,
      mark: target ?? fallback,
      source: target ? 'objetivo' : subject ? 'media' : 'estimada',
    };
  });

  if (includeCooficial) {
    const subject = pick('cooficial');
    const target = targetOf(subject);
    rows.push({
      role: 'cooficial',
      name: subject?.name || cooficialFor(region) || 'Lengua cooficial',
      mark: target ?? fallback,
      source: target ? 'objetivo' : subject ? 'media' : 'estimada',
    });
  }

  return rows;
};

/** Las materias que quedan libres para subir nota en la fase de admisión. */
export const improvableSubjects = (subjects = [], rows = []) => {
  const taken = new Set(rows.map((r) => normalize(r.name)));
  return subjects.filter((s) => s?.name && !taken.has(normalize(s.name)));
};

const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

/** Aproximada a propósito: la media real es la de todas las materias de los dos
 *  cursos, que la app no tiene. Con el mismo número de asignaturas en 1º y 2º
 *  coincide; con distinto número se desvía unas centésimas. */
export const bachelorAverage = (first, second) => mean([first, second].filter(Number.isFinite));

/** Media aritmética de los ejercicios — art. 14.2. */
export const pauAverage = (rows = []) =>
  mean(rows.map((r) => Number(r.mark)).filter(Number.isFinite));

/** El mínimo de la materia para que pondere.
 *
 *  La normativa anterior exigía un 5 y las universidades lo siguen aplicando,
 *  pero el decreto de 2024 no lo dice con esas palabras. Queda aquí, con nombre
 *  propio, para poder cambiarlo de un sitio el día que se confirme. */
export const WEIGHTING_MIN_MARK = 5;

/** La ponderación habitual. No es la legal: desde 2025 la fija cada
 *  universidad, y por eso la pantalla deja cambiarla. */
export const DEFAULT_WEIGHT = 0.2;

/**
 * Todas las cuentas de una vez.
 *
 * `admission` no suma la mejora cuando no hay acceso: sin un 5 de acceso no
 * hay plaza que ponderar, y enseñar un 11 a quien no ha aprobado sería el peor
 * error posible de esta pantalla.
 */
export const computeMarks = ({ first, second, rows = [], extraMark, weight = DEFAULT_WEIGHT }) => {
  const bachAvg = bachelorAverage(Number(first), Number(second));
  const pauAvg = pauAverage(rows);
  const access = 0.6 * bachAvg + 0.4 * pauAvg;

  const meetsPau = pauAvg >= 4;
  const meetsAccess = meetsPau && access >= 5;

  const mark = Number(extraMark);
  const counts = Number.isFinite(mark) && mark >= WEIGHTING_MIN_MARK;
  const bonus = counts ? weight * mark : 0;

  return {
    bachAvg,
    pauAvg,
    access,
    admission: meetsAccess ? access + bonus : access,
    bonus: meetsAccess ? bonus : 0,
    meetsPau,
    meetsAccess,
    extraCounts: counts,
  };
};

/**
 * La pregunta al revés: con lo que ya tiene, qué media necesita en la PAU para
 * llegar a la nota que le pide su grado.
 *
 * Es la pregunta que se hace de verdad un estudiante de 2º, y la que ninguna
 * tabla de notas de corte responde. Puede salir por encima de 10 — y entonces
 * la respuesta honesta es que no llega solo con la PAU.
 */
export const neededPauAverage = ({ target, first, second, extraMark, weight = DEFAULT_WEIGHT }) => {
  const bachAvg = bachelorAverage(Number(first), Number(second));
  const mark = Number(extraMark);
  const bonus = Number.isFinite(mark) && mark >= WEIGHTING_MIN_MARK ? weight * mark : 0;
  return (Number(target) - 0.6 * bachAvg - bonus) / 0.4;
};
