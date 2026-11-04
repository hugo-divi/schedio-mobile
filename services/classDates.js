/**
 * Fechas de un aula ↔ tu calendario.
 *
 * Una fecha que pone la clase solo sirve de verdad cuando entra en tu
 * calendario: a partir de ahí el plan diario la reparte, la notificación del
 * día la nombra y las alertas de 3 días y 1 día salen solas. Este módulo
 * decide, para cada fecha del aula, en qué punto está respecto a tus
 * exámenes y qué escribir en ellos para cada acción. No toca Firestore ni
 * React: lo usan la tarjeta (components/ClassDateCard.js), services/exams.js
 * y scripts/check-class-dates.mjs.
 *
 * ── El contrato con el código del aula ─────────────────────────────────
 * Las fechas llegan con esta forma (normalizeClassDate acepta también los
 * nombres en español más obvios, por si el aula ya los usa):
 *
 *   { id, aulaId, aulaName?, subjectName, title?, includes?, type?,
 *     date, author?: { name, initial? } | string, confirmations?: number,
 *     createdAt?, updatedAt?, previousDate? }
 *
 * Y el examen propio que nace de una fecha del aula lleva:
 *
 *   classLink: { aulaId, dateId, syncedDate, linkedAt, pendingDate?,
 *                pendingBy?, pendingNotified? }
 *
 * `syncedDate` es la fecha del aula la última vez que tú la aceptaste. Así se
 * distingue "la clase la ha movido" (aviso) de "tú moviste la tuya" (se
 * respeta, sin dar la lata).
 *
 * Sin imports a propósito: el check lo copia a un .mjs temporal.
 */

const DAY = 24 * 60 * 60 * 1000;

/** Hasta cuántos días de distancia una fecha tuya "puede ser la misma". */
export const SAME_EXAM_WINDOW_DAYS = 3;

/** Desde cuántas confirmaciones se dice "Confirmada por la clase". */
export const CONFIRMED_AT = 3;

// ── Fechas ───────────────────────────────────────────────────────────────

export const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Días de calendario de `from` a `to` (no horas / 24: el cambio de hora no lo rompe). */
export const daysBetween = (from, to) => {
  const a = toDate(from);
  const b = toDate(to);
  if (!a || !b) return null;
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY);
};

export const sameDay = (a, b) => daysBetween(a, b) === 0;

const iso = (value) => toDate(value)?.toISOString() ?? null;

// ── Normalizar lo que venga del aula ─────────────────────────────────────

const pick = (raw, ...keys) => {
  for (const key of keys) {
    if (raw?.[key] !== undefined && raw?.[key] !== null && raw?.[key] !== '') return raw[key];
  }
  return undefined;
};

const authorOf = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    const [name, surname] = value.trim().split(/\s+/);
    return name ? { name, initial: surname ? surname[0].toUpperCase() : '' } : null;
  }
  const name = value.name || value.nombre || value.firstName;
  if (!name) return null;
  const initial =
    value.initial || value.inicial || (value.surname || value.apellido || '')[0] || '';
  return { name, initial: initial.toUpperCase() };
};

/**
 * Lo que llega del aula, con los nombres de arriba. Devuelve null si no hay
 * con qué trabajar (sin id o sin una fecha legible), para que nada aguas
 * abajo tenga que comprobarlo.
 */
export const normalizeClassDate = (raw) => {
  const date = toDate(pick(raw, 'date', 'fecha', 'dia'));
  const id = pick(raw, 'id', 'dateId');
  if (!id || !date) return null;
  const confirmations = Number(pick(raw, 'confirmations', 'votes', 'votos', 'confirmaciones'));
  const kind = pick(raw, 'type', 'tipo');
  return {
    id: String(id),
    aulaId: String(pick(raw, 'aulaId', 'classId') ?? ''),
    aulaName: pick(raw, 'aulaName', 'aulaNombre') ?? '',
    subjectName: String(pick(raw, 'subjectName', 'asignatura', 'subject') ?? '').trim(),
    title: String(pick(raw, 'title', 'titulo', 'name', 'nombre') ?? '').trim(),
    includes: String(pick(raw, 'includes', 'queEntra', 'temario', 'contenido') ?? '').trim(),
    type: kind === 'task' || kind === 'tarea' || kind === 'entrega' ? 'task' : 'exam',
    date,
    author: authorOf(pick(raw, 'author', 'autor', 'createdBy')),
    confirmations: Number.isFinite(confirmations) && confirmations > 0 ? confirmations : 0,
    createdAt: toDate(pick(raw, 'createdAt', 'creadaEn')),
    updatedAt: toDate(pick(raw, 'updatedAt', 'actualizadaEn')),
    updatedBy: authorOf(pick(raw, 'updatedBy', 'modificadaPor')),
    previousDate: toDate(pick(raw, 'previousDate', 'fechaAnterior')),
  };
};

// ── Asignaturas ──────────────────────────────────────────────────────────

const plain = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[ºª.]/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Cada clase llama a la misma asignatura de una manera. */
const ALIASES = [
  ['matematicas', 'mates', 'mate', 'matematica', 'mat', 'matematicas aplicadas', 'mates ccss'],
  [
    'lengua',
    'lengua castellana',
    'lengua y literatura',
    'castellano',
    'lengua castellana y literatura',
  ],
  ['ingles', 'english', 'lengua extranjera ingles'],
  ['fisica y quimica', 'fyq', 'fq', 'fisica quimica'],
  ['biologia', 'bio', 'biologia y geologia', 'byg', 'bg'],
  ['geografia e historia', 'geo', 'geografia', 'sociales', 'ccss', 'historia y geografia'],
  ['historia', 'h', 'historia de espana', 'hist'],
  ['educacion fisica', 'ef', 'edu fisica', 'gimnasia'],
  ['tecnologia', 'tecno', 'tecnologia y digitalizacion'],
  ['filosofia', 'filo'],
  ['economia', 'eco'],
  ['frances', 'francais'],
  ['dibujo', 'dibujo tecnico', 'dt', 'plastica', 'epva'],
  ['valenciano', 'catalan', 'valencia', 'catala'],
  ['gallego', 'galego', 'lingua galega'],
  ['euskera', 'euskara'],
  ['quimica', 'qui'],
  ['fisica', 'fis'],
];

const canonical = (name) => {
  const p = plain(name);
  const group = ALIASES.find((names) => names.includes(p));
  return group ? group[0] : p;
};

/**
 * Tu asignatura que corresponde a la del aula, o null. Primero igual (sin
 * tildes ni mayúsculas), luego por alias ("Mates" ↔ "Matemáticas"), y por
 * último una mitad de una asignatura doble: "Química" ↔ "Física y Química"
 * si no tienes Química aparte. Nunca por "contiene": "Historia" no es
 * "Historia del Arte". Ante la duda, null (va sin asignar y se cambia a
 * mano), que es mejor que meter el examen en la asignatura que no es.
 */
export const matchSubject = (subjectName, subjects = []) => {
  const target = plain(subjectName);
  if (!target) return null;
  const list = (subjects || []).filter((s) => s && s.name);
  const exact = list.find((s) => plain(s.name) === target);
  if (exact) return exact;
  const alias = list.find((s) => canonical(s.name) === canonical(target));
  if (alias) return alias;
  const halves = (name) => plain(name).split(/ (?:y|e) /);
  const wanted = canonical(target);
  const double = list.filter((s) => {
    const parts = halves(s.name);
    return parts.length === 2 && parts.some((part) => canonical(part) === wanted);
  });
  return double.length === 1 ? double[0] : null;
};

// ── En qué punto está cada fecha ─────────────────────────────────────────

export const STATUS = {
  NOT_ADDED: 'not_added',
  MAYBE_SAME: 'maybe_same',
  IN_CALENDAR: 'in_calendar',
  CHANGED: 'changed',
  PAST: 'past',
};

/**
 * @param {Object} classDate - ya normalizada
 * @param {Array}  exams - tus exámenes (con `date`, `subjectId`, `classLink`)
 * @param {Object} [options]
 * @param {Array}  [options.subjects]
 * @param {Date}   [options.now]
 * @returns {{ status: string, exam?: Object, subject?: Object|null,
 *             from?: Date, to?: Date, userMoved?: boolean, daysLeft: number }}
 */
export const classDateStatus = (
  classDate,
  exams = [],
  { subjects = [], now = new Date() } = {}
) => {
  const daysLeft = daysBetween(now, classDate.date);
  const subject = matchSubject(classDate.subjectName, subjects);
  const linked = (exams || []).find(
    (exam) =>
      exam?.classLink?.dateId === classDate.id &&
      (!classDate.aulaId || !exam.classLink.aulaId || exam.classLink.aulaId === classDate.aulaId)
  );

  if (linked) {
    if (sameDay(linked.date, classDate.date)) {
      return { status: STATUS.IN_CALENDAR, exam: linked, subject, daysLeft };
    }
    // Tu fecha no es la del aula. Si la del aula sigue siendo la que
    // aceptaste, la que se movió fue la tuya: decisión tuya, no se avisa.
    if (sameDay(linked.classLink.syncedDate, classDate.date)) {
      return { status: STATUS.IN_CALENDAR, exam: linked, subject, daysLeft, userMoved: true };
    }
    return {
      status: STATUS.CHANGED,
      exam: linked,
      subject,
      daysLeft,
      from: toDate(linked.date),
      to: classDate.date,
    };
  }

  if (daysLeft !== null && daysLeft < 0) return { status: STATUS.PAST, subject, daysLeft };

  // ¿Ya lo tienes apuntado por tu cuenta? Misma asignatura, mismo tipo, sin
  // nota todavía, a pocos días. Mejor vincularlo que tener dos.
  if (subject) {
    const candidates = (exams || [])
      .filter(
        (exam) =>
          exam &&
          !exam.classLink &&
          !exam.completed &&
          exam.subjectId === subject.id &&
          (exam.type === 'task' ? 'task' : 'exam') === classDate.type
      )
      .map((exam) => ({ exam, gap: Math.abs(daysBetween(exam.date, classDate.date) ?? 99) }))
      .filter((row) => row.gap <= SAME_EXAM_WINDOW_DAYS)
      .sort((a, b) => a.gap - b.gap);
    if (candidates.length > 0) {
      return { status: STATUS.MAYBE_SAME, exam: candidates[0].exam, subject, daysLeft };
    }
  }

  return { status: STATUS.NOT_ADDED, subject, daysLeft };
};

// ── Qué escribir en tu examen para cada acción ───────────────────────────

const linkFor = (classDate, now) => ({
  aulaId: classDate.aulaId,
  dateId: classDate.id,
  syncedDate: iso(classDate.date),
  linkedAt: iso(now),
});

/**
 * "Añadir a mi calendario": el examen nuevo. Si tu asignatura no se
 * encuentra, va sin asignar (como al crear uno a mano sin elegir) y el
 * nombre lleva la del aula, para que no se pierda.
 */
export const examFromClassDate = (classDate, { userId, subject = null, now = new Date() } = {}) => {
  const subjectLabel = classDate.subjectName || 'la clase';
  const fallbackName =
    classDate.type === 'task' ? `Entrega de ${subjectLabel}` : `Examen de ${subjectLabel}`;
  return {
    userId,
    name: classDate.title || fallbackName,
    // 'undefined' (como texto) es lo que EventModal guarda para "sin asignar".
    subjectId: subject?.id ?? 'undefined',
    date: iso(classDate.date),
    type: classDate.type,
    manualPriority: 5,
    completed: false,
    classLink: {
      ...linkFor(classDate, now),
      ...(classDate.includes ? { includes: classDate.includes } : {}),
    },
  };
};

/**
 * "Es el mismo": tu examen se vincula y se queda con tu fecha. Si no
 * coincide con la del aula, cuenta como que la moviste tú.
 */
export const linkUpdates = (classDate, { now = new Date() } = {}) => ({
  classLink: linkFor(classDate, now),
});

/**
 * "Mover el mío": tu examen pasa a la fecha nueva. Las alertas de 3 días y
 * 1 día vuelven a estar pendientes, porque la fecha a la que avisaban ya no
 * es la que vale.
 */
export const acceptChangeUpdates = (classDate) => ({
  date: iso(classDate.date),
  notified3Days: false,
  notified1Day: false,
  'classLink.syncedDate': iso(classDate.date),
  'classLink.pendingDate': null,
  'classLink.pendingBy': null,
  'classLink.pendingNotified': null,
});

/** "Dejar la mía": no se vuelve a preguntar por este cambio. */
export const keepMineUpdates = (classDate) => ({
  'classLink.syncedDate': iso(classDate.date),
  'classLink.pendingDate': null,
  'classLink.pendingBy': null,
  'classLink.pendingNotified': null,
});

/**
 * Un cambio visto en la app y aún sin decidir: se apunta en tu examen para
 * que la notificación del día pueda contarlo si no lo resuelves. Devuelve
 * null si ya estaba apuntado (no reescribir lo mismo cada vez que se abre el
 * aula).
 */
export const pendingChangeUpdates = (exam, classDate) => {
  if (exam?.classLink?.pendingDate && sameDay(exam.classLink.pendingDate, classDate.date)) {
    return null;
  }
  const by = classDate.updatedBy || classDate.author;
  return {
    'classLink.pendingDate': iso(classDate.date),
    'classLink.pendingBy': by ? `${by.name}${by.initial ? ` ${by.initial}.` : ''}` : null,
    'classLink.pendingNotified': false,
  };
};

// ── Lo que se enseña ─────────────────────────────────────────────────────

const authorLabel = (person) =>
  person ? `${person.name}${person.initial ? ` ${person.initial}.` : ''}` : null;

const agoLabel = (date, now) => {
  const minutes = Math.max(0, Math.round((now - date) / 60000));
  if (minutes < 60) return minutes <= 1 ? 'hace un momento' : `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'ayer' : `hace ${days} días`;
};

/**
 * Cuánto fiarse de una fecha, en una línea. Las pone la propia clase y
 * pueden estar mal, así que se dice lo que hay: un cambio reciente es lo más
 * importante (hay que mirarlo), luego cuántos la confirman, y si no, quién la
 * puso.
 */
export const trustLine = (classDate, { now = new Date() } = {}) => {
  const updated = classDate.updatedAt;
  const created = classDate.createdAt;
  const changedRecently =
    updated && (!created || updated - created > 60 * 1000) && now - updated < 3 * DAY;
  if (changedRecently) {
    const who = authorLabel(classDate.updatedBy);
    return {
      tone: 'changed',
      text: `Cambiada ${agoLabel(updated, now)}${who ? ` por ${who}` : ''}`,
    };
  }
  if (classDate.confirmations >= CONFIRMED_AT) {
    return { tone: 'confirmed', text: `Confirmada por ${classDate.confirmations} de la clase` };
  }
  const who = authorLabel(classDate.author);
  const extra =
    classDate.confirmations > 0
      ? ` · ${classDate.confirmations} ${classDate.confirmations === 1 ? 'la confirma' : 'la confirman'}`
      : '';
  return { tone: 'plain', text: `${who ? `Puesta por ${who}` : 'Puesta por la clase'}${extra}` };
};

/** "hoy", "mañana", "en 5 días", "hace 2 días". */
export const countdownLabel = (daysLeft) => {
  if (daysLeft === null || daysLeft === undefined) return '';
  if (daysLeft === 0) return 'hoy';
  if (daysLeft === 1) return 'mañana';
  if (daysLeft > 1) return `en ${daysLeft} días`;
  if (daysLeft === -1) return 'ayer';
  return `hace ${-daysLeft} días`;
};

/**
 * Las fechas del aula por cuándo tocan: lo de esta semana arriba (lo que
 * importa ahora), luego lo demás, y lo pasado al final para plegarlo. Dentro
 * de cada grupo, por fecha; lo pasado, de más reciente a más antiguo.
 */
export const groupByWhen = (classDates, { now = new Date() } = {}) => {
  const rows = (classDates || [])
    .filter(Boolean)
    .map((d) => ({ d, days: daysBetween(now, d.date) }));
  const byDate = (a, b) => a.d.date - b.d.date;
  return {
    thisWeek: rows
      .filter((r) => r.days >= 0 && r.days <= 7)
      .sort(byDate)
      .map((r) => r.d),
    later: rows
      .filter((r) => r.days > 7)
      .sort(byDate)
      .map((r) => r.d),
    past: rows
      .filter((r) => r.days < 0)
      .sort((a, b) => b.d.date - a.d.date)
      .map((r) => r.d),
  };
};

/**
 * Para la cabecera del aula: cuántas fechas próximas aún no tienes. Es el
 * empujón para añadirlas (lo que hace que el aula sirva de algo).
 */
export const summarize = (classDates, exams, { subjects = [], now = new Date() } = {}) => {
  const upcoming = (classDates || []).filter((d) => d && daysBetween(now, d.date) >= 0);
  const statuses = upcoming.map((d) => classDateStatus(d, exams, { subjects, now }).status);
  return {
    upcoming: upcoming.length,
    missing: statuses.filter((s) => s === STATUS.NOT_ADDED || s === STATUS.MAYBE_SAME).length,
    changed: statuses.filter((s) => s === STATUS.CHANGED).length,
    inCalendar: statuses.filter((s) => s === STATUS.IN_CALENDAR).length,
  };
};

/**
 * "Añadir todas": las que faltan, con su examen ya construido. Las que
 * podrían ser un examen que ya tienes no entran (eso hay que decidirlo una
 * a una), ni las pasadas.
 */
export const examsToAddAll = (
  classDates,
  exams,
  { userId, subjects = [], now = new Date() } = {}
) =>
  (classDates || [])
    .filter(Boolean)
    .map((d) => ({ d, info: classDateStatus(d, exams, { subjects, now }) }))
    .filter(({ info }) => info.status === STATUS.NOT_ADDED)
    .map(({ d, info }) => examFromClassDate(d, { userId, subject: info.subject, now }));
