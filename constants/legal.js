import { Alert, Linking } from 'react-native';

/**
 * Where the privacy policy and the terms of service live.
 *
 * Published on the GitHub Pages landing — the source Markdown these were
 * generated from is legal/privacidad.md and legal/terminos.md. If the
 * content changes, update both: this URL only serves what's already
 * published there, it doesn't pull from the repo automatically.
 */
export const LEGAL_URLS = {
  privacy: 'https://schedio-landing.github.io/schedio-app/privacidad.html',
  terms: 'https://schedio-landing.github.io/schedio-app/terminos.html',
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
