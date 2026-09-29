import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate, formatNumber, intlLocale, weekdayInitials } from '../services/localeFormat';

/**
 * The component-side half of services/localeFormat.js: the same formatters,
 * already bound to whatever language is active.
 *
 * It leans on `useTranslation()` for one reason beyond convenience — that hook
 * subscribes the component to i18next's `languageChanged` event. A component
 * that only renders dates has no `t()` call of its own, so without this it
 * would keep showing Spanish month names after the student switched to English
 * until something else happened to re-render it.
 */
export default function useLocaleFormat() {
  const { i18n } = useTranslation();
  const language = i18n.language;

  return useMemo(
    () => ({
      language,
      /** formatDate(date, 'dayMonthLong') — names live in DATE_FORMATS. */
      formatDate: (date, formatName) => formatDate(date, formatName, language),
      formatNumber: (value) => formatNumber(value, language),
      /** For the few places that still need to call an Intl API directly. */
      locale: intlLocale(language),
      weekdayInitials: weekdayInitials(language),
    }),
    [language]
  );
}
