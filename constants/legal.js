import { Alert, Linking } from 'react-native';

/**
 * Where the legal pages and other schedio.es-hosted screens live.
 *
 * Published from schedio-code/schedio-landing (source repo:
 * github.com/schedio-landing/schedio-app). If the content changes there,
 * this only points at it — it doesn't pull anything automatically.
 *
 * privacy/terms started as generated copies of legal/privacidad.md and
 * legal/terminos.md, but privacidad.html has since had a section added (the
 * beta waitlist form) that the .md hasn't — the two are not kept in sync
 * automatically, the web page is the one actually published.
 */
export const LEGAL_URLS = {
  privacy: 'https://schedio.es/privacidad',
  terms: 'https://schedio.es/terminos',
  deleteAccount: 'https://schedio.es/eliminar-cuenta',
  feedback: 'https://schedio.es/feedback',
};

export const LEGAL_LABELS = {
  privacy: 'Política de privacidad',
  terms: 'Términos de servicio',
  deleteAccount: 'Eliminar cuenta',
  feedback: 'Enviar feedback',
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
