/**
 * Permissions Service
 * Centralized logic for validating user plans and feature access.
 * 🛡️ SECURITY NOTE: While validated here, critical features should also check
 * entitlement status on the backend (e.g., via Cloud Functions).
 */

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
export const MAX_SUBJECTS_PRIME = 20;

export const getMaxSubjects = (userData) =>
  hasPrimeAccess(userData) ? MAX_SUBJECTS_PRIME : MAX_SUBJECTS_FREE;

/**
 * Colores de materia: la paleta gratuita cubre justo MAX_SUBJECTS_FREE (8).
 * Prime sube el tope a 20, así que necesita los 12 tonos extra o dos materias
 * acabarían compartiendo color.
 */
export const SUBJECT_COLORS_FREE = Object.values(tokens.colors.subjects);
export const SUBJECT_COLORS_PRIME = [
  ...SUBJECT_COLORS_FREE,
  ...Object.values(tokens.colors.subjectsExtra),
];

export const getSubjectColors = (userData) =>
  hasPrimeAccess(userData) ? SUBJECT_COLORS_PRIME : SUBJECT_COLORS_FREE;
