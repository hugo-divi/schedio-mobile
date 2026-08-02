import { Alert, Linking } from 'react-native';

/**
 * Where the privacy policy and the terms of service live.
 *
 * The documents themselves are written — see legal/privacidad.md and
 * legal/terminos.md — but these stay empty until they're published
 * somewhere reachable by URL (the GitHub Pages landing, once it exists).
 * Fill these in and every link in the app starts working — registration
 * and settings both read from here.
 *
 * Play Store submission needs these live and reachable, so shipping with them
 * blank is not an option; the UI says "próximamente" rather than opening a
 * dead link in the meantime.
 */
export const LEGAL_URLS = {
  privacy: '',
  terms: '',
};

export const LEGAL_LABELS = {
  privacy: 'Política de privacidad',
  terms: 'Términos de servicio',
};

/** Opens a legal document, or says it isn't published yet. */
export const openLegal = async (kind) => {
  const url = LEGAL_URLS[kind];
  if (!url) {
    Alert.alert(
      LEGAL_LABELS[kind],
      'Todavía no está publicada. Estará disponible antes del lanzamiento.'
    );
    return;
  }
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Error', 'No se pudo abrir el enlace.');
  }
};
