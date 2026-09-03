/**
 * La lógica pura del tour guiado: qué pasos hay y dónde se coloca la tarjeta.
 *
 * Vive fuera de components/GuidedTour.js porque ese fichero importa React
 * Native, lucide y react-native-svg, y eso lo hace imposible de ejecutar en
 * Node. Aquí no hay ni una importación, así que scripts/check-tour.mjs puede
 * comprobarlo de verdad en vez de darlo por bueno leyéndolo.
 */

/** Aire entre el recuadro resaltado y la tarjeta. */
export const CARD_GAP = 16;

/** Margen superior que la tarjeta nunca invade. */
export const SCREEN_MARGIN_TOP = 56;

/** Alto supuesto hasta que `onLayout` mide el de verdad. */
export const CARD_HEIGHT_GUESS = 220;

/**
 * Dónde va la tarjeta del tour, en coordenadas de pantalla.
 *
 * Antes cada paso llevaba un `top` fijo (`height * 0.1`, `* 0.62`…) que no
 * sabía nada del elemento resaltado. Como el scroll deja ese elemento a unos
 * 100 px del borde superior, los pasos que ponían la tarjeta en `height * 0.1`
 * la dibujaban justo encima de lo que estaban señalando.
 *
 * Ahora se decide a partir de la máscara ya medida: debajo del elemento si
 * cabe, y si no arriba. Si no cabe en ninguno de los dos lados (elemento muy
 * alto), se elige el lado con más hueco y se pega al margen.
 *
 * El alto de la barra de pestañas llega como parámetro en vez de repetirse
 * aquí: el número vive en components/ui/InlineSheet.js y ya estaba duplicado en
 * el layout. El Modal del tour se pinta por encima de todo, la barra incluida,
 * así que sin reservarle ese hueco la tarjeta se le montaba encima.
 *
 * @param {{maskRect: ?{y: number, height: number}, cardHeight: number,
 *   screenHeight: number, tabBarHeight: number}} args
 * @returns {number} el `top` de la tarjeta
 */
export const cardTopFor = ({ maskRect, cardHeight, screenHeight, tabBarHeight }) => {
  const size = cardHeight || CARD_HEIGHT_GUESS;
  const floor = SCREEN_MARGIN_TOP;
  // Si el alto de la barra no llegara, se prefiere no reservar hueco a producir
  // un NaN que colocaría la tarjeta fuera de la pantalla sin avisar.
  const bottomMargin = (Number.isFinite(tabBarHeight) ? tabBarHeight : 0) + CARD_GAP;
  const ceiling = screenHeight - bottomMargin - size;

  // Pasos sin resaltado (bienvenida, botón central, cierre): centrada.
  if (!maskRect) return Math.max(floor, (screenHeight - size) / 2);

  const below = maskRect.y + maskRect.height + CARD_GAP;
  if (below <= ceiling) return below;

  const above = maskRect.y - CARD_GAP - size;
  if (above >= floor) return above;

  const roomAbove = maskRect.y - floor;
  const roomBelow = screenHeight - bottomMargin - (maskRect.y + maskRect.height);
  return roomAbove > roomBelow ? floor : Math.max(floor, ceiling);
};

/**
 * Los pasos del tour. El componente los congela al montar.
 *
 * Antes se reconstruían en cada render dentro del cuerpo del componente, así
 * que `hasPendingExams` pasando de false a true a mitad de recorrido alargaba
 * el array de 6 a 7 **con el índice `step` ya avanzando**: el alumno veía un
 * paso repetirse o saltarse. Ahora la lista es inmutable desde el primer
 * fotograma; app/dashboard/index.js además ya no monta el tour hasta que la
 * carga ha terminado, así que los datos que entran aquí son los definitivos.
 *
 * El orden sigue el de la pantalla de Inicio, que es como se pinta de arriba
 * abajo: franja de stats → tarjeta de hoy → calendario → por calificar. Estaba
 * al revés entre los dos últimos y el tour bajaba hasta el fondo para después
 * volver a subir.
 */
export const buildSteps = ({ hasPendingExams = false, onboardingGoalName = null } = {}) => {
  const steps = [
    {
      key: 'welcome',
      title: 'Bienvenido a Schedio',
      content: 'Un minuto y ya sabes moverte. Empezamos por tu pantalla de Inicio.',
      refKey: null,
    },
    {
      key: 'stats',
      title: 'Racha, nivel y media',
      content:
        'Cada sesión de estudio suma XP y mantiene viva tu racha. Toca tu nivel para ver el camino completo hasta el siguiente rango.',
      refKey: 'statsStripRef',
    },
    {
      key: 'hero',
      title: 'Tu día, resumido',
      // Personalizado cuando conocemos el objetivo que el propio alumno creó en
      // el onboarding; si se lo saltó, cae en la frase general.
      content: onboardingGoalName
        ? `¿Ves esto? Es lo que tú mismo acabas de crear: ${onboardingGoalName}. Tócalo cuando quieras para empezar.`
        : 'Una sugerencia pensada para hoy, y un botón para empezar a estudiar sin más vueltas.',
      refKey: 'heroCardRef',
    },
    {
      key: 'calendar',
      title: 'Tu calendario',
      content:
        'El mes de un vistazo, con lo próximo justo debajo. Mantén pulsado un examen para editarlo, o tócalo para verlo en tu plan.',
      refKey: 'calendarSectionRef',
    },
  ];

  // Solo existe si hay exámenes ya pasados sin nota. Quien acaba de terminar el
  // onboarding nunca los tiene (esa pantalla no deja elegir una fecha anterior
  // a hoy), pero sí quien onboardeó y tardó días en volver a abrir la app.
  if (hasPendingExams) {
    steps.push({
      key: 'pending',
      title: 'Por calificar',
      content: 'Pon nota a los exámenes que ya has hecho: es lo que alimenta tu media.',
      refKey: 'pendingSectionRef',
    });
  }

  steps.push({
    key: 'plus',
    title: 'El botón del centro',
    content:
      'Añadir un examen, calificar uno, apuntar algo rápido, subir un archivo a tu mochila o empezar a estudiar — todo a un toque, desde cualquier pantalla.',
    refKey: null,
  });

  /*
   * El tour se queda en Inicio.
   *
   * Hubo tres pasos más que recorrían Estudiar, Plan y Perfil navegando a sus
   * rutas. No podían funcionar: GuidedTour se renderiza desde
   * app/dashboard/index.js, así que su Modal pertenece a la pantalla de Inicio
   * — en cuanto navegaba a otra pestaña, Inicio dejaba de ser la pantalla
   * activa y la tarjeta desaparecía. Al volver a Inicio reaparecía, en el mismo
   * paso, y volvía a navegar. Un bucle sin salida.
   *
   * Arreglarlo de verdad pasa por subir el tour a app/dashboard/_layout.js,
   * donde QuickActionsModal ya vive por encima de las pestañas — pero la
   * máscara mide refs que pertenecen a Inicio, así que tendrían que subir con
   * él. Es el mismo movimiento que haría falta para poder resaltar el "+".
   */
  steps.push({
    key: 'end',
    title: 'Y eso es todo',
    content:
      'Abajo tienes Clase, Plan y tu Perfil. Échales un ojo cuando quieras — se explican solos.',
    refKey: null,
  });

  return steps;
};
