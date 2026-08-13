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
  premiumText: '#D4A94C',
  premiumBg: 'rgba(212, 169, 76, 0.12)',
  premiumBorder: 'rgba(212, 169, 76, 0.3)',
  /**
   * Closed palette for subject labels, one fixed tone each — mirrors
   * tokens/subjects.css in the design system. Desaturated for the dark
   * background: these categorise, they don't decorate, so the student picks
   * from these eight rather than from a free colour wheel.
   */
  subjects: {
    tecno: '#2FA4A6',
    historia: '#C9922F',
    filosofia: '#8A6FD4',
    quimica: '#3FA76B',
    mates: '#E0705A',
    tic: '#4C9BE0',
    ingles: '#D46A9A',
    lengua: '#6C6FD4',
  },
  /**
   * Unlocked with Prime, whose subject cap (20, see MAX_SUBJECTS_PRIME in
   * services/permissions.js) would otherwise run past the eight tones above
   * and force two subjects to share a colour. Same desaturated weight as
   * `subjects`, spaced by hue so each one still reads as distinct at the
   * ~34px dot the picker renders.
   */
  subjectsExtra: {
    geologia: '#CC3E3E',
    economia: '#B9AC31',
    biologia: '#94AD2E',
    geografia: '#6EAD2E',
    musica: '#47AD2E',
    griego: '#2EAD3B',
    informatica: '#2EAD87',
    fisica: '#56ADD2',
    arte: '#9E66D6',
    dibujo: '#C066D6',
    latin: '#D45EC8',
    religion: '#D45E81',
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
