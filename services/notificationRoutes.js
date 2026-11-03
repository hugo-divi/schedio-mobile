/**
 * Where a tap on one of our pushes should land.
 *
 * Every push from functions/index.js carries `data.kind` (and `data.examId`
 * when it is about one exam). Tapping one used to open the app wherever it
 * happened to start: the listener in app/_layout.js only logged, and the
 * messages had no `data` at all. So "Mañana es tu examen de Química" opened
 * Inicio, and the student had to go and find the plan for that exam themselves.
 *
 * Pure — no React Native, no Firebase — so scripts/check-notification-routes.mjs
 * runs it in Node. The web service worker (public/firebase-messaging-sw.js)
 * can't import this, so it keeps a copy of `pathForNotification`; that script
 * extracts the copy from the worker and checks the two give the same answer for
 * every case, so they can't drift apart silently.
 */

export const NOTIFICATION_KINDS = {
  EXAM_ALERT: 'exam_alert',
  REENGAGEMENT: 'reengagement',
  WEEKLY_SUMMARY: 'weekly_summary',
  ABANDONED_ONBOARDING: 'abandoned_onboarding',
  DAILY_PLAN: 'daily_plan',
};

/**
 * Firestore auto-ids are 20 alphanumerics. Anything outside this shape is not
 * one of ours, and it is about to become a route param, so it is dropped
 * rather than passed through.
 */
const EXAM_ID = /^[A-Za-z0-9_-]{1,128}$/;
const cleanExamId = (value) => (typeof value === 'string' && EXAM_ID.test(value) ? value : null);

/**
 * An expo-router href object, or `null` for "nothing to do beyond opening the
 * app".
 *
 * Exam alerts and the exam-aware re-engagement push open the Plan on that
 * exam — the same thing tapping the exam on Inicio does. The weekly summary
 * counts sessions, so it opens the streak screen, which is where those days
 * are drawn. The daily plan reminder opens Inicio.
 *
 * `abandoned_onboarding` gets no route on purpose: opening the app goes
 * through `/`, and `/` already sends an unfinished account back into the
 * onboarding. Anything unknown — a payload from an older server, a malformed
 * one — is treated the same way.
 */
export const routeForNotification = (data) => {
  if (!data || typeof data !== 'object') return null;
  const examId = cleanExamId(data.examId);

  switch (data.kind) {
    case NOTIFICATION_KINDS.EXAM_ALERT:
    case NOTIFICATION_KINDS.REENGAGEMENT:
      return examId
        ? { pathname: '/dashboard/plans', params: { highlightId: examId } }
        : { pathname: '/dashboard/plans' };
    case NOTIFICATION_KINDS.WEEKLY_SUMMARY:
      return { pathname: '/dashboard/streak' };
    // The daily reminder lands on Inicio, where "Hoy" has the plan and its
    // "Empezar" button — one tap from the push, not a timer that starts on
    // its own the moment the student glances at their phone.
    case NOTIFICATION_KINDS.DAILY_PLAN:
      return { pathname: '/dashboard' };
    default:
      return null;
  }
};

/** The same destination as a URL path — what the web service worker opens. */
export const pathForNotification = (data) => {
  const route = routeForNotification(data);
  if (!route) return '/';
  const query = new URLSearchParams(route.params || {}).toString();
  return query ? `${route.pathname}?${query}` : route.pathname;
};
