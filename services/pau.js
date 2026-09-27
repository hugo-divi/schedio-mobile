import { toDate } from './priority';

/**
 * La PAU: a quién le corresponde, qué día es y de dónde sale esa fecha.
 *
 * Todo lo que la app enseña sobre el examen cuelga de aquí, y el orden de
 * prioridad es siempre el mismo: **la fecha del estudiante manda sobre la
 * oficial, y la oficial sobre la estimada**. Que alguien pueda corregirla no
 * es un capricho: las comunidades publican sus días entre enero y marzo, y
 * hasta entonces cualquier fecha que mostremos es una suposición nuestra.
 *
 * Sin una sola importación de React Native ni de Firebase, a propósito: así lo
 * ejecuta `npm run check:pau` en Node, que es como se comprueba aquí la lógica
 * que no se puede abrir en una pantalla. La lectura del documento remoto vive
 * aparte, en services/pauConfig.js, justo por eso.
 */

/**
 * A quién se le enseña la cuenta atrás, la calculadora y el resto.
 *
 * Las tres condiciones tienen que cumplirse, y una cuenta que no pasó por el
 * onboarding nuevo no cumple ninguna: `courseYear` y `takesPau` no existen en
 * su documento, así que para todos los demás estudiantes —1º, ESO,
 * universidad, y quien desmarcó la casilla— la app se queda exactamente como
 * estaba. Es la propiedad que hace que esto no sea un cambio para todos.
 */
export const showsPau = (profile) =>
  profile?.course === 'Bachillerato' && profile?.courseYear === 2 && profile?.takesPau === true;

/**
 * La convocatoria que le toca a una fecha dada.
 *
 * La ordinaria se celebra en junio y la extraordinaria en julio, así que hasta
 * el 31 de julio el examen "próximo" es el de este año natural; a partir de
 * agosto ya es el del curso que empieza.
 */
export const pauYearFor = (now = new Date()) => now.getFullYear() + (now.getMonth() <= 6 ? 0 : 1);

/**
 * La estimación, cuando todavía no hay fecha oficial: **el primer martes de
 * junio**.
 *
 * No es un número inventado. El Ministerio fija cada enero una fecha límite
 * para todo el país —en 2026, terminar antes del 14 de junio— y las
 * comunidades reparten sus exámenes en los días previos, casi siempre
 * empezando a principios de mes y entre semana. Cae del lado prudente: si la
 * oficial acaba siendo más tarde, la cuenta atrás habrá ido dando algún día
 * de menos, que es el error que no hace daño.
 */
export const estimatedPauDate = (year) => {
  const first = new Date(year, 5, 1, 12);
  // 2 = martes; el resto de la semana se salta hacia delante.
  const shift = (9 - first.getDay()) % 7;
  return new Date(year, 5, 1 + shift, 12);
};

/** 'YYYY-MM-DD' → Date a mediodía, que es inmune a los cambios de hora. */
export const parseIsoDay = (iso) => {
  if (typeof iso !== 'string') return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d, 12);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Qué fecha se enseña y por qué.
 *
 * `source` es lo que decide la etiqueta de la tarjeta, y esa etiqueta importa
 * tanto como el número: una fecha provisional presentada como segura es peor
 * que no dar ninguna.
 *
 * `official` se devuelve aparte de `date` a propósito. Cuando el estudiante ha
 * puesto la suya y su comunidad publica otra, no se le pisa —es su decisión—
 * pero Inicio necesita saber que existe para poder ofrecérsela.
 */
export const resolvePauDate = ({ profile, official, now = new Date() } = {}) => {
  const mine = toDate(profile?.pauDate);
  const officialDate = official || null;
  const year = pauYearFor(now);
  // La fecha que se usaría si el estudiante no hubiera puesto la suya. La hoja
  // la necesita para dos cosas: ofrecer el camino de vuelta, y entender que
  // elegir justo ese día significa "vuelve a seguir a mi comunidad".
  const fallback = officialDate || estimatedPauDate(year);

  if (mine) return { date: mine, source: 'mine', official: officialDate, fallback, year };
  if (officialDate)
    return { date: officialDate, source: 'official', official: officialDate, fallback, year };
  return { date: fallback, source: 'estimated', official: null, fallback, year };
};

/**
 * Días naturales que faltan, comparando días de calendario y no instantes: a
 * las 23:00 de la víspera tienen que quedar "1 día", no cero.
 */
export const daysUntil = (date, now = new Date()) => {
  if (!date) return null;
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((b - a) / 86400000);
};

/**
 * A partir de aquí la cuenta atrás deja de ser un dato de fondo y pasa a
 * ocupar sitio propio en Inicio (ver el ascenso de celda a tarjeta).
 *
 * Un mes es cuando el repaso de la PAU empieza de verdad: las clases terminan
 * a mediados de mayo y lo que queda ya es examen. Antes de eso un número
 * enorme no ayuda a decidir qué hacer hoy, que es para lo que se abre Inicio.
 */
export const PROMOTE_AT_DAYS = 30;
