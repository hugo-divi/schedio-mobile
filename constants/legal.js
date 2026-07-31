import { Alert, Linking } from 'react-native';

/**
 * Where the privacy policy and the terms of service live.
 *
 * Both are still empty because the documents themselves are Checkpoint 1
 * items 2 and 3 and haven't been written yet. Fill these in and every link in
 * the app starts working — registration and settings both read from here.
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
