/**
 * Las reglas de la racha, sin Firestore.
 *
 * Vive aparte de services/streaks.js — que importa `./firebase` y por tanto no
 * se puede ejecutar en Node — para que la aritmética se pueda comprobar de
 * verdad en scripts/check-streak-rules.mjs, con las mismas funciones que usa la
 * app y no una copia que se pueda desincronizar. Mismo patrón que
 * services/tabBarLayout.js y services/planPresentation.js.
 *
 * La regla que gobierna todo esto: **un día solo cuenta si el plan te pidió
 * algo.** De ahí salen las tres situaciones que antes estaban mezcladas en
 * "días de descanso":
 *
 *  · Días libres — los eliges tú, son fijos y el plan no te programa nada en
 *    ellos. No cuentan ni a favor ni en contra.
 *  · Comodines — dos por semana, para lo imprevisto, y los gastas TÚ. Que sea
 *    una decisión y no un consumo silencioso es el punto: convierte "he
 *    perdido un día" en "me he tomado un día".
 *  · Racha congelada — sin exámenes por delante no hay plan, así que no hay
 *    día que contar. Eso lo decide quien llama (`hasPlan`), porque saber si
 *    hay exámenes no es asunto de este fichero.
 */

/**
 * Minutos de estudio que hacen que un día cuente.
 *
 * Estaba a 5 repartido por el fichero como número suelto. A 5 minutos la racha
 * no medía constancia, medía abrir la app; la pantalla llegaba a decir "te
 * faltan 3 min para mantener la racha", que es un listón que no significa nada.
 */
export const DAILY_GOAL_MINUTES = 20;

/** Comodines por semana. Se reinician cada lunes. */
export const MAX_REST_PER_WEEK = 2;

/** Sábado y domingo, en índice con el lunes a cero. */
export const DEFAULT_FREE_DAYS = [5, 6];

/**
 * Tope de días libres. Con cuatro o más, "racha" deja de querer decir nada:
 * quedarían tres días a la semana en los que mantenerla.
 */
export const MAX_FREE_DAYS = 3;

/**
 * Fecha civil local (YYYY-MM-DD).
 *
 * A propósito no `toISOString()`: eso convierte a UTC primero, así que al este
 * de Greenwich toda fecha construida a medianoche local se iba un día atrás — y
 * una sesión estudiada entre las 00:00 y las 02:00 se archivaba como de ayer.
 * Una racha va del día del usuario, así que se calcula en hora local.
 */
export const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Día de la semana de una fecha, con el lunes a cero (como DEFAULT_FREE_DAYS). */
export const weekdayIndexOf = (dateString) => (new Date(`${dateString}T00:00:00`).getDay() + 6) % 7;

/** Si ese día el plan no te pedía nada porque tú lo marcaste libre. */
export const isFreeDay = (dateString, freeDays) => freeDays.includes(weekdayIndexOf(dateString));

/** Normaliza lo que venga guardado: enteros 0-6, sin repetir y dentro del tope. */
export const sanitizeFreeDays = (days) => {
  if (!Array.isArray(days)) return DEFAULT_FREE_DAYS;
  const clean = [
    ...new Set(days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)),
  ];
  return clean.slice(0, MAX_FREE_DAYS);
};

/** Clave de semana con el lunes de inicio, p. ej. "2026-07-27". */
export const weekKeyOf = (dateString) => {
  const d = new Date(`${dateString}T00:00:00`);
  const dayOfWeek = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - dayOfWeek);
  return formatDate(d);
};

export const restUsedInWeekOf = (restDays, dateString) => {
  const key = weekKeyOf(dateString);
  return restDays.filter((d) => weekKeyOf(d) === key).length;
};

/** Fechas estrictamente entre dos días, como YYYY-MM-DD. */
export const daysBetweenExclusive = (fromString, toString) => {
  const out = [];
  const cursor = new Date(`${fromString}T00:00:00`);
  const end = new Date(`${toString}T00:00:00`);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor < end) {
    out.push(formatDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
};

/**
 * ¿Sobrevive la racha a este hueco?
 *
 * Antes la función equivalente GASTABA comodines por su cuenta para tapar los
 * días fallados. Ya no gasta nada: solo mira si cada día del hueco estaba
 * cubierto de antemano — porque era un día libre, o porque ese día pulsaste
 * "Hoy no puedo" y el comodín ya está anotado.
 *
 * Un día descubierto rompe la racha, y esa es la diferencia: el comodín ahora
 * hay que pedirlo.
 */
export const gapIsCovered = (missedDates, restDays, freeDays) =>
  missedDates.every((day) => isFreeDay(day, freeDays) || restDays.includes(day));

/** Evita que la lista guardada crezca sin límite. */
export const pruneRestDays = (restDays, keepDays = 90, now = new Date()) => {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - keepDays);
  const cutoffStr = formatDate(cutoff);
  return restDays.filter((d) => d >= cutoffStr);
};

/** Cuántos comodines quedan en la semana que contiene `date`. */
export const restDaysRemaining = (restDays = [], date = new Date()) =>
  Math.max(0, MAX_REST_PER_WEEK - restUsedInWeekOf(restDays, formatDate(date)));

/**
 * Si se puede gastar un comodín hoy. Devuelve el motivo cuando no, porque la
 * pantalla enseña cosas distintas según cuál sea: en un día libre el botón
 * sobra, y sin comodines hay que decir cuándo vuelven.
 */
export const canSpendJokerOn = (dateString, { restDays = [], freeDays = [], hasPlan = true }) => {
  if (!hasPlan) return { allowed: false, reason: 'frozen' };
  if (isFreeDay(dateString, freeDays)) return { allowed: false, reason: 'free-day' };
  if (restDays.includes(dateString)) return { allowed: false, reason: 'already-spent' };
  if (restUsedInWeekOf(restDays, dateString) >= MAX_REST_PER_WEEK) {
    return { allowed: false, reason: 'none-left' };
  }
  return { allowed: true, reason: null };
};
