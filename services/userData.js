import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  deleteDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { MANUAL_PRIORITY_NEUTRAL } from './priority';

/**
 * Save onboarding data and create initial user setup
 * @param {string} userId
 * @param {Object} data - Onboarding form data
 */
export const saveOnboardingData = async (userId, data) => {
  console.log('saveOnboardingData called with:', {
    userId,
    subjectCount: data.subjects?.length,
    data,
  });
  try {
    // Update user profile
    await updateDoc(doc(db, 'users', userId), {
      course: data.course,
      grade: data.grade,
      organizationLevel: data.organizationLevel,
      onboardingCompleted: true,
      isNewAccount: true,
      updatedAt: new Date(),
    });

    // Create subjects
    const subjectsPromises = data.subjects.map((subject) =>
      addDoc(collection(db, 'subjects'), {
        userId,
        name: subject.name,
        difficulty: subject.difficulty,
        color: subject.color || generateRandomColor(),
        createdAt: new Date(),
      })
    );
    await Promise.all(subjectsPromises);

    // Create exams if provided
    if (data.exams && data.exams.length > 0) {
      const examsPromises = data.exams.map((exam) =>
        addDoc(collection(db, 'exams'), {
          userId,
          name: exam.name,
          type: 'exam',
          subjectId: exam.subjectId,
          date: exam.date,
          // `priority` used to be computed here and frozen into the doc,
          // from an `exam.difficulty` field the onboarding never collects
          // — so every exam created this way stored NaN.
          //
          // A stored score is stale by definition anyway, since urgency
          // changes every single day. Scoring happens at read time now
          // (services/priority.js); the only thing worth persisting is
          // the student's own pick.
          manualPriority: exam.manualPriority ?? MANUAL_PRIORITY_NEUTRAL,
          completed: false,
          createdAt: new Date(),
        })
      );
      await Promise.all(examsPromises);
    }

    // Initialize streak
    await setDoc(doc(db, 'streaks', userId), {
      currentStreak: 0,
      maxStreak: 0,
      lastStudyDate: null,
      totalStudyDays: 0,
      updatedAt: new Date(),
    });

    return true;
  } catch (error) {
    console.error('Error saving onboarding data:', error);
    throw error;
  }
};

/**
 * Get user profile
 * @param {string} userId
 */
export const getUserProfile = async (userId) => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      return { id: userDoc.id, ...userDoc.data() };
    }
    return null;
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw error;
  }
};

/**
 * Update user profile data
 * @param {string} userId
 * @param {Object} data
 */
export const updateUserProfile = async (userId, data) => {
  try {
    await updateDoc(doc(db, 'users', userId), {
      ...data,
      updatedAt: new Date(),
    });
    return true;
  } catch (error) {
    console.error('Error updating profile:', error);
    throw error;
  }
};

/**
 * Get user subjects
 * @param {string} userId
 */
export const getUserSubjects = async (userId) => {
  try {
    const q = query(collection(db, 'subjects'), where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting subjects:', error);
    throw error;
  }
};

/**
 * Add a new subject
 */
export const createSubject = async (subjectData) => {
  try {
    const docRef = await addDoc(collection(db, 'subjects'), {
      ...subjectData,
      createdAt: new Date(),
    });
    return { id: docRef.id, ...subjectData };
  } catch (error) {
    console.error('Error creating subject:', error);
    throw error;
  }
};

/**
 * Update a subject
 */
export const updateSubject = async (subjectId, data) => {
  try {
    await updateDoc(doc(db, 'subjects', subjectId), {
      ...data,
      updatedAt: new Date(),
    });
    return true;
  } catch (error) {
    console.error('Error updating subject:', error);
    throw error;
  }
};

/**
 * Delete a subject and its associated exams
 */
export const deleteSubject = async (userId, subjectId) => {
  try {
    // 1. Delete all exams associated with this subject (filtered by userId for security)
    const examsRef = collection(db, 'exams');
    const q = query(examsRef, where('subjectId', '==', subjectId), where('userId', '==', userId));
    const examSnapshot = await getDocs(q);

    // Use Promise.allSettled to not fail the whole operation if one exam delete fails
    const deletePromises = examSnapshot.docs.map((examDoc) => deleteDoc(examDoc.ref));
    await Promise.allSettled(deletePromises);

    // 2. Delete the subject itself
    await deleteDoc(doc(db, 'subjects', subjectId));
    return true;
  } catch (error) {
    console.error('Error deleting subject:', error);
    throw error;
  }
};

/**
 * Helper: Generate random color for subject
 */
const generateRandomColor = () => {
  const colors = [
    '#FF5722',
    '#E91E63',
    '#9C27B0',
    '#673AB7',
    '#3F51B5',
    '#2196F3',
    '#00BCD4',
    '#009688',
    '#4CAF50',
    '#8BC34A',
    '#FF9800',
    '#FF5722',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

// A second, subtly different copy of `calculatePriority` used to live here — no
// escalones, so it disagreed with the one in services/exams.js about what an
// exam two days out was worth. Both are gone; services/priority.js is the only
// module that scores anything now.
