import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

import {
  DAILY_GOAL_MINUTES,
  MAX_REST_PER_WEEK,
  DEFAULT_FREE_DAYS,
  MAX_FREE_DAYS,
  formatDate,
  isFreeDay,
  sanitizeFreeDays,
  daysBetweenExclusive,
  gapIsCovered,
  canSpendJokerOn,
  pruneRestDays,
  restDaysRemaining,
} from './streakRules';

// Reexportadas porque StreakDetail y la pantalla de racha ya las importaban de
// aqui; las reglas en si viven en streakRules.js para poder ejecutarse en Node.
export {
  DAILY_GOAL_MINUTES,
  MAX_REST_PER_WEEK,
  DEFAULT_FREE_DAYS,
  MAX_FREE_DAYS,
  sanitizeFreeDays,
  restDaysRemaining,
};

const isToday = (dateString) => {
  if (!dateString) return false;
  const d = typeof dateString === 'string' ? dateString : formatDate(dateString);
  return d === formatDate(new Date());
};

const isYesterday = (dateString) => {
  if (!dateString) return false;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const d = typeof dateString === 'string' ? dateString : formatDate(dateString);
  return d === formatDate(yesterday);
};

/**
 * "Hoy no puedo": gasta un comodín en el día de hoy.
 *
 * Esta es la pieza que antes no existía. El alumno decide, y por eso el día
 * deja de ser un fallo — la diferencia entre "he perdido un día" y "me he
 * tomado un día" es entera de aquí.
 *
 * Devuelve los comodines que quedan, o `null` si no se podía gastar: sin
 * comodines esa semana, o en un día que ya está cubierto (libre o gastado),
 * donde gastarlo sería tirarlo.
 */
export const spendJoker = async (userId) => {
  const streakRef = doc(db, 'streaks', userId);
  const streakDoc = await getDoc(streakRef);
  if (!streakDoc.exists()) return null;

  const data = streakDoc.data();
  const today = formatDate(new Date());
  const freeDays = sanitizeFreeDays(data.freeDays);
  const restDays = pruneRestDays(data.restDays || []);

  // La misma regla que comprueba la pantalla para habilitar el botón, no una
  // copia — si se separan, el botón se enciende y la escritura falla.
  if (!canSpendJokerOn(today, { restDays, freeDays }).allowed) return null;

  const updated = [...restDays, today];
  await updateDoc(streakRef, { restDays: updated, updatedAt: new Date() });
  return { restDays: updated, restRemaining: restDaysRemaining(updated) };
};

/**
 * Los días de la semana que marcas libres. El plan no te programa nada en
 * ellos, así que no cuentan para la racha ni a favor ni en contra.
 */
export const setFreeDays = async (userId, days) => {
  const freeDays = sanitizeFreeDays(days);
  await updateDoc(doc(db, 'streaks', userId), { freeDays, updatedAt: new Date() });
  return freeDays;
};

/**
 * Get user streak data
 * @param {string} userId
 */
export const getStreak = async (userId) => {
  try {
    const streakDoc = await getDoc(doc(db, 'streaks', userId));
    if (streakDoc.exists()) {
      return { id: streakDoc.id, ...streakDoc.data() };
    }
    // Initialize if doesn't exist
    const initialStreak = {
      currentStreak: 0,
      maxStreak: 0,
      lastStudyDate: null,
      totalStudyDays: 0,
      updatedAt: new Date(),
    };
    await setDoc(doc(db, 'streaks', userId), initialStreak);
    return initialStreak;
  } catch (error) {
    console.error('Error getting streak:', error);
    throw error;
  }
};

/**
 * Check and update daily streak on app load
 * @param {string} userId
 */
export const checkDailyStreak = async (userId, { hasPlan = true } = {}) => {
  try {
    const streakRef = doc(db, 'streaks', userId);
    const streakDoc = await getDoc(streakRef);
    const today = formatDate(new Date());

    if (!streakDoc.exists()) {
      // Initialize streak
      await setDoc(streakRef, {
        currentStreak: 0,
        maxStreak: 0,
        lastStudyDate: null,
        lastCheckIn: today,
        totalStudyDays: 0,
        dailyActivity: 0, // minutes today
        updatedAt: new Date(),
      });
      return {
        currentStreak: 0,
        maxStreak: 0,
        needsActivity: true,
        dailyActivity: 0,
        restDays: [],
        restRemaining: MAX_REST_PER_WEEK,
        freeDays: DEFAULT_FREE_DAYS,
        frozen: !hasPlan,
        todayIsFree: isFreeDay(today, DEFAULT_FREE_DAYS),
      };
    }

    const streakData = streakDoc.data();
    const lastStudy = streakData.lastStudyDate;
    const lastCheckIn = streakData.lastCheckIn;
    const freeDays = sanitizeFreeDays(streakData.freeDays);
    const todayIsFree = isFreeDay(today, freeDays);

    // If already checked in today, return current status
    if (lastCheckIn === today) {
      const restDays = streakData.restDays || [];
      return {
        currentStreak: streakData.currentStreak,
        maxStreak: streakData.maxStreak || 0,
        // Un día libre, o sin plan que cumplir, no pide nada — así que tampoco
        // se queda "pendiente de actividad".
        needsActivity:
          !todayIsFree && hasPlan && (streakData.dailyActivity || 0) < DAILY_GOAL_MINUTES,
        dailyActivity: streakData.dailyActivity || 0,
        restDays,
        restRemaining: restDaysRemaining(restDays),
        freeDays,
        frozen: !hasPlan,
        todayIsFree,
      };
    }

    // New day - check if streak should break
    let newStreak = streakData.currentStreak;
    let restDays = pruneRestDays(streakData.restDays || []);

    if (lastStudy && isYesterday(lastStudy)) {
      // Streak continues (but needs activity today)
      // Don't increment yet, wait for activity
    } else if (lastStudy && !isToday(lastStudy) && hasPlan) {
      // Hay un hueco. Solo sobrevive si cada día estaba cubierto: libre por
      // calendario, o con un comodín ya gastado a mano ese día. Antes se
      // gastaban comodines aquí en silencio; ahora un día descubierto rompe.
      //
      // Con `hasPlan` en falso ni se mira: sin exámenes no hay plan, y sin
      // plan no hay nada que hayas dejado de hacer.
      const missed = daysBetweenExclusive(lastStudy, today);
      if (!gapIsCovered(missed, restDays, freeDays)) {
        newStreak = 0;
        restDays = [];
      }
    }

    // Update check-in and reset daily activity
    await updateDoc(streakRef, {
      lastCheckIn: today,
      dailyActivity: 0,
      currentStreak: newStreak,
      restDays,
      freeDays,
      updatedAt: new Date(),
    });

    return {
      currentStreak: newStreak,
      maxStreak: streakData.maxStreak || 0,
      needsActivity: !todayIsFree && hasPlan,
      dailyActivity: 0,
      restDays,
      restRemaining: restDaysRemaining(restDays),
      freeDays,
      frozen: !hasPlan,
      todayIsFree,
    };
  } catch (error) {
    console.error('Error checking daily streak:', error);
    throw error;
  }
};

/**
 * Record activity (study or review) and update streak
 * @param {string} userId
 * @param {number} activityDuration - Duration in minutes
 */
export const recordActivity = async (userId, activityDuration) => {
  try {
    const streakRef = doc(db, 'streaks', userId);
    let streakDoc = await getDoc(streakRef);
    const today = formatDate(new Date());

    if (!streakDoc.exists() || streakDoc.data().lastCheckIn !== today) {
      await checkDailyStreak(userId);
      streakDoc = await getDoc(streakRef);
    }

    const streakData = streakDoc.data();
    const lastStudy = streakData.lastStudyDate;
    const currentDailyActivity = streakData.dailyActivity || 0;
    const newDailyActivity = currentDailyActivity + activityDuration;

    // Check if this completes the daily requirement
    const wasComplete = currentDailyActivity >= DAILY_GOAL_MINUTES;
    const isNowComplete = newDailyActivity >= DAILY_GOAL_MINUTES;

    let updates = {
      dailyActivity: newDailyActivity,
      updatedAt: new Date(),
    };

    // If just completed the 5-min requirement today
    if (!wasComplete && isNowComplete) {
      let newStreak = streakData.currentStreak;

      // A gap already absorbed by rest days must not reset the streak here —
      // checkDailyStreak spent the allowance to keep it alive, and restarting
      // at 1 would undo that. (An empty gap trivially satisfies this, which is
      // the ordinary "studied yesterday" case.)
      const restDays = streakData.restDays || [];
      const gapIsRest =
        !!lastStudy && daysBetweenExclusive(lastStudy, today).every((d) => restDays.includes(d));

      if (!lastStudy || lastStudy === today) {
        newStreak = 1;
      } else if (isYesterday(lastStudy) || gapIsRest) {
        newStreak += 1;
      } else {
        newStreak = 1; // Streak broken, restart
      }

      const newMaxStreak = Math.max(newStreak, streakData.maxStreak || 0);

      updates = {
        ...updates,
        currentStreak: newStreak,
        maxStreak: newMaxStreak,
        lastStudyDate: today,
        totalStudyDays: (streakData.totalStudyDays || 0) + 1,
      };
    }

    await updateDoc(streakRef, updates);

    return {
      dailyActivity: newDailyActivity,
      streakUpdated: !wasComplete && isNowComplete,
      currentStreak: updates.currentStreak || streakData.currentStreak,
    };
  } catch (error) {
    console.error('Error recording activity:', error);
    throw error;
  }
};

/**
 * Update streak after a study session (legacy - now uses recordActivity)
 * @param {string} userId
 * @param {number} sessionDuration - Duration in minutes
 */
export const updateStreak = async (userId, sessionDuration) => {
  try {
    // Use new recordActivity function
    return await recordActivity(userId, sessionDuration);
  } catch (error) {
    console.error('Error updating streak:', error);
    throw error;
  }
};

/**
 * Get streak calendar for last 30 days
 * @param {string} userId
 */
export const getStreakCalendar = async (userId) => {
  try {
    const streakDoc = await getDoc(doc(db, 'streaks', userId));
    if (!streakDoc.exists()) {
      return [];
    }

    const streakData = streakDoc.data();
    const today = new Date();
    const calendar = [];

    // Generate last 30 days
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = formatDate(date);

      // Check if studied on this day
      const studied =
        streakData.lastStudyDate &&
        dateStr <= streakData.lastStudyDate &&
        (streakData.totalStudyDays || 0) > 0;

      calendar.push({
        date: dateStr,
        studied,
        isToday: isToday(date),
      });
    }

    return calendar;
  } catch (error) {
    console.error('Error getting streak calendar:', error);
    return [];
  }
};
