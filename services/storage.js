import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Tope por archivo. No es una restricción comercial: `fetch(uri).blob()` carga
 * el archivo entero en memoria antes de empezar a subirlo, así que sin techo un
 * PDF grande tumba la app en un Android de gama media. 25 MB cubre de sobra unos
 * apuntes escaneados.
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const formatBytes = (bytes) => {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

/**
 * Se distingue del resto de fallos para poder decirle al alumno cuánto pesa su
 * archivo y cuál es el límite, en vez de un "falló la subida" a secas.
 */
export class FileTooLargeError extends Error {
  constructor(size, limit) {
    super(`El archivo pesa ${formatBytes(size)} y el máximo es ${formatBytes(limit)}.`);
    this.name = 'FileTooLargeError';
    this.code = 'schedio/file-too-large';
    this.size = size;
    this.limit = limit;
  }
}

/**
 * Sube un archivo a Firebase Storage.
 * @param {string} uri - URI local del archivo
 * @param {string} path - Ruta en Storage (ej. 'users/uid/resources/apuntes.pdf')
 * @param {function} onProgress - Callback de progreso (0-100)
 * @param {{ onTaskCreated?: function, maxBytes?: number }} [options]
 *   `onTaskCreated` recibe la tarea de Firebase para poder cancelarla: sin esto
 *   una subida lenta con datos móviles solo se cortaba matando la app.
 * @returns {Promise<string>} URL de descarga
 */
export const uploadFile = async (uri, path, onProgress, options = {}) => {
  const { onTaskCreated, maxBytes = MAX_UPLOAD_BYTES } = options;

  const response = await fetch(uri);
  const blob = await response.blob();

  // Se comprueba aquí y no solo en el selector porque no todos los orígenes
  // (cámara, galería, documentos) informan del tamaño de la misma forma.
  if (maxBytes && blob.size > maxBytes) {
    throw new FileTooLargeError(blob.size, maxBytes);
  }

  const storageRef = ref(storage, path);
  const uploadTask = uploadBytesResumable(storageRef, blob);
  if (onTaskCreated) onTaskCreated(uploadTask);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        // Firebase's own resumable-upload snapshots can report
        // bytesTransferred slightly past totalBytes (seen with photos from
        // the camera on web/PWA) — clamp so the bar never reads past 100%.
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (onProgress) onProgress(Math.min(100, Math.max(0, progress)));
      },
      (error) => {
        // storage/canceled es el propio alumno pulsando "Cancelar", no un
        // fallo: quien llama decide, y no se registra como error.
        if (error?.code !== 'storage/canceled') {
          console.error('Error uploading file:', error);
        }
        reject(error);
      },
      async () => {
        try {
          resolve(await getDownloadURL(uploadTask.snapshot.ref));
        } catch (error) {
          console.error('Error resolving download URL:', error);
          reject(error);
        }
      }
    );
  });
};

/**
 * Borra un archivo de Firebase Storage.
 * @param {string} path - Ruta relativa en el bucket
 */
export const deleteFile = async (path) => {
  try {
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
};
