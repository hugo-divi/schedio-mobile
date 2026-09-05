import { Platform } from 'react-native';

/**
 * Schedio design tokens.
 *
 * Values mirror the "Schedio Design System" project in Claude Design
 * (tokens/colors.css, effects.css, spacing.css, typography.css). That project
 * is the source of truth — change it there first, then reflect it here.
 *
 * Single dark theme: `colors.dark` and `colors.light` intentionally hold the
 * same values so the screens that still branch on `isDarkMode` keep working
 * while they wait to be redesigned. Those branches get removed screen by
 * screen; no new code should read `colors.light`.
 */

const palette = {
  bgBase: '#191919',
  surfaceCard: '#242424',
  surfaceHover: '#2C2C2C',
  borderDefault: '#373737',
  textPrimary: '#EDEDED',
  textSecondary: '#9B9B9B',
  textDisabled: '#6B6B6B',
  accent: '#2979FF',
  accentSoftBg: 'rgba(41, 121, 255, 0.14)',
  accentSoftBorder: 'rgba(41, 121, 255, 0.28)',
  accentSoftText: '#2979FF',
  /**
   * Backgrounds for a study break — `accentSoftBg` already flattened onto
   * `bgBase` and onto `surfaceHover`. Opaque rather than layered because the
   * timer swaps the whole screen's colour, and because the pair has to stay
   * legible as two steps of the same blue: tone says break, lightness says
   * whether the clock is running.
   */
  breakBase: '#1B2639',
  breakPaused: '#2B374A',
  premiumText: '#D4A94C',
  premiumBg: 'rgba(212, 169, 76, 0.12)',
  premiumBorder: 'rgba(212, 169, 76, 0.3)',
  /**
   * Paleta cerrada para las materias, ordenada por tono.
   *
   * Cuatro reglas, y las cuatro las comprueba scripts/check-subject-colors.mjs:
   *
   *  1. **Contraste con la inicial blanca.** La letra que va dentro del círculo
   *     se pinta en blanco a 14px en negrita, que para WCAG no es "texto
   *     grande": pide 4,5:1. La versión anterior no lo miraba y **diez de los
   *     veinte colores bajaban de 3:1** — el cian se quedaba en 1,99:1, con la
   *     letra casi ilegible. Ahora el contraste es la restricción que fija la
   *     luminosidad de cada tono, no algo que se comprueba después.
   *  2. **Contraste con la tarjeta.** El círculo vive sobre `surfaceCard`, así
   *     que también tiene que despegarse de ella: 3:1 mínimo.
   *  3. **Ningún tono cerca del acento.** El azul de Schedio (#2979FF, 218°)
   *     significa "seleccionado" en toda la app; una materia azul compite con
   *     esa señal. Banda prohibida de ±32°.
   *  4. **Distintas tonalidades, no solo distintos tonos.** Antes las veinte
   *     tenían la misma saturación (58%), así que se leían como una sola pared
   *     de color. Ahora alternan intensa y apagada — 42 puntos de rango en
   *     saturación y 33 en luminosidad — y así dos materias vecinas se
   *     distinguen por algo más que el matiz.
   *
   * El reparto por el círculo cromático **no es uniforme**, y esa es la otra
   * corrección: del amarillo al verde azulado hay 120° que el ojo distingue
   * fatal, mientras que del violeta al carmín hay 110° llenos de tonos que no
   * se confunden. Repartir a pasos iguales metía ocho verdes de veinte y dejaba
   * fichas casi gemelas; por bandas quedan cinco.
   *
   * Estas ocho son las gratuitas, elegidas entre las veinte por estar lo más
   * separadas posible entre sí (33° como mínimo): son las únicas que ve quien
   * no paga y tienen que distinguirse sin ayuda.
   */
  subjects: {
    rojo: '#DD2C2C',
    ambar: '#8C704B',
    oliva: '#5E7E14',
    esmeralda: '#168526',
    turquesa: '#158181',
    indigo: '#796CB0',
    orquidea: '#BB2ADC',
    rosa: '#A85D88',
  },
  /**
   * Los doce que desbloquea Prime, cuyo tope de 20 materias
   * (MAX_SUBJECTS_PRIME en services/permissions.js) agotaría las ocho de
   * arriba. Rellenan los huecos entre ellas, así que la lista completa sigue
   * saliendo ordenada por tono.
   */
  subjectsExtra: {
    coral: '#A26657',
    naranja: '#B8591E',
    oro: '#8B7017',
    lima: '#797741',
    verde: '#558045',
    jade: '#458067',
    violeta: '#8D52E3',
    purpura: '#8F64AB',
    magenta: '#A559A4',
    fucsia: '#CF22A9',
    frambuesa: '#DB2568',
    carmin: '#A9606C',
  },
  // Semantic exceptions — restricted use, never decorative.
  trendUp: '#5AB98A',
  danger: '#D8604A',
  white: '#FFFFFF',
  black: '#000000',
};

// Surface set consumed by screens via `isDarkMode ? colors.dark : colors.light`.
const surfaces = {
  background: palette.bgBase,
  card: palette.surfaceCard,
  cardSecondary: palette.surfaceHover,
  text: palette.textPrimary,
  textSecondary: palette.textSecondary,
  border: palette.borderDefault,
  input: palette.surfaceHover,
  tabBar: palette.surfaceCard,
};

export const tokens = {
  colors: {
    ...palette,

    // Flat aliases used across the app.
    primary: palette.accent,
    blue: palette.accent,
    indigo: palette.accent,
    orange: palette.accent,
    secondary: palette.trendUp,
    green: palette.trendUp,
    success: palette.trendUp,
    error: palette.danger,
    warning: palette.premiumText,
    yellow: palette.premiumText,
    purple: palette.accent,

    background: palette.bgBase,
    card: palette.surfaceCard,
    text: palette.textPrimary,
    textSecondary: palette.textSecondary,
    // Was `palette.textDisabled` (#6B6B6B): ~3.4:1 on the background and
    // ~2.9:1 on cards, below WCAG AA's 4.5:1 for normal text. Fine for an
    // actually-disabled control, wrong for the readable meta text
    // (timestamps, captions) screens reached for it for — aliased to
    // textSecondary until there's a real third tone that's been checked
    // against both surfaces.
    textTertiary: palette.textSecondary,
    border: palette.borderDefault,

    // Subtle fills (inputs, pressed states).
    fillTertiary: palette.surfaceHover,
    fillQuaternary: palette.surfaceCard,

    dark: surfaces,
    light: surfaces,
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
    // Design-system scale
    s1: 4,
    s2: 8,
    s3: 12,
    s4: 16,
    s6: 24,
    s8: 32,
    s12: 48,
    cardPaddingMin: 16,
    sectionGapMin: 32,
  },

  radius: {
    // Design-system radii — use these in redesigned screens.
    btn: 8,
    card: 12,
    sheet: 24,
    pill: 100,

    // Legacy scale, kept so screens awaiting redesign keep their geometry.
    xs: 12,
    sm: 16,
    md: 20,
    lg: 24,
    xl: 32,
    hero: 28,
    full: 9999,
  },

  typography: {
    families: {
      /**
       * Inter — redesigned screens only. React Native picks a weight by family
       * name, not by `fontWeight`, so pair each weight with its own family.
       * Do not point `sans` at Inter: screens that still combine `sans` with
       * `fontWeight` would silently render at regular weight on Android.
       */
      inter: {
        regular: 'Inter_400Regular',
        medium: 'Inter_500Medium',
        semibold: 'Inter_600SemiBold',
        bold: 'Inter_700Bold',
      },
      // Large display numbers.
      display: 'BebasNeue_400Regular',

      // System stack — screens not yet redesigned.
      sans: Platform.select({
        ios: '-apple-system',
        android: 'sans-serif',
        default: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
      }),
      serif: Platform.select({
        ios: 'Georgia',
        android: 'serif',
        default: 'Lyon-Text, Georgia, YuMincho, serif',
      }),
    },

    // Design-system roles.
    screenTitle: { size: 26, weight: '700' },
    sectionTitle: { size: 17, weight: '600' },
    body: { size: 15, weight: '400', lineHeight: 1.45 },
    meta: { size: 13, weight: '500' },
    number: { size: 48 },

    // Legacy numeric scale.
    xs: 12,
    sm: 13,
    base: 17,
    lg: 20,
    xl: 22,
    xxl: 28,
    extra: 34,
  },

  blur: {
    base: 24,
    nav: 24,
  },

  animations: {
    primary: [0.2, 0.8, 0.2, 1], // Schedio Bezier
    toast: [0.2, 0.9, 0.2, 1],
    standard: 180, // ms — --transition-standard
  },

  /**
   * The redesigned language is flat (borders, not shadows). These remain for
   * screens awaiting redesign.
   */
  shadows: {
    primary: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 4,
    },
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.3,
      shadowRadius: 15,
      elevation: 5,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 15 },
      shadowOpacity: 0.5,
      shadowRadius: 35,
      elevation: 10,
    },
  },
};
