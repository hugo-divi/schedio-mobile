/**
 * Invitaciones a un aula: leer el código de un enlace y escribir el mensaje
 * para compartirlo.
 *
 * Sin imports a propósito: scripts/check-class-dates.mjs lo copia a un .mjs
 * temporal. Lo que se guarda y cuándo se usa está en
 * store/classInviteStore.js.
 */

/**
 * Cuánto se recuerda un código. El enlace se abre en el grupo de clase y el
 * registro puede quedarse a medias (verificar el correo, pedir permiso a casa
 * para la edad...). Una semana cubre eso; más, y alguien que pinchó y no
 * quiso entrar se encontraría el aula semanas después.
 */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Letras, números y guiones; lo que sea más largo o más raro no es un código. */
const CODE = /^[A-Za-z0-9][A-Za-z0-9-]{3,31}$/;

export const isInviteCode = (value) => typeof value === 'string' && CODE.test(value.trim());

/**
 * El código de un enlace o de lo que alguien pegue:
 *   https://schedio.es/aula/ABC123 · https://app.schedio.es/aula/ABC123
 *   schedio://aula/ABC123 · …?aula=ABC123 · …?codigo=ABC123 · ABC123
 * No toca mayúsculas: si los códigos distinguen, eso lo decide el aula.
 */
export const parseInviteCode = (input) => {
  if (!input || typeof input !== 'string') return null;
  const text = input.trim();
  if (isInviteCode(text)) return text;
  const fromPath = text.match(/(?:^|[/:])aulas?\/([A-Za-z0-9-]+)(?:[/?#]|$)/i);
  if (fromPath && isInviteCode(fromPath[1])) return fromPath[1];
  const fromQuery = text.match(/[?&](?:aula|codigo|code)=([A-Za-z0-9-]+)/i);
  if (fromQuery && isInviteCode(fromQuery[1])) return fromQuery[1];
  return null;
};

const shortDate = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' });
};

/**
 * El texto para el grupo de clase. Lo que hace que alguien pinche es ver
 * algo que le sirve ya (el próximo examen), no "únete a mi aula". Sin
 * nombres de nadie: el mensaje sale del aula y puede reenviarse.
 *
 * @param {Object} input
 * @param {string} input.aulaName
 * @param {string} input.url - el enlace del aula
 * @param {Array}  [input.upcoming] - `{ subjectName, date, type }`, ya ordenadas
 * @param {number} [input.total] - cuántas fechas próximas hay en total
 */
export const buildInviteMessage = ({ aulaName, url, upcoming = [], total }) => {
  const name = String(aulaName || '').trim() || 'nuestra clase';
  const next = (upcoming || []).filter((d) => d && d.subjectName && d.date).slice(0, 2);
  const count = Number.isFinite(total) ? total : (upcoming || []).length;
  const lines = [`Estamos apuntando las fechas de ${name} en Schedio.`];
  if (next.length > 0) {
    const parts = next.map((d) =>
      `${d.type === 'task' ? 'entrega de' : ''} ${d.subjectName} el ${shortDate(d.date)}`.trim()
    );
    const more = count > next.length ? ` y ${count - next.length} más` : '';
    lines.push(`Próximo: ${parts.join(', ')}${more}.`);
  }
  lines.push(`Entra y las tienes en tu calendario: ${url}`);
  return lines.join('\n');
};
