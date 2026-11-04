import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { CARD_WIDTH, CARD_HEIGHT } from './shareCard';

/**
 * Android: la tarjeta la dibuja react-native-svg (components/ShareCardSheet.js
 * la monta y nos pasa su ref), aquí se pasa a PNG, se guarda en la caché y
 * se abre la hoja de compartir del sistema.
 *
 * Misma forma que services/shareImage.web.js: `prepare` antes y `share` con
 * el toque.
 */

/** @param {Object} svgRef - ref del <Svg> de react-native-svg ya montado */
export const prepareShareImage = (svgRef, { fileName = 'schedio.png' } = {}) =>
  new Promise((resolve, reject) => {
    if (!svgRef?.toDataURL) {
      reject(new Error('La tarjeta aún no está dibujada'));
      return;
    }
    svgRef.toDataURL(
      async (base64) => {
        try {
          const uri = `${FileSystem.cacheDirectory}${fileName}`;
          await FileSystem.writeAsStringAsync(uri, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          resolve({ uri });
        } catch (error) {
          reject(error);
        }
      },
      { width: CARD_WIDTH, height: CARD_HEIGHT }
    );
  });

/** @returns {Promise<'shared'|'unavailable'>} */
export const shareImage = async (prepared, { text } = {}) => {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  await Sharing.shareAsync(prepared.uri, {
    mimeType: 'image/png',
    dialogTitle: text || 'Compartir',
    UTI: 'public.png',
  });
  return 'shared';
};

export const previewSource = null;
