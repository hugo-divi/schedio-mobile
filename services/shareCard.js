/**
 * La tarjeta para compartir al terminar una sesión, en formato historia
 * (1080 × 1920), como SVG.
 *
 * Un solo dibujo para todo: en la web se pasa a PNG con un canvas
 * (services/shareImage.web.js) y en Android con react-native-svg
 * (services/shareImage.js). Puro y sin imports: lo prueba
 * scripts/check-share-card.mjs.
 *
 * Qué sale y qué no: minutos, asignatura, racha y cómo va el plan de hoy.
 * Nunca el nombre, la nota ni nada que identifique a quien la comparte: la
 * comparten menores en sus historias.
 */

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;

const BG = '#191919';
const TEXT = '#EDEDED';
const MUTED = '#9B9B9B';
const ACCENT = '#2979FF';
const FONT = "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MAX_SUBJECT = 26;

const escapeXml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const HEX = /^#[0-9a-f]{6}$/i;
const safeColor = (value, fallback) => (HEX.test(String(value || '')) ? value : fallback);

/** Que el nombre quepa: se recorta con "…" y la letra baja si es largo. */
export const fitSubject = (name) => {
  const clean = String(name || '').trim() || 'Estudio';
  const text = clean.length > MAX_SUBJECT ? `${clean.slice(0, MAX_SUBJECT - 1).trimEnd()}…` : clean;
  // Inter en negrita ronda 0,56 em por carácter, y delante va "de ";
  // 920 px de ancho útil.
  const size = Math.max(56, Math.min(96, Math.floor(920 / ((text.length + 3) * 0.56))));
  return { text, size };
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * Las líneas de la tarjeta, separadas del dibujo para poder probarlas.
 *
 * @param {Object} input
 * @param {number} input.minutes - de esta sesión
 * @param {string} input.subjectName
 * @param {number} [input.streak]
 * @param {number} [input.planDone] - sesiones de hoy hechas (contando esta)
 * @param {number} [input.planTotal] - sesiones de hoy (sin las opcionales)
 */
export const shareCardLines = ({
  minutes,
  subjectName,
  streak = 0,
  planDone = 0,
  planTotal = 0,
}) => {
  const mins = Math.max(1, Math.round(Number(minutes) || 0));
  const subject = fitSubject(subjectName);
  const badges = [];
  if (streak >= 2) badges.push(plural(streak, 'día de racha', 'días de racha'));
  if (planTotal > 0) {
    badges.push(
      planDone >= planTotal ? 'Plan de hoy completado' : `Plan de hoy: ${planDone} de ${planTotal}`
    );
  }
  return {
    overline: 'HOY HE ESTUDIADO',
    big: String(mins),
    unit: 'min',
    subject,
    badges: badges.slice(0, 2),
    footer: 'Mi plan de estudio, en Schedio',
    url: 'schedio.es',
  };
};

/**
 * @param {Object} input - lo de shareCardLines, más `subjectColor`
 * @returns {string} el SVG
 */
export const buildShareCardSvg = (input) => {
  const lines = shareCardLines(input);
  const color = safeColor(input.subjectColor, ACCENT);
  const e = escapeXml;

  // Un id por color: si dos tarjetas acaban en la misma página (la vista
  // previa), cada una se queda con su brillo.
  const glow = `glow-${color.slice(1)}`;

  const badgeRows = lines.badges
    .map((text, i) => {
      const y = 1250 + i * 132;
      // ~0,56 em por carácter a 40 px, más el punto y los márgenes.
      const w = Math.min(900, Math.round(136 + text.length * 22.4));
      const x = (CARD_WIDTH - w) / 2;
      return (
        `<rect x="${x}" y="${y}" width="${w}" height="100" rx="50" fill="#242424" stroke="#373737" stroke-width="2"/>` +
        `<circle cx="${x + 56}" cy="${y + 50}" r="12" fill="${i === 0 ? color : ACCENT}"/>` +
        `<text x="${x + 88}" y="${y + 63}" font-family="${FONT}" font-size="40" font-weight="600" fill="${TEXT}">${e(text)}</text>`
      );
    })
    .join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">` +
    `<defs>` +
    `<radialGradient id="${glow}" cx="50%" cy="38%" r="65%">` +
    `<stop offset="0" stop-color="${color}" stop-opacity="0.32"/>` +
    `<stop offset="1" stop-color="${color}" stop-opacity="0"/>` +
    `</radialGradient>` +
    `</defs>` +
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${BG}"/>` +
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#${glow})"/>` +
    // Marca, arriba.
    `<circle cx="108" cy="168" r="18" fill="${ACCENT}"/>` +
    `<text x="146" y="186" font-family="${FONT}" font-size="54" font-weight="700" fill="${TEXT}">Schedio</text>` +
    // Lo que se ha hecho.
    `<text x="540" y="640" text-anchor="middle" font-family="${FONT}" font-size="40" font-weight="600" letter-spacing="8" fill="${MUTED}">${e(lines.overline)}</text>` +
    // El número y "min" en un mismo texto: se colocan y se centran juntos,
    // tenga el número las cifras que tenga.
    `<text x="540" y="930" text-anchor="middle" font-family="${FONT}" font-weight="800" fill="${TEXT}">` +
    `<tspan font-size="320">${e(lines.big)}</tspan>` +
    `<tspan dx="24" font-size="110" font-weight="700">${e(lines.unit)}</tspan>` +
    `</text>` +
    `<text x="540" y="1090" text-anchor="middle" font-family="${FONT}" font-size="${lines.subject.size}" font-weight="700" fill="${color}">de ${e(lines.subject.text)}</text>` +
    badgeRows +
    // Pie.
    `<text x="540" y="1700" text-anchor="middle" font-family="${FONT}" font-size="40" font-weight="500" fill="${MUTED}">${e(lines.footer)}</text>` +
    `<text x="540" y="1766" text-anchor="middle" font-family="${FONT}" font-size="44" font-weight="700" fill="${ACCENT}">${e(lines.url)}</text>` +
    `</svg>`
  );
};

/** El texto que acompaña a la imagen cuando la app de destino lo admite. */
export const shareCardText = ({ minutes, subjectName }) => {
  const mins = Math.max(1, Math.round(Number(minutes) || 0));
  const subject = String(subjectName || '').trim();
  return `${mins} min${subject ? ` de ${subject}` : ''} con Schedio · schedio.es`;
};
