import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { toDate, daysBetween } from './priority';

/**
 * Firestore docs -> exam objects whose `date` is always a real Date.
 *
 * The date was read inline as `doc.data().date.toDate ? ... : new Date(...)`,
 * which throws outright when the field is missing rather than skipping the doc.
 * Anything undated is dropped here (loudly), so every consumer downstream can
 * assume `exam.date` is valid.
 */
const mapExamDocs = (snapshot) =>
  snapshot.docs
    .map((d) => ({ ...d.data(), id: d.id, date: toDate(d.data().date) }))
    .filter((exam) => {
      if (exam.date) return true;
      console.warn(`Skipping exam ${exam.id}: unreadable date`, exam);
      return false;
    });

/**
 * Get upcoming exams for a user
 * @param {string} userId
 * @param {number} limitCount - Number of exams to return
 */
export const getUpcomingExams = async (userId, limitCount = 10) => {
  try {
    const now = new Date();
    const q = query(collection(db, 'exams'), where('userId', '==', userId));

    const exams = mapExamDocs(await getDocs(q));

    // Filter and sort client-side to avoid complex index requirements
    return (
      exams
        // Compared by calendar day, not by instant: the old `exam.date >= now`
        // dropped an exam set for today at 9:00 as soon as the clock hit 9:01,
        // which is precisely the day the student most needs to see it.
        .filter((exam) => !exam.completed && daysBetween(now, exam.date) >= 0)
        .sort((a, b) => a.date - b.date)
        .slice(0, limitCount)
    );
  } catch (error) {
    console.error('Error getting upcoming exams:', error);
    throw error;
  }
};

/**
 * Get every exam for a user, completed or not — used by the Prime data export,
 * which needs the full picture rather than any one of the filtered views above.
 * @param {string} userId
 */
export const getAllExams = async (userId) => {
  try {
    const q = query(collection(db, 'exams'), where('userId', '==', userId));
    return mapExamDocs(await getDocs(q)).sort((a, b) => a.date - b.date);
  } catch (error) {
    console.error('Error getting all exams:', error);
    throw error;
  }
};

/**
 * Get pending exams (past date but not completed)
 * @param {string} userId
 */
export const getPendingExams = async (userId) => {
  try {
    const now = new Date();
    const q = query(
      collection(db, 'exams'),
      where('userId', '==', userId),
      where('completed', '==', false) // Only get incomplete ones
    );

    const exams = mapExamDocs(await getDocs(q));

    // Filter for exams in the PAST. Same calendar-day comparison as
    // getUpcomingExams, so the two are exact complements and an exam can
    // never be both (or neither) on its own day.
    return exams.filter((exam) => daysBetween(now, exam.date) < 0).sort((a, b) => b.date - a.date); // Most recent first
  } catch (error) {
    console.error('Error getting pending exams:', error);
    throw error;
  }
};

/**
 * Get completed exams (grades history) for a user
 * @param {string} userId
 * @param {number} limitCount
 */
export const getCompletedExams = async (userId, limitCount = 20) => {
  try {
    const q = query(
      collection(db, 'exams'),
      where('userId', '==', userId),
      where('completed', '==', true)
    );

    // Sort client-side to avoid compound index requirements
    return mapExamDocs(await getDocs(q))
      .sort((a, b) => b.date - a.date)
      .slice(0, limitCount);
  } catch (error) {
    console.error('Error getting completed exams:', error);
    throw error;
  }
};

/**
 * Create a new exam/task
 * @param {Object} examData
 */
export const createExam = async (examData) => {
  try {
    const docRef = await addDoc(collection(db, 'exams'), {
      // Cloud Functions' exam-alert cron flips these once the 3-day/1-day
      // notice has gone out, so every exam needs to start unnotified.
      notified3Days: false,
      notified1Day: false,
      ...examData,
      createdAt: new Date(),
    });
    return { id: docRef.id, ...examData };
  } catch (error) {
    console.error('Error creating exam:', error);
    throw error;
  }
};

/**
 * Update an exam/task
 * @param {string} examId
 * @param {Object} updates
 */
export const updateExam = async (examId, updates) => {
  try {
    await updateDoc(doc(db, 'exams', examId), {
      ...updates,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error updating exam:', error);
    throw error;
  }
};

/**
 * Delete an exam/task
 * @param {string} examId
 */
export const deleteExam = async (examId) => {
  if (!examId) {
    console.error('deleteExam called without ID');
    return;
  }
  try {
    console.log(`Attempting to delete exam: ${examId}`);
    await deleteDoc(doc(db, 'exams', examId));
    console.log(`Successfully deleted exam: ${examId}`);
  } catch (error) {
    console.error('Error deleting exam:', error);
    throw error;
  }
};

// `calculatePriority` used to live here. It was dead code — nothing ever
// imported it — and its stepped 10/9/8 scale made an exam in 3 days score the
// same as one in 10. Scoring now lives in services/priority.js, which is the
// only place that computes it. See `computeExamPriority` / `rankExams`.

// ── Fechas del aula ──────────────────────────────────────────────────────
// Lo que decide qué escribir está en services/classDates.js (puro y con su
// check); aquí solo se escribe. Todas devuelven lo escrito para que la
// pantalla del aula pueda actualizarse sin volver a leer.

/** "Añadir a mi calendario". */
export const addClassDateToCalendar = async (classDate, { userId, subject = null } = {}) => {
  const { examFromClassDate } = await import('./classDates');
  return createExam(examFromClassDate(classDate, { userId, subject }));
};

/** "Añadir todas" las que faltan (las dudosas se deciden una a una). */
export const addAllClassDatesToCalendar = async (classDates, exams, { userId, subjects } = {}) => {
  const { examsToAddAll } = await import('./classDates');
  const toAdd = examsToAddAll(classDates, exams, { userId, subjects });
  return Promise.all(toAdd.map((exam) => createExam(exam)));
};

/** "Es el mismo": vincula tu examen y se queda con tu fecha. */
export const linkClassDate = async (examId, classDate) => {
  const { linkUpdates } = await import('./classDates');
  const updates = linkUpdates(classDate);
  await updateExam(examId, updates);
  return updates;
};

/** "Mover el mío" a la fecha nueva del aula. */
export const acceptClassDateChange = async (examId, classDate) => {
  const { acceptChangeUpdates } = await import('./classDates');
  const updates = acceptChangeUpdates(classDate);
  await updateExam(examId, updates);
  return updates;
};

/** "Dejar la mía". */
export const keepMyExamDate = async (examId, classDate) => {
  const { keepMineUpdates } = await import('./classDates');
  const updates = keepMineUpdates(classDate);
  await updateExam(examId, updates);
  return updates;
};

/**
 * Apunta en tu examen un cambio del aula aún sin decidir, para que la
 * notificación del día lo cuente si no entras a resolverlo. No escribe si
 * ya estaba apuntado.
 */
export const markPendingClassChange = async (exam, classDate) => {
  const { pendingChangeUpdates } = await import('./classDates');
  const updates = pendingChangeUpdates(exam, classDate);
  if (!updates) return null;
  await updateExam(exam.id, updates);
  return updates;
};
