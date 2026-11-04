import { CARD_WIDTH, CARD_HEIGHT } from './shareCard';

/**
 * Web (el PWA del iPhone): SVG → PNG con un canvas, y la hoja de compartir
 * del sistema con el archivo (Instagram, WhatsApp, guardar en Fotos…).
 *
 * Va en dos pasos a propósito. Safari solo deja abrir la hoja de compartir
 * justo después de un toque; si entre el toque y `navigator.share` se
 * genera la imagen, a veces ya no cuenta como respuesta al toque y falla.
 * Así que la imagen se prepara al abrir la hoja de Schedio (`prepare`) y el
 * botón solo comparte lo que ya está hecho (`share`).
 */

/** @returns {Promise<{ file: File, url: string }>} */
export const prepareShareImage = (svg, { fileName = 'schedio.png' } = {}) =>
  new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = CARD_WIDTH;
        canvas.height = CARD_HEIGHT;
        canvas.getContext('2d').drawImage(img, 0, 0, CARD_WIDTH, CARD_HEIGHT);
        URL.revokeObjectURL(svgUrl);
        canvas.toBlob((png) => {
          if (!png) {
            reject(new Error('No se pudo generar la imagen'));
            return;
          }
          const file = new File([png], fileName, { type: 'image/png' });
          resolve({ file, url: URL.createObjectURL(png) });
        }, 'image/png');
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error('No se pudo dibujar la tarjeta'));
    };
    img.src = svgUrl;
  });

/**
 * @returns {Promise<'shared'|'downloaded'|'cancelled'>}
 */
export const shareImage = async (prepared, { text } = {}) => {
  const { file, url } = prepared;
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (nav?.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
      throw error;
    }
  }
  // Sin hoja de compartir con archivos (navegadores de escritorio): se
  // descarga, y desde ahí se sube donde sea.
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  return 'downloaded';
};

/** El SVG como imagen para la vista previa. */
export const previewSource = (svg) => ({
  uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
});
