import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Local civil date (YYYY-MM-DD).
 *
 * Deliberately not `toISOString()`: that converts to UTC first, so east of
 * Greenwich every date built at local midnight slid back a day — and a session
 * studied between 00:00 and 02:00 was filed under yesterday. A streak is about
 * the user's own day, so it has to be computed in local time.
 */
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isToday = (dateString) => {
  if (!dateString) return false;
  const today = formatDate(new Date());
  // Handle both Date object and string
  const d = typeof dateString === 'string' ? dateString : formatDate(dateString);
  return d === today;
};

const isYesterday = (dateString) => {
  if (!dateString) return false;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = formatDate(yesterday);
  const d = typeof dateString === 'string' ? dateString : formatDate(dateString);
  return d === yStr;
};

/**
 * Rest days: a student doesn't study every day, and a streak that punishes that
 * stops being motivating. Each week grants a couple of skips that don't break
 * the run — spent automatically on the days actually missed, so nobody has to
 * declare which days they rest.
 */
export const MAX_REST_PER_WEEK = 2;

/** Monday-based week key, e.g. "2026-07-27". Weeks reset the allowance. */
const weekKeyOf = (dateString) => {
  const d = new Date(`${dateString}T00:00:00`);
  const dayOfWeek = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dayOfWeek);
  return formatDate(d);
};

const restUsedInWeekOf = (restDays, dateString) => {
  const key = weekKeyOf(dateString);
  return restDays.filter((d) => weekKeyOf(d) === key).length;
};

/** Dates strictly between two days, as YYYY-MM-DD. */
const daysBetweenExclusive = (fromString, toString) => {
  const out = [];
  const cursor = new Date(`${fromString}T00:00:00`);
  const end = new Date(`${toString}T00:00:00`);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor < end) {
    out.push(formatDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
};

/**
 * Try to absorb a gap in study days using the weekly rest allowance.
 * Returns the updated rest-day list, or null when the gap is too wide.
 */
const spendRestDays = (missedDates, restDays) => {
  const updated = [...restDays];
  for (const day of missedDates) {
    if (updated.includes(day)) continue; // already counted as rest
    if (restUsedInWeekOf(updated, day) >= MAX_REST_PER_WEEK) return null;
    updated.push(day);
  }
  return updated;
};

/** Keeps the stored list from growing without bound. */
const pruneRestDays = (restDays, keepDays = 90) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - keepDays);
  const cutoffStr = formatDate(cutoff);
  return restDays.filter((d) => d >= cutoffStr);
};

/** How many skips are still available in the week containing `date`. */
export const restDaysRemaining = (restDays = [], date = new Date()) =>
  Math.max(0, MAX_REST_PER_WEEK - restUsedInWeekOf(restDays, formatDate(date)));

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
export const checkDailyStreak = async (userId) => {
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
      };
    }

    const streakData = streakDoc.data();
    const lastStudy = streakData.lastStudyDate;
    const lastCheckIn = streakData.lastCheckIn;

    // If already checked in today, return current status
    if (lastCheckIn === today) {
      const needsActivity = (streakData.dailyActivity || 0) < 5;
      const restDays = streakData.restDays || [];
      return {
        currentStreak: streakData.currentStreak,
        maxStreak: streakData.maxStreak || 0,
        needsActivity,
        dailyActivity: streakData.dailyActivity || 0,
        restDays,
        restRemaining: restDaysRemaining(restDays),
      };
    }

    // New day - check if streak should break
    let newStreak = streakData.currentStreak;
    let restDays = pruneRestDays(streakData.restDays || []);

    if (lastStudy && isYesterday(lastStudy)) {
      // Streak continues (but needs activity today)
      // Don't increment yet, wait for activity
    } else if (lastStudy && !isToday(lastStudy)) {
      // There's a gap. Spend the weekly rest allowance on the missed days
      // before giving up on the streak; today doesn't count yet, it's still
      // in progress.
      const missed = daysBetweenExclusive(lastStudy, today);
      const afterRest = spendRestDays(missed, restDays);

      if (afterRest) {
        restDays = afterRest;
      } else {
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
      updatedAt: new Date(),
    });

    return {
      currentStreak: newStreak,
      maxStreak: streakData.maxStreak || 0,
      needsActivity: true,
      dailyActivity: 0,
      restDays,
      restRemaining: restDaysRemaining(restDays),
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
    const wasComplete = currentDailyActivity >= 5;
    const isNowComplete = newDailyActivity >= 5;

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
