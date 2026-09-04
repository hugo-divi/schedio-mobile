/**
 * Geometría de la barra inferior: cuatro pestañas repartidas por el ancho
 * disponible y el "+" anclado al borde derecho, separado del grupo en
 * proporción al hueco que hay entre las propias pestañas.
 *
 * Este fichero ha tenido tres modelos y merece la pena decir por qué, porque
 * los dos primeros fallaban en direcciones opuestas:
 *
 *  1. "+" pegado al borde derecho, pestañas empaquetadas a la izquierda con un
 *     hueco de 4px. El hueco entre el grupo y el "+" era lo que sobrara — o
 *     sea, crecía con el ancho del móvil: 46px en un 360dp, 98px en un 412dp.
 *     Se leía como que el "+" se había ido solo a la esquina.
 *  2. "+" plantado justo detrás del grupo con 12px fijos. Arreglaba lo
 *     anterior y creaba lo contrario: el sobrante se iba entero al margen
 *     derecho (50px en un 360dp, 102px en un 412dp), y la barra se leía como
 *     si se hubiera derrumbado hacia la izquierda.
 *
 * Los dos trataban una de las dos distancias como fija y dejaban que el
 * sobrante cayera donde cayera. Este no deja sobrante: reparte TODO el aire
 * suelto entre los tres huecos de las pestañas y la separación del "+", en
 * proporción fija entre ellos. El resultado es que no queda zona muerta en
 * ningún ancho y que la composición se ve igual en cualquier móvil — el "+"
 * siempre a `PLUS_SEPARATION_RATIO` veces la distancia que hay entre dos
 * pestañas, sea esa distancia la que sea.
 *
 * Vive aparte de app/dashboard/_layout.js (que importa React Native y no se
 * puede ejecutar en Node) para que la aritmética se pueda comprobar de verdad
 * en scripts/check-tab-bar.mjs, con los mismos números que usa la app — no una
 * copia que se pueda desincronizar.
 */

// ── La barra ──────────────────────────────────────────────────────────────
//
// Antes vivían en components/ui/InlineSheet.js, que importa React Native.
// InlineSheet.js las reexporta de aquí para que quien ya las importaba de
// allí (QuickActionsModal, GuidedTour) no tenga que cambiar nada.
export const TAB_BAR_HEIGHT = 85;
export const TAB_BAR_PADDING_BOTTOM = 25;

// ── Una píldora de pestaña ───────────────────────────────────────────────
//
// Constantes reales de `tabPill`/`Icon` en PillTab (app/dashboard/_layout.js).
// Si cambian allí, cambian aquí — es la misma fuente, solo que sin los
// `StyleSheet.create()` que impiden ejecutar el fichero en Node.
const TAB_PAD_H = 12; // tabPill.paddingHorizontal, a cada lado
const TAB_PAD_V = 7; // tabPill.paddingVertical, a cada lado
const TAB_ICON = 22; // tamaño del icono, activo e inactivo por igual
const TAB_ICON_LABEL_GAP = 7; // tabPill.gap, solo cuenta si hay etiqueta
const TAB_BORDER = 1; // tabPill.borderWidth, a cada lado

/**
 * Alto de una píldora — y el mismo diámetro para el círculo del "+", así los
 * centros de ambos quedan a la misma altura sin tener que alinearlos a ojo.
 */
export const TAB_PILL_HEIGHT = TAB_PAD_V * 2 + TAB_ICON + TAB_BORDER * 2; // 38

/**
 * Ancho de una píldora. Inactiva es solo el icono; activa suma el hueco, la
 * etiqueta y su ancho real medido.
 */
export const pillWidth = (labelWidth, active) =>
  active
    ? TAB_PAD_H * 2 + TAB_ICON + TAB_ICON_LABEL_GAP + labelWidth + TAB_BORDER * 2
    : TAB_PAD_H * 2 + TAB_ICON + TAB_BORDER * 2;

/**
 * Las cuatro pestañas reales, en el orden en que se pintan, con el ancho de
 * su etiqueta medido en el navegador con la fuente real (Inter SemiBold
 * 12px, la que usa `tabLabel`) — `canvas.measureText()` contra la fuente ya
 * cargada, no una estimación. Si el texto de alguna cambia, hay que volver a
 * medir estos cuatro números.
 */
export const TAB_LABELS = ['Inicio', 'Clase', 'Plan', 'Perfil'];
export const MEASURED_LABEL_WIDTHS = [31.24, 32.56, 25.11, 30.74];

/** Suma de las cuatro píldoras (sin contar los huecos) con una dada activa. */
export const pillsWidth = (labelWidths, activeIndex) =>
  labelWidths.reduce((sum, w, i) => sum + pillWidth(w, i === activeIndex), 0);

/**
 * Las cuatro píldoras en su peor caso: la pestaña que, activa, hace el grupo
 * más ancho — hoy "Clase", por tener la etiqueta más larga. Todo el reparto
 * se calcula contra este número, no contra la pestaña activa en cada momento;
 * por eso los huecos entre pestañas no cambian al cambiar de pantalla, y el
 * grupo no se recoloca entero cada vez que tocas.
 */
export const WORST_CASE_PILLS_WIDTH = Math.max(
  ...MEASURED_LABEL_WIDTHS.map((_, i) => pillsWidth(MEASURED_LABEL_WIDTHS, i))
);

// ── El reparto ────────────────────────────────────────────────────────────

/** Margen a los dos lados: antes de Inicio y después del "+". */
export const SIDE_MARGIN = 16;

/** Mismo alto que una píldora — vive a su misma altura, sin elevarse. */
export const PLUS_SIZE = TAB_PILL_HEIGHT;

/**
 * Cuántas veces más lejos está el "+" del grupo de lo que están las pestañas
 * entre sí. Esto es lo que hace que se lea como "no soy una pestaña más", y
 * es una **proporción**, no una distancia fija, a propósito:
 *
 * Con una separación fija (16dp) y el hueco entre pestañas repartido, en un
 * móvil ancho el reparto daba 31dp entre pestañas contra 16dp hasta el "+" —
 * o sea, el botón acababa MÁS pegado que las propias pestañas, justo lo
 * contrario de lo que se busca. Con una proporción, la composición es idéntica
 * en cualquier pantalla.
 *
 * 1,6 y no 2: como siempre hay exactamente una pestaña abierta, al abrirse una
 * se cierra otra y el grupo entero solo varía 7,4dp entre su caso más ancho y
 * el más estrecho. No hace falta reservarle tanto aire al "+" para que se lea
 * como algo aparte — con estar claramente más lejos que el hueco entre
 * pestañas basta, y así no se queda descolgado en la esquina.
 */
export const PLUS_SEPARATION_RATIO = 1.6;

/**
 * Suelo del hueco entre pestañas, para móviles tan estrechos que el reparto
 * daría casi cero. Por debajo de ~330dp se activa y lo que se encoge es la
 * separación con el "+", no el aire entre pestañas: es preferible que el "+"
 * quede algo más cerca a que las píldoras se toquen entre ellas.
 */
export const MIN_TAB_GAP = 4;

/** Dónde empieza el "+": anclado al borde derecho, con su margen. */
export const plusLeft = (screenWidth) => screenWidth - SIDE_MARGIN - PLUS_SIZE;

/**
 * El aire suelto: lo que queda de la barra una vez colocados los dos márgenes,
 * las cuatro píldoras en su peor caso y el círculo del "+". Es exactamente lo
 * que hay que repartir entre los tres huecos y la separación — no sobra nada,
 * y por eso no queda zona muerta en ningún ancho.
 */
export const slack = (screenWidth) => plusLeft(screenWidth) - SIDE_MARGIN - WORST_CASE_PILLS_WIDTH;

/**
 * El hueco entre una pestaña y la siguiente: el aire suelto repartido entre
 * los tres huecos más la separación, que cuenta como `PLUS_SEPARATION_RATIO`
 * huecos. Se calcula contra el peor caso (no contra la pestaña activa), así
 * que no cambia al cambiar de pantalla y el grupo no se recoloca entero cada
 * vez que tocas.
 */
export const tabGap = (screenWidth) =>
  Math.max(MIN_TAB_GAP, slack(screenWidth) / (TAB_LABELS.length - 1 + PLUS_SEPARATION_RATIO));

/**
 * La separación con el "+" es el resto del aire suelto: sale a
 * `PLUS_SEPARATION_RATIO` veces el hueco entre pestañas, salvo en pantallas
 * tan estrechas que `MIN_TAB_GAP` entra en juego, donde se queda con lo que
 * sobre (y sigue siendo mayor que el hueco, que es lo que importa).
 */
export const plusSeparation = (screenWidth) =>
  slack(screenWidth) - tabGap(screenWidth) * (TAB_LABELS.length - 1);

/**
 * Ancho real del grupo con una pestaña dada activa, ya con los huecos.
 * @param {number} screenWidth
 * @param {number} activeIndex - qué pestaña está activa (-1 si ninguna)
 */
export const clusterWidth = (screenWidth, activeIndex) =>
  pillsWidth(MEASURED_LABEL_WIDTHS, activeIndex) + tabGap(screenWidth) * (TAB_LABELS.length - 1);

/**
 * Hueco real entre el final del grupo y el "+", con una pestaña dada activa.
 * Con la más ancha ("Clase") sale exactamente `plusSeparation()`; con
 * cualquier otra, un pelo más, porque el grupo mide menos. Nunca menos.
 */
export const separationToPlus = (screenWidth, activeIndex) =>
  plusLeft(screenWidth) - (SIDE_MARGIN + clusterWidth(screenWidth, activeIndex));

// ── Centrado vertical ─────────────────────────────────────────────────────

/**
 * Centro vertical del contenido de la barra, medido desde abajo del todo.
 * `tabBarStyle.paddingBottom` deja una franja inerte al pie (para el gesto de
 * inicio de Android); el contenido vive en lo que queda por encima de esa
 * franja, centrado en ella — que es lo mismo que ya hace `tabSlot` con
 * `justifyContent:'center'` para cada píldora.
 */
export const contentCenterFromBottom = () =>
  TAB_BAR_PADDING_BOTTOM + (TAB_BAR_HEIGHT - TAB_BAR_PADDING_BOTTOM) / 2;

/** `bottom` del círculo del "+", para que su centro caiga en ese mismo sitio. */
export const plusBottomOffset = () => contentCenterFromBottom() - PLUS_SIZE / 2;
