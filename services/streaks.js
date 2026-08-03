import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

// Helper functions to replace date-fns
const formatDate = (date) => {
  return date.toISOString().split('T')[0];
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
      return { currentStreak: 0, maxStreak: 0, needsActivity: true, dailyActivity: 0 };
    }

    const streakData = streakDoc.data();
    const lastStudy = streakData.lastStudyDate;
    const lastCheckIn = streakData.lastCheckIn;

    // If already checked in today, return current status
    if (lastCheckIn === today) {
      const needsActivity = (streakData.dailyActivity || 0) < 5;
      return {
        currentStreak: streakData.currentStreak,
        maxStreak: streakData.maxStreak || 0,
        needsActivity,
        dailyActivity: streakData.dailyActivity || 0,
      };
    }

    // New day - check if streak should break
    let newStreak = streakData.currentStreak;

    if (lastStudy && isYesterday(lastStudy)) {
      // Streak continues (but needs activity today)
      // Don't increment yet, wait for activity
    } else if (lastStudy && !isToday(lastStudy)) {
      // Streak broken
      newStreak = 0;
    }

    // Update check-in and reset daily activity
    await updateDoc(streakRef, {
      lastCheckIn: today,
      dailyActivity: 0,
      currentStreak: newStreak,
      updatedAt: new Date(),
    });

    return {
      currentStreak: newStreak,
      maxStreak: streakData.maxStreak || 0,
      needsActivity: true,
      dailyActivity: 0,
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

      // If studied yesterday or this is first day, increment
      if (!lastStudy || lastStudy === today) {
        newStreak = 1;
      } else if (isYesterday(lastStudy)) {
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
