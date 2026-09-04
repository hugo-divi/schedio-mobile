/**
 * Checks for the bottom tab bar's geometry.  ·  npm run check:tab-bar
 *
 * La barra reparte el aire que le sobra entre los tres huecos de las pestañas
 * y la separación con el "+", en proporción fija. Este script comprueba, con
 * la aritmética real de services/tabBarLayout.js, las cuatro cosas que pueden
 * romperse:
 *
 *  1. No queda zona muerta: márgenes + píldoras + huecos + separación + "+"
 *     suman exactamente el ancho de la pantalla, en cualquier ancho.
 *  2. El "+" siempre está más lejos del grupo que las pestañas entre sí — que
 *     es lo que le da su papel de "no soy una pestaña más". Esto tiene que
 *     aguantar también en móviles anchos, que es donde falló el modelo
 *     anterior (hueco de 31dp entre pestañas contra 16dp hasta el "+").
 *  3. El grupo nunca llega a tocar el "+", con cualquiera de las cuatro
 *     pestañas activa.
 *  4. El "+" cae a la misma altura que las píldoras y no se sale de la barra.
 *
 * Los anchos de "Inicio"/"Clase"/"Plan"/"Perfil" se midieron en el navegador
 * con la fuente real (Inter SemiBold 12px) — no son un supuesto.
 *
 * Copia services/tabBarLayout.js a un temporal como .mjs por la misma razón
 * que el resto de check-*.mjs: este proyecto usa ESM pero package.json no
 * declara "type": "module". El repositorio no se toca.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const services = join(dirname(fileURLToPath(import.meta.url)), '..', 'services');
const here = mkdtempSync(join(tmpdir(), 'schedio-tab-bar-'));
writeFileSync(join(here, 'tabBarLayout.mjs'), readFileSync(join(services, 'tabBarLayout.js'), 'utf8'));

const {
  TAB_BAR_HEIGHT,
  TAB_PILL_HEIGHT,
  TAB_LABELS,
  MEASURED_LABEL_WIDTHS,
  SIDE_MARGIN,
  PLUS_SIZE,
  PLUS_SEPARATION_RATIO,
  MIN_TAB_GAP,
  WORST_CASE_PILLS_WIDTH,
  pillWidth,
  pillsWidth,
  clusterWidth,
  plusLeft,
  slack,
  tabGap,
  plusSeparation,
  separationToPlus,
  plusBottomOffset,
} = await import(`file://${join(here, 'tabBarLayout.mjs')}`);

let failures = 0;
const ok = (label, condition, detail = '') => {
  if (!condition) failures++;
  console.log(`${condition ? 'ok  ' : 'FALLA'} ${label}${detail ? `: ${detail}` : ''}`);
};

// Anchos reales de Android en uso. 320dp es un caso límite conocido: no se
// exige el reparto proporcional ahí (MIN_TAB_GAP entra en juego), solo que
// nada se solape.
const WIDTHS = [320, 340, 360, 375, 390, 412, 428];
const NARROW = 320;

console.log('\n── una píldora ──');
ok('inactiva: solo el icono, 48px, igual para las cuatro', pillWidth(0, false) === 48);
ok(
  'activa "Clase" (la más ancha) mide 87,56px',
  Math.abs(pillWidth(MEASURED_LABEL_WIDTHS[1], true) - 87.56) < 0.01
);
ok('el alto de la píldora es 38px', TAB_PILL_HEIGHT === 38);
ok('el "+" mide lo mismo — mismo centro vertical que las píldoras', PLUS_SIZE === TAB_PILL_HEIGHT);

console.log('\n── el peor caso del grupo ──');
const freshWorstCase = Math.max(
  ...TAB_LABELS.map((_, i) => pillsWidth(MEASURED_LABEL_WIDTHS, i))
);
ok(
  'WORST_CASE_PILLS_WIDTH coincide con el cálculo fresco (ninguna etiqueta ha cambiado sin actualizarlo)',
  Math.abs(WORST_CASE_PILLS_WIDTH - freshWorstCase) < 0.01,
  `${WORST_CASE_PILLS_WIDTH.toFixed(2)}px`
);
ok(
  '"Clase" activa es el peor caso (la etiqueta más ancha)',
  pillsWidth(MEASURED_LABEL_WIDTHS, 1) === freshWorstCase
);

console.log('\n── el reparto, ancho por ancho ──');
WIDTHS.forEach((width) => {
  const gap = tabGap(width);
  const sep = plusSeparation(width);
  console.log(
    `  ${String(width).padStart(3)}dp  hueco ${gap.toFixed(1)}px · separación ${sep.toFixed(1)}px` +
      `  (×${(sep / gap).toFixed(2)})`
  );
});

console.log('\n── 1. sin zona muerta: todo suma el ancho de la pantalla ──');
WIDTHS.forEach((width) => {
  // El peor caso es el que llena: márgenes + píldoras + 3 huecos + separación + "+"
  const total =
    SIDE_MARGIN +
    WORST_CASE_PILLS_WIDTH +
    tabGap(width) * (TAB_LABELS.length - 1) +
    plusSeparation(width) +
    PLUS_SIZE +
    SIDE_MARGIN;
  const leftOver = width - total;
  ok(
    `${width}dp`.padEnd(8),
    // Por debajo de ~330dp MIN_TAB_GAP recorta el reparto y sobra un pelo; se
    // informa, pero solo se exige que no falte sitio (nada negativo).
    width <= NARROW ? leftOver >= -0.01 : Math.abs(leftOver) < 0.01,
    `sobra ${leftOver.toFixed(2)}px`
  );
});

console.log('\n── 2. el + siempre más separado que las pestañas entre sí ──');
WIDTHS.forEach((width) => {
  const gap = tabGap(width);
  const sep = plusSeparation(width);
  ok(
    `${width}dp`.padEnd(8),
    sep > gap,
    `separación ${sep.toFixed(1)}px contra hueco ${gap.toFixed(1)}px` +
      (sep > gap ? '' : ' → el + queda MENOS separado que las pestañas')
  );
});
// La proporción exacta solo se cumple donde el suelo no muerde.
WIDTHS.filter((w) => w > NARROW).forEach((width) => {
  ok(
    `${width}dp mantiene la proporción ×${PLUS_SEPARATION_RATIO} exacta`.padEnd(44),
    Math.abs(plusSeparation(width) / tabGap(width) - PLUS_SEPARATION_RATIO) < 0.01
  );
});
ok(
  `en ${NARROW}dp el suelo de ${MIN_TAB_GAP}px protege el hueco entre pestañas`,
  Math.abs(tabGap(NARROW) - MIN_TAB_GAP) < 0.01,
  `hueco ${tabGap(NARROW).toFixed(1)}px, reparto libre habría dado ${(
    slack(NARROW) /
    (TAB_LABELS.length - 1 + PLUS_SEPARATION_RATIO)
  ).toFixed(1)}px`
);

console.log('\n── 3. el grupo nunca toca al +, con cualquier pestaña activa ──');
WIDTHS.forEach((width) => {
  const worst = Math.min(
    ...TAB_LABELS.map((_, activeIndex) => separationToPlus(width, activeIndex))
  );
  ok(
    `${width}dp`.padEnd(8),
    worst > 0,
    `hueco mínimo ${worst.toFixed(1)}px` + (worst > 0 ? '' : ' → SE SOLAPAN')
  );
});
// Con la pestaña más estrecha activa el grupo encoge, así que el hueco solo
// puede crecer respecto al peor caso — nunca al revés.
TAB_LABELS.forEach((label, activeIndex) => {
  const sep = separationToPlus(360, activeIndex);
  ok(
    `con "${label}" activa (360dp) el hueco no baja del peor caso`.padEnd(52),
    sep >= plusSeparation(360) - 0.01,
    `${sep.toFixed(1)}px`
  );
});

console.log('\n── 4. el botón, en su sitio ──');
WIDTHS.forEach((width) => {
  ok(
    `${width}dp queda con su margen derecho`.padEnd(36),
    Math.abs(width - (plusLeft(width) + PLUS_SIZE) - SIDE_MARGIN) < 0.01,
    `${SIDE_MARGIN}px`
  );
});

const plusBottom = plusBottomOffset();
const plusCenterFromBottom = plusBottom + PLUS_SIZE / 2;
const pillCenterFromBottom = TAB_BAR_HEIGHT - (TAB_BAR_HEIGHT - 25) / 2; // 25 = paddingBottom real
ok(
  'el centro del + cae exactamente donde cae el centro de una píldora',
  Math.abs(plusCenterFromBottom - pillCenterFromBottom) < 0.01,
  `+ en ${plusCenterFromBottom.toFixed(1)}px, píldora en ${pillCenterFromBottom.toFixed(1)}px, desde abajo`
);
ok('el + no se sale por abajo de la barra', plusBottom >= 0, `${plusBottom.toFixed(1)}px`);
ok(
  'el + no se sale por arriba de la barra',
  plusBottom + PLUS_SIZE <= TAB_BAR_HEIGHT,
  `${(plusBottom + PLUS_SIZE).toFixed(1)}px de ${TAB_BAR_HEIGHT}px`
);

console.log('\n── el grupo, con cada pestaña activa (360dp) ──');
TAB_LABELS.forEach((label, activeIndex) => {
  console.log(
    `  con "${label}" activa: grupo de ${clusterWidth(360, activeIndex).toFixed(1)}px` +
      `, hueco hasta el + de ${separationToPlus(360, activeIndex).toFixed(1)}px`
  );
});

console.log(failures === 0 ? '\n✅ todo correcto' : `\n❌ ${failures} comprobación(es) fallan`);
process.exit(failures === 0 ? 0 : 1);
