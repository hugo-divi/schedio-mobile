const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
// Deliberately not `firebase-functions/v2` — that barrel eagerly requires
// every v2 provider, including the Realtime Database one, which pulls in
// firebase-admin's RTDB compat layer and a `@firebase/app` import that isn't
// actually part of the deployed dependency tree. That's what was crashing the
// container on startup ("Cannot find module '@firebase/app'") even though
// nothing here touches RTDB — `v2/options` exports setGlobalOptions on its
// own, without the rest of the barrel.
const { setGlobalOptions } = require('firebase-functions/v2/options');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
setGlobalOptions({ region: 'europe-west1' });

const db = getFirestore();
const messaging = getMessaging();

const TIMEZONE = 'Europe/Madrid';
// EventModal's own sentinel for "no subject chosen" — a literal string, not
// null, so exams without a subject still need this exact check.
const UNASSIGNED_SUBJECT = 'undefined';

// ── Date helpers ─────────────────────────────────────────────────────────
// No date library: everything here is calendar-day arithmetic done through
// Intl (to read Madrid's Y/M/D) and Date.UTC (to add days without touching a
// timezone offset), so a DST transition never shifts which civil day we land
// on the way a raw milliseconds shift could.

const madridYMD = (date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day') };
};

/** 'YYYY-MM-DD' for the Madrid calendar day `date` falls on. */
const madridDateKey = (date) => {
  const { year, month, day } = madridYMD(date);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
};

/** 'YYYY-MM-DD' for today + offsetDays, as a Madrid calendar day. */
const madridDateKeyOffset = (offsetDays) => {
  const { year, month, day } = madridYMD(new Date());
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10);
};

const joinSpanish = (items) => {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
};

// ── Shared notification helpers ─────────────────────────────────────────
// Hierarchy from the spec — exam alert > weekly summary > re-engagement, at
// most one push a day. `lastNotifiedDate` is the single flag all three
// categories read and write; whichever runs first for a user on a given day
// wins, since exam alerts (08:05) and re-engagement (08:10) both run before
// weekly summary (Sundays 20:00) — the one edge case this doesn't resolve
// "correctly" against the stated priority is a Sunday where re-engagement
// fires that morning *and* the user would also have qualified for the
// weekly summary that evening: re-engagement wins by running first, not the
// higher-priority summary. Rare (re-engagement needs 4+ inactive days, the
// summary needs a session that same week) and not worth a cross-time-of-day
// override for.

const alreadyNotifiedToday = (userData) => userData.lastNotifiedDate === madridDateKey(new Date());

const markNotifiedToday = (uid) =>
  db
    .collection('users')
    .doc(uid)
    .update({ lastNotifiedDate: madridDateKey(new Date()) });

/** Sends one push; clears the token if it's dead so later runs stop retrying it. */
const sendToUser = async (uid, fcmToken, notification) => {
  try {
    await messaging.send({ token: fcmToken, notification });
    return true;
  } catch (error) {
    const deadToken =
      error.code === 'messaging/registration-token-not-registered' ||
      error.code === 'messaging/invalid-argument';
    if (deadToken) {
      logger.info(`Clearing dead fcmToken for user ${uid}`, { code: error.code });
      await db.collection('users').doc(uid).update({ fcmToken: null });
    } else {
      logger.error(`Failed to notify user ${uid}`, error);
    }
    return false;
  }
};

const subjectNameFor = async (exam) => {
  if (!exam.subjectId || exam.subjectId === UNASSIGNED_SUBJECT) return exam.name;
  const snap = await db.collection('subjects').doc(exam.subjectId).get();
  return snap.exists ? snap.data().name : exam.name;
};

// ── Category 1: exam alerts ──────────────────────────────────────────────

const EXAM_COPY = {
  3: (subject) =>
    `Tu examen de ${subject} es en 3 días. Aún tienes margen para organizarlo con calma.`,
  1: (subject) => `Mañana es tu examen de ${subject}. Repasa lo esencial hoy y descansa bien.`,
};

const queryExamsForOffset = async (offsetDays) => {
  const field = offsetDays === 3 ? 'notified3Days' : 'notified1Day';
  const targetKey = madridDateKeyOffset(offsetDays);

  // A generous, fixed UTC window that safely contains both the +1d and +3d
  // targets regardless of which offset called us — the precise match against
  // `targetKey` below is what actually decides inclusion.
  const rangeStart = new Date(Date.now() - 86400000);
  const rangeEnd = new Date(Date.now() + 4 * 86400000);

  const snap = await db
    .collection('exams')
    .where('completed', '==', false)
    .where(field, '==', false)
    .where('date', '>=', rangeStart)
    .where('date', '<', rangeEnd)
    .get();

  return snap.docs
    .map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))
    .filter((exam) => exam.date && madridDateKey(exam.date.toDate()) === targetKey);
};

exports.examAlerts = onSchedule({ schedule: '5 8 * * *', timeZone: TIMEZONE }, async () => {
  for (const offsetDays of [3, 1]) {
    const exams = await queryExamsForOffset(offsetDays);
    if (exams.length === 0) continue;

    const byUser = new Map();
    for (const exam of exams) {
      if (!byUser.has(exam.userId)) byUser.set(exam.userId, []);
      byUser.get(exam.userId).push(exam);
    }

    for (const [uid, userExams] of byUser) {
      const userSnap = await db.collection('users').doc(uid).get();
      const fcmToken = userSnap.get('fcmToken');
      if (!fcmToken) continue;

      const names = await Promise.all(userExams.map(subjectNameFor));
      const body =
        names.length === 1
          ? EXAM_COPY[offsetDays](names[0])
          : `Tienes ${names.length} exámenes próximos: ${joinSpanish(names)}.`;

      const sent = await sendToUser(uid, fcmToken, { title: 'Schedio', body });
      if (!sent) continue;

      const field = offsetDays === 3 ? 'notified3Days' : 'notified1Day';
      await Promise.all(userExams.map((exam) => exam.ref.update({ [field]: true })));
      await markNotifiedToday(uid);
    }
  }
});

// ── Category 2: re-engagement ────────────────────────────────────────────

const REENGAGEMENT_COPY =
  'Hace unos días que no entras en Schedio. Cuando quieras retomarlo, todo sigue donde lo dejaste.';
const INACTIVE_DAYS = 4;
const REENGAGEMENT_COOLDOWN_DAYS = 7;

// 5 minutes after examAlerts, so today's lastNotifiedDate write (if any) has
// already landed before this reads it.
exports.reengagement = onSchedule({ schedule: '10 8 * * *', timeZone: TIMEZONE }, async () => {
  const cutoff = new Date(Date.now() - INACTIVE_DAYS * 86400000);

  const usersSnap = await db.collection('users').where('lastOpenTimestamp', '<=', cutoff).get();

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    if (!data.fcmToken) continue;
    if (alreadyNotifiedToday(data)) continue;

    const lastSent = data.lastReengagementSentAt?.toDate?.();
    const cooledDown =
      !lastSent || Date.now() - lastSent.getTime() >= REENGAGEMENT_COOLDOWN_DAYS * 86400000;
    if (!cooledDown) continue;

    const sent = await sendToUser(doc.id, data.fcmToken, {
      title: 'Schedio',
      body: REENGAGEMENT_COPY,
    });
    if (!sent) continue;

    await doc.ref.update({
      lastReengagementSentAt: FieldValue.serverTimestamp(),
      lastNotifiedDate: madridDateKey(new Date()),
    });
  }
});

// ── Category 3: weekly summary ───────────────────────────────────────────

exports.weeklySummary = onSchedule({ schedule: '0 20 * * 0', timeZone: TIMEZONE }, async () => {
  const weekAgo = new Date(Date.now() - 7 * 86400000);

  // A full collection scan is fine at this scale (private beta); revisit if
  // the user base grows enough to make it worth an index-backed filter.
  const usersSnap = await db.collection('users').get();

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    if (!data.fcmToken) continue;
    if (alreadyNotifiedToday(data)) continue;

    const sessionsSnap = await db
      .collection('sessions')
      .where('userId', '==', doc.id)
      .where('date', '>=', weekAgo)
      .get();

    const count = sessionsSnap.size;
    if (count === 0) continue; // no positive reinforcement to give — stay silent

    const sent = await sendToUser(doc.id, data.fcmToken, {
      title: 'Schedio',
      body: `Esta semana completaste ${count} sesiones de estudio. Buen ritmo.`,
    });
    if (!sent) continue;

    await doc.ref.update({ lastNotifiedDate: madridDateKey(new Date()) });
  }
});

// ── AI proxy ──────────────────────────────────────────────────────────────
// The client used to call Gemini directly with a key shipped in the app
// bundle — extractable from any distributed APK, so effectively public, and
// nothing stopped someone who pulled it out from hammering it outside the
// app entirely. Routing through here fixes both at once: the key never
// leaves the server, and every call is tied to a real signed-in user, which
// is what makes a per-user quota actually enforceable rather than
// decorative.

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Fresh AI calls per user per day; once hit, aiProxy replays that day's last
// real recommendation instead of calling Gemini again — still feels live
// (opening the app doesn't show a canned message) without the cost or abuse
// surface of an unlimited backend.
const AI_DAILY_LIMIT = 5;
const MAX_PROMPT_LENGTH = 8000;

const callGemini = async (prompt, attempt = 0) => {
  const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY.value()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, topK: 40, topP: 0.95, maxOutputTokens: 1024 },
    }),
  });

  if (!response.ok) {
    // Bounded, unlike the client's old version of this — that one recursed
    // on every 500/503 with no cap, which during a real Gemini outage meant
    // retrying forever instead of failing.
    if ((response.status === 500 || response.status === 503) && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      return callGemini(prompt, attempt + 1);
    }
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text;
};

exports.aiProxy = onCall({ secrets: [GEMINI_API_KEY] }, async (request) => {
  // onCall verifies the Firebase Auth ID token itself — request.auth is only
  // populated once that's checked, so this is the whole authentication step.
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const prompt = request.data?.prompt;
  if (!prompt || typeof prompt !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el prompt.');
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new HttpsError('invalid-argument', 'El prompt es demasiado largo.');
  }

  const uid = request.auth.uid;
  const usageRef = db.collection('users').doc(uid).collection('meta').doc('aiUsage');
  const usageSnap = await usageRef.get();
  const usage = usageSnap.exists ? usageSnap.data() : null;
  const todayKey = madridDateKey(new Date());
  const sameDay = usage?.date === todayKey;
  const countSoFar = sameDay ? (usage.count ?? 0) : 0;

  if (countSoFar >= AI_DAILY_LIMIT) {
    // Replay today's last real recommendation rather than calling Gemini
    // again. `text: null` is the signal for the rare case there isn't one
    // yet to replay — the client falls back to its own local logic then.
    return { text: sameDay ? (usage.lastRecommendation ?? null) : null, limited: true };
  }

  const text = await callGemini(prompt);

  await usageRef.set({ date: todayKey, count: countSoFar + 1, lastRecommendation: text });

  return { text, limited: false };
});
