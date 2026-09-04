/**
 * Checks for the guided tour.  ·  npm run check:tour
 *
 * El tour no se puede ejecutar en Node: components/GuidedTour.js importa React
 * Native, lucide y react-native-svg. Por eso su lógica —qué pasos hay y dónde
 * se coloca la tarjeta— vive en services/tour.js, sin una sola importación, y
 * es lo que este script comprueba de verdad.
 *
 * Los dos bloques que cubre son los que se rompieron antes:
 *  · la lista de pasos cambiaba de longitud a mitad de recorrido y descolocaba
 *    el índice;
 *  · la tarjeta llevaba un `top` fijo y acababa tapando lo que resaltaba, o
 *    montada encima de la barra de pestañas.
 *
 * Copia el módulo a un temporal como .mjs por la misma razón que
 * check-plan.mjs: services/*.js usa ESM y package.json no declara
 * "type": "module". El repositorio no se toca.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const services = join(dirname(fileURLToPath(import.meta.url)), '..', 'services');
const here = mkdtempSync(join(tmpdir(), 'schedio-tour-'));
writeFileSync(join(here, 'tour.mjs'), readFileSync(join(services, 'tour.js'), 'utf8'));
// El alto real de la barra vive aquí — puro, sin React Native, así que ya no
// hace falta escarbar el texto de components/ui/InlineSheet.js con una regex
// para sacarlo (que es lo que se rompió al mover la constante a este mismo
// fichero: la regex buscaba un `export const` literal que dejó de estar ahí).
writeFileSync(
  join(here, 'tabBarLayout.mjs'),
  readFileSync(join(services, 'tabBarLayout.js'), 'utf8')
);

const { buildSteps, cardTopFor, CARD_GAP, SCREEN_MARGIN_TOP, CARD_HEIGHT_GUESS } = await import(
  `file://${join(here, 'tour.mjs')}`
);
const { TAB_BAR_HEIGHT } = await import(`file://${join(here, 'tabBarLayout.mjs')}`);
const SCREEN_MARGIN_BOTTOM = TAB_BAR_HEIGHT + CARD_GAP;

let failures = 0;
const ok = (label, condition, detail = '') => {
  if (!condition) failures++;
  console.log(`${condition ? 'ok  ' : 'FALLA'} ${label}${detail ? `: ${detail}` : ''}`);
};

// ── Los pasos ───────────────────────────────────────────────────────────────

console.log('\n── pasos ──');

const plain = buildSteps({});
const withPending = buildSteps({ hasPendingExams: true });

ok('cuenta sin exámenes por calificar', plain.length === 6, `${plain.length}`);
ok('cuenta con exámenes por calificar', withPending.length === 7, `${withPending.length}`);

ok(
  'el orden sigue al de la pantalla de Inicio',
  withPending.map((s) => s.key).join(' → ') ===
    'welcome → stats → hero → calendar → pending → plus → end',
  withPending.map((s) => s.key).join(' → ')
);

ok(
  'el calendario va antes que por calificar',
  withPending.findIndex((s) => s.key === 'calendar') <
    withPending.findIndex((s) => s.key === 'pending')
);

ok(
  'las claves no se repiten (se usan como key de React)',
  new Set(withPending.map((s) => s.key)).size === withPending.length
);

ok(
  'todo paso tiene título y texto',
  withPending.every((s) => s.title?.length > 0 && s.content?.length > 0)
);

ok(
  'los refKey apuntan a refs que Inicio entrega',
  withPending
    .filter((s) => s.refKey)
    .every((s) =>
      [
        'statsStripRef',
        'heroCardRef',
        'calendarSectionRef',
        'pendingSectionRef',
      ].includes(s.refKey)
    )
);

// Sin objetivo del onboarding, el paso del hero cae en la frase general.
const goal = buildSteps({ onboardingGoalName: 'Examen de Química' });
ok(
  'el objetivo del onboarding se nombra en el paso del hero',
  goal.find((s) => s.key === 'hero').content.includes('Examen de Química')
);
ok(
  'sin objetivo, el hero usa la frase genérica',
  !plain.find((s) => s.key === 'hero').content.includes('acabas de crear')
);

// Añadir el paso "pending" no debe mover a los anteriores de sitio: es lo que
// corrompía el índice cuando la lista crecía con el tour ya abierto.
ok(
  'añadir "por calificar" no desplaza a los pasos previos',
  plain.slice(0, 4).every((s, i) => withPending[i].key === s.key)
);

// ── La colocación de la tarjeta ─────────────────────────────────────────────

console.log('\n── colocación de la tarjeta ──');

const CARD = 220;
const solapa = (top, size, rect) => !(top + size <= rect.y || top >= rect.y + rect.height);

const escenarios = [
  ['sin resaltado', null, 840],
  ['franja de stats', { y: 160, height: 80 }, 840],
  ['tarjeta de hoy', { y: 170, height: 150 }, 840],
  ['calendario alto', { y: 160, height: 380 }, 840],
  ['por calificar, abajo', { y: 600, height: 120 }, 840],
  ['elemento enorme', { y: 120, height: 600 }, 840],
  ['pantalla pequeña', { y: 150, height: 100 }, 640],
  ['pantalla grande', { y: 300, height: 200 }, 1100],
  ['elemento pegado arriba', { y: 0, height: 60 }, 840],
];

/** Cuánto se solapan la tarjeta y el elemento resaltado, en píxeles. */
const solapeCon = (top, rect) =>
  Math.max(0, Math.min(top + CARD, rect.y + rect.height) - Math.max(top, rect.y));

for (const [label, maskRect, screenHeight] of escenarios) {
  const top = cardTopFor({ maskRect, cardHeight: CARD, screenHeight, tabBarHeight: TAB_BAR_HEIGHT });
  const bottom = top + CARD;
  const barra = screenHeight - TAB_BAR_HEIGHT;

  const dentro = top >= SCREEN_MARGIN_TOP - 0.01 && bottom <= screenHeight - CARD_GAP + 0.01;
  const pisaBarra = bottom > barra + 0.01;

  // Si la tarjeta cabe entera en alguno de los dos huecos, no hay excusa para
  // taparlo. Si no cabe en ninguno —el elemento es tan alto que no deja 220 px
  // ni arriba ni abajo— el solape es inevitable, y lo único exigible es que
  // elija el lado que tape menos. Antes esto se aproximaba por el tamaño del
  // elemento, y marcaba como error el caso del calendario, donde de hecho no
  // había colocación posible sin solapar.
  const huecoArriba = maskRect ? maskRect.y - SCREEN_MARGIN_TOP : Infinity;
  const huecoAbajo = maskRect
    ? screenHeight - SCREEN_MARGIN_BOTTOM - (maskRect.y + maskRect.height)
    : Infinity;
  const cabeSinTapar = Math.max(huecoArriba, huecoAbajo) >= CARD + CARD_GAP;

  const solape = maskRect ? solapeCon(top, maskRect) : 0;
  let nota = `top ${Math.round(top)}–${Math.round(bottom)} de ${screenHeight}`;
  let bien = dentro && !pisaBarra;

  if (maskRect && !cabeSinTapar) {
    // Sin colocación limpia: se comprueba que ninguno de los dos extremos
    // posibles taparía menos que el elegido.
    const alternativas = [
      SCREEN_MARGIN_TOP,
      Math.max(SCREEN_MARGIN_TOP, screenHeight - SCREEN_MARGIN_BOTTOM - CARD),
    ];
    const mejor = Math.min(...alternativas.map((t) => solapeCon(t, maskRect)));
    bien = bien && solape === mejor;
    nota += ` · no cabe limpio, tapa ${Math.round(solape)} px (mínimo ${Math.round(mejor)})`;
  } else {
    bien = bien && solape === 0;
  }

  ok(label.padEnd(24), bien, nota);
}

ok(
  'sin medida real usa el alto supuesto',
  cardTopFor({ maskRect: null, cardHeight: 0, screenHeight: 840, tabBarHeight: TAB_BAR_HEIGHT }) ===
    Math.max(SCREEN_MARGIN_TOP, (840 - CARD_HEIGHT_GUESS) / 2)
);

ok(
  'el alto de la barra se lee de tabBarLayout.js',
  Number.isFinite(TAB_BAR_HEIGHT) && TAB_BAR_HEIGHT > 0,
  `${TAB_BAR_HEIGHT} px`
);

ok(
  'el margen inferior deja libre la barra entera',
  SCREEN_MARGIN_BOTTOM >= TAB_BAR_HEIGHT,
  `${SCREEN_MARGIN_BOTTOM} ≥ ${TAB_BAR_HEIGHT}`
);

// Una pantalla absurdamente baja no debe devolver un `top` negativo: la tarjeta
// se saldría por arriba y el alumno no vería ni el botón de siguiente.
ok(
  'nunca devuelve un top negativo',
  [320, 480, 640, 840, 1100, 1400].every((h) =>
    [null, { y: 10, height: 40 }, { y: h - 100, height: 90 }].every(
      (rect) => cardTopFor({ maskRect: rect, cardHeight: CARD, screenHeight: h, tabBarHeight: TAB_BAR_HEIGHT }) >= 0
    )
  )
);

console.log(
  failures === 0 ? '\n✅ todo correcto' : `\n❌ ${failures} comprobación(es) fallan`
);
process.exit(failures === 0 ? 0 : 1);
