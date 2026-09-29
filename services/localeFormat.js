import { format as formatDateFns } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { enGB } from 'date-fns/locale/en-GB';

/**
 * Everything in the app that depends on the reader's language but isn't a
 * translatable string: dates, weekday names, month names, numbers.
 *
 * Why this exists: the English toggle in Settings translated the Settings
 * screen and nothing else, and dates were the part that would have stayed
 * Spanish even after every string in the app was moved into the JSON files.
 * There were 35 places formatting by hand — 18 calling `toLocaleDateString`
 * with `'es-ES'` hard-coded, 14 calling date-fns with `{ locale: es }`, and 3
 * with the Spanish weekday initials written out as an array.
 *
 * The non-obvious part is that swapping the locale object is not enough. The
 * date-fns patterns at those call sites had Spanish grammar baked into them —
 * `"d 'de' MMMM"`, `"EEEE d 'de' MMMM"` — where the `'de'` is a quoted literal
 * date-fns passes through untouched. Switching only the locale would have
 * rendered "5 de October". So call sites no longer pass patterns at all: they
 * ask for a *named* format and this module resolves the pattern per language.
 *
 * English is `en-GB`, not `en-US`, on purpose. The whole app lays its calendars
 * out with `weekStartsOn: 1` and the audience reads day-before-month; `en-US`
 * would start weeks on Sunday and render "October 5" against a Monday-first
 * grid.
 *
 * This file deliberately imports nothing from React or React Native so
 * scripts/check-locale-format.mjs can run it in Node. Components should use
 * hooks/useLocaleFormat.js instead, which binds these to the active language
 * and re-renders when it changes.
 */

const LOCALES = {
  es: { intl: 'es-ES', dateFns: es },
  en: { intl: 'en-GB', dateFns: enGB },
};

const FALLBACK = 'es';

/** Narrows whatever i18next reports ('en-GB', 'es-ES', undefined) to a key here. */
export const resolveLanguage = (language) => {
  const base = String(language ?? '')
    .slice(0, 2)
    .toLowerCase();
  return LOCALES[base] ? base : FALLBACK;
};

/** The BCP 47 tag for `Intl` APIs — `toLocaleDateString`, `toLocaleString`. */
export const intlLocale = (language) => LOCALES[resolveLanguage(language)].intl;

/**
 * The named date formats the app actually uses, each with its own pattern per
 * language. Names describe what the reader sees, not the pattern, so a call
 * site never has to know that English drops the "de".
 */
export const DATE_FORMATS = {
  /** 5 Oct · 5 Oct */
  dayMonth: { es: 'd MMM', en: 'd MMM' },
  /** 5 de octubre · 5 October */
  dayMonthLong: { es: "d 'de' MMMM", en: 'd MMMM' },
  /** 05 oct 2026 · 05 Oct 2026 */
  dayMonthYear: { es: 'dd MMM yyyy', en: 'dd MMM yyyy' },
  /** 5 de octubre de 2026 · 5 October 2026 */
  dayMonthYearLong: { es: "d 'de' MMMM 'de' yyyy", en: 'd MMMM yyyy' },
  /** octubre 2026 · October 2026 */
  monthYear: { es: 'MMMM yyyy', en: 'MMMM yyyy' },
  /** lunes · Monday */
  weekdayLong: { es: 'EEEE', en: 'EEEE' },
  /** lun · Mon */
  weekdayShort: { es: 'EEE', en: 'EEE' },
  /** L · M (the single-letter column heads) */
  weekdayNarrow: { es: 'EEEEEE', en: 'EEEEE' },
  /** lun 5 · Mon 5 */
  weekdayShortDay: { es: 'EEE d', en: 'EEE d' },
  /** lunes 5 · Monday 5 */
  weekdayLongDay: { es: 'EEEE d', en: 'EEEE d' },
  /** lunes 5 de octubre · Monday 5 October */
  weekdayLongDayMonth: { es: "EEEE d 'de' MMMM", en: 'EEEE d MMMM' },
  /** 5 · 5 (bare day number; language-independent, kept here so callers are uniform) */
  day: { es: 'd', en: 'd' },
};

/**
 * Format a date under a named format. Unknown names throw rather than silently
 * rendering the name itself, which is the kind of thing that ships.
 */
export const formatDate = (date, formatName, language) => {
  const patterns = DATE_FORMATS[formatName];
  if (!patterns) throw new Error(`Unknown date format: ${formatName}`);
  const lang = resolveLanguage(language);
  return formatDateFns(date, patterns[lang], { locale: LOCALES[lang].dateFns });
};

/** Thousands separators follow the language too: 12.500 (es) vs 12,500 (en). */
export const formatNumber = (value, language) => Number(value).toLocaleString(intlLocale(language));

/**
 * The column heads of every calendar grid in the app, Monday first to match
 * the `weekStartsOn: 1` those grids are built with. Spanish uses X for
 * miércoles so the two M's can be told apart; English has no such trick and
 * genuinely repeats letters, which is what every English calendar does.
 */
export const WEEKDAY_INITIALS = {
  es: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
};

export const weekdayInitials = (language) => WEEKDAY_INITIALS[resolveLanguage(language)];
