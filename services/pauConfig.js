import { doc, getDoc } from 'firebase/firestore';

import { db } from './firebase';
import { parseIsoDay } from './pau';

/** Documento de configuración remota. Ver `fetchPauConfig`. */
const CONFIG_PATH = ['config', 'pau'];

/**
 * Las fechas oficiales por comunidad, en Firestore y no en el paquete.
 *
 * Salen entre enero y marzo, una comunidad cada vez, y equivocarse en la fecha
 * de un examen destroza la confianza en todo lo demás que dice la app. Tenerlas
 * en un documento que se edita desde la consola permite corregirlas el mismo
 * día sin publicar una versión ni esperar a que nadie actualice.
 *
 * Forma esperada del documento `config/pau`:
 *
 *     { "2027": { "GA": "2027-06-08", "MD": "2027-06-02", ... } }
 *
 * Si falla —sin red, reglas mal desplegadas, documento todavía sin crear— se
 * devuelve null y la cuenta atrás sigue funcionando con la estimación. Nunca
 * debe romper Inicio.
 */
export const fetchPauConfig = async (year) => {
  try {
    const snap = await getDoc(doc(db, ...CONFIG_PATH));
    if (!snap.exists()) return null;
    const byRegion = snap.data()?.[String(year)];
    return byRegion && typeof byRegion === 'object' ? byRegion : null;
  } catch (error) {
    console.warn('[PAU] No se pudo leer la configuración de fechas:', error?.message);
    return null;
  }
};

/**
 * La fecha oficial de una comunidad para una convocatoria, o null.
 *
 * Aparte de `fetchPauConfig` porque Inicio solo quiere una fecha, no el mapa
 * entero, y porque así el parseo del formato vive en un único sitio.
 */
export const fetchOfficialPauDate = async (year, region) => {
  if (!region) return null;
  const byRegion = await fetchPauConfig(year);
  return byRegion ? parseIsoDay(byRegion[region]) : null;
};
