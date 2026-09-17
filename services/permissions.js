/**
 * Permissions Service
 * Centralized logic for validating user plans and feature access.
 * 🛡️ SECURITY NOTE: While validated here, critical features should also check
 * entitlement status on the backend (e.g., via Cloud Functions).
 */

import { Platform } from 'react-native';
import { tokens } from '../theme/tokens';

/**
 * Feature Flags and Plan Levels
 */
export const PLANS = {
  FREE: 'free',
  PRIME: 'prime', // "Prime" is the name used in the app
};

/**
 * Validates if the user has a specific plan level
 * @param {Object} userData - The user object from the store (including isPrime)
 * @returns {boolean}
 */
export const hasPrimeAccess = (userData) => {
  if (!userData) return false;
  // Support both direct isPrime flag and potentially more complex plan structures
  return userData.isPrime === true || userData.plan === PLANS.PRIME;
};

/**
 * Specific Feature Access Checks
 */
export const canAccessAIRecommendations = (userData) => {
  // Currently AI features might be Prime-only
  return hasPrimeAccess(userData);
};

/** Mochila: files a free/Prime account may upload per rolling seven days. */
export const WEEKLY_UPLOADS_FREE = 3;
export const WEEKLY_UPLOADS_PRIME = 15;

export const getWeeklyUploadLimit = (userData) =>
  hasPrimeAccess(userData) ? WEEKLY_UPLOADS_PRIME : WEEKLY_UPLOADS_FREE;

/** Materias: capped even for Prime, so a single account can't grow an unbounded subjects list. */
export const MAX_SUBJECTS_FREE = 8;
// Web has no Prime to sell (no Web Billing product, no VAT registration for
// direct sales — see the web launch notes), so its free tier gets a slightly
// higher ceiling instead of the native 8, as a stand-in for what Prime would
// have unlocked there.
export const MAX_SUBJECTS_WEB = 10;
export const MAX_SUBJECTS_PRIME = 20;

export const getMaxSubjects = (userData) => {
  if (hasPrimeAccess(userData)) return MAX_SUBJECTS_PRIME;
  return Platform.OS === 'web' ? MAX_SUBJECTS_WEB : MAX_SUBJECTS_FREE;
};

/**
 * Colores de materia: la paleta gratuita cubre justo MAX_SUBJECTS_FREE (8).
 * Prime sube el tope a 20, así que necesita los 12 tonos extra o dos materias
 * acabarían compartiendo color. Web sube el tope a 10 (ver MAX_SUBJECTS_WEB) y
 * necesita, por lo mismo, 2 de esos 12 tonos extra.
 */
export const SUBJECT_COLORS_FREE = Object.values(tokens.colors.subjects);
const SUBJECTS_EXTRA = Object.values(tokens.colors.subjectsExtra);
export const SUBJECT_COLORS_WEB = [
  ...SUBJECT_COLORS_FREE,
  ...SUBJECTS_EXTRA.slice(0, MAX_SUBJECTS_WEB - SUBJECT_COLORS_FREE.length),
];
export const SUBJECT_COLORS_PRIME = [...SUBJECT_COLORS_FREE, ...SUBJECTS_EXTRA];

export const getSubjectColors = (userData) => {
  if (hasPrimeAccess(userData)) return SUBJECT_COLORS_PRIME;
  return Platform.OS === 'web' ? SUBJECT_COLORS_WEB : SUBJECT_COLORS_FREE;
};

/*
 * El widget de pantalla de inicio no aparece aquí a propósito: sus tres
 * tamaños son gratis. Es un mecanismo de retención (cuenta atrás + racha),
 * no una cuota, y reservar el 4x4 para Prime obligaba además a que ese
 * tamaño tuviera un segundo diseño — el del anuncio — que era justo lo que
 * veía quien no pagaba. Si algún día vuelve el gate, el modelo que dibuja
 * los widgets se construye en services/widgetData.js.
 */
