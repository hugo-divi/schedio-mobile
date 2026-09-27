import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import es from './locales/es.json';
import en from './locales/en.json';

// No device-locale auto-detection on purpose: the whole audience is Spanish
// students, so Spanish is always the starting language regardless of the
// phone's region. English only shows up if the student picks it by hand in
// Settings — see store/preferencesStore.js `language`, synced onto this
// instance from app/_layout.js.
i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: 'es',
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export default i18n;
