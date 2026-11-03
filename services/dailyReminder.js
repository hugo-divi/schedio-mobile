import { Platform } from 'react-native';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from './firebase';
import { canRequestWebPush } from './pwa';
import { registerForPushNotifications } from './notificationService';
import useUserStore from '../store/userStore';
// The same rules the scheduled function runs (functions/dailyReminder.js is
// pure CommonJS with nothing but Intl), so the preview is the real sentence.
import {
  DEFAULT_TIME,
  SUPPORTED_TIMEZONES,
  allTimes,
  decideDailyReminder,
  isValidTime,
  reminderKey,
} from '../functions/dailyReminder';

export { allTimes, isValidTime, DEFAULT_TIME };

/**
 * The zone the reminder's time is read in. The device's own when it is one we
 * support (the Peninsula or the Canaries — "a las 17:00" has to mean 17:00
 * where the student is), the region from onboarding otherwise.
 */
export const reminderTimeZone = (region) => {
  let device = null;
  try {
    device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    device = null;
  }
  if (SUPPORTED_TIMEZONES.includes(device)) return device;
  return region === 'CN' ? 'Atlantic/Canary' : 'Europe/Madrid';
};

/**
 * A first suggestion: a quarter of an hour before the student usually starts
 * studying. Sessions are stored at their end, so the start is that minus the
 * duration. Without three sessions to go on, 17:00 — after class and lunch.
 */
export const suggestReminderTime = (sessions) => {
  const starts = (sessions || [])
    .map((s) => {
      const end = new Date(s?.date);
      const minutes = Number(s?.duration) || 0;
      if (Number.isNaN(end.getTime())) return null;
      return new Date(end.getTime() - minutes * 60 * 1000);
    })
    .filter(Boolean);
  if (starts.length < 3) return DEFAULT_TIME;

  const counts = new Map();
  starts.forEach((d) => counts.set(d.getHours(), (counts.get(d.getHours()) || 0) + 1));
  const [hour] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const minutes = Math.min(21 * 60 + 45, Math.max(7 * 60, hour * 60 - 15));
  const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  return isValidTime(time) ? time : DEFAULT_TIME;
};

/** Moves a time by `steps` quarters of an hour, staying inside 07:00–22:00. */
export const shiftTime = (time, steps) => {
  const times = allTimes();
  const index = Math.max(0, times.indexOf(isValidTime(time) ? time : DEFAULT_TIME));
  return times[Math.min(times.length - 1, Math.max(0, index + steps))];
};

/**
 * Makes sure a push can actually reach this device before turning the
 * reminder on — a reminder saved without a token would silently never
 * arrive. Returns `'ok'`, `'install'` (an iPhone tab that has to be added to
 * the home screen first) or `'denied'`.
 */
export async function ensurePushReady(uid) {
  if (Platform.OS === 'web' && !canRequestWebPush()) return 'install';
  try {
    return (await registerForPushNotifications(uid)) ? 'ok' : 'denied';
  } catch {
    return 'denied';
  }
}

/**
 * Saves the reminder. `dailyReminderKey` is what the function queries by
 * ("Europe/Madrid@17:00"); turning the reminder off deletes it, so an
 * account that doesn't want it is never even read.
 */
export async function saveDailyReminder(uid, { enabled, time, includeFreeDays }) {
  const { profile } = useUserStore.getState();
  const tz = reminderTimeZone(profile?.region);
  const safeTime = isValidTime(time) ? time : DEFAULT_TIME;
  const settings = {
    enabled: !!enabled,
    time: safeTime,
    tz,
    includeFreeDays: !!includeFreeDays,
    updatedAt: new Date().toISOString(),
  };
  await updateDoc(doc(db, 'users', uid), {
    dailyReminder: settings,
    dailyReminderKey: settings.enabled ? reminderKey(tz, safeTime) : deleteField(),
  });
  useUserStore.setState((state) => ({
    profile: state.profile ? { ...state.profile, dailyReminder: settings } : state.profile,
  }));
  return settings;
}

/**
 * What the reminder would say today, run through the server's own decision.
 * Free days are left out on purpose: the preview shows the sentence, not
 * whether today happens to be one of them.
 */
export const previewDailyReminder = ({ microplans, exams, stats, includeFreeDays }) => {
  const now = new Date();
  const decision = decideDailyReminder({
    now,
    betaOnly: false,
    user: {
      dailyReminder: { enabled: true, tz: reminderTimeZone(null), includeFreeDays },
      fcmToken: 'preview',
      microplans,
      // The plan on screen is the current one, whatever day it was saved.
      stats: { ...stats, lastPlanGenerationDate: now.toDateString() },
      dailyReminderState: {},
      lastOpenTimestamp: now,
    },
    streak: { freeDays: [], restDays: [] },
    exams,
  });
  if (decision.send) return { title: decision.title, body: decision.body };
  return {
    title: null,
    body:
      decision.reason === 'plan-done'
        ? 'Hoy ya has hecho tu plan, así que hoy no te escribiría.'
        : 'Hoy no tienes nada en el plan, así que hoy no te escribiría. Te avisaría de un examen cercano.',
  };
};
