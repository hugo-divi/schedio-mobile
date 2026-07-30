import {
  collection,
  addDoc,
  doc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from './firebase';

/**
 * Create a new study session
 * @param {Object} sessionData
 */
export const createSession = async (sessionData) => {
  try {
    const docRef = await addDoc(collection(db, 'sessions'), {
      ...sessionData,
      createdAt: new Date(),
    });
    return { id: docRef.id, ...sessionData };
  } catch (error) {
    console.error('Error creating session:', error);
    throw error;
  }
};

/**
 * Patch a session that already exists.
 *
 * The study screen writes the session as soon as the timer ends — that write
 * carries the streak and the XP, so it must not wait on the student. Anything
 * they type afterwards (notes, how the session felt) lands here.
 *
 * @param {string} sessionId
 * @param {Object} fields
 */
export const updateSession = async (sessionId, fields) => {
  try {
    await updateDoc(doc(db, 'sessions', sessionId), fields);
  } catch (error) {
    console.error('Error updating session:', error);
    throw error;
  }
};

/**
 * Get user's session history
 * @param {string} userId
 * @param {number} limitCount
 */
export const getSessionHistory = async (userId, limitCount = 20) => {
  try {
    const q = query(
      collection(db, 'sessions'),
      where('userId', '==', userId),
      orderBy('date', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().date.toDate ? doc.data().date.toDate() : new Date(doc.data().date),
    }));
  } catch (error) {
    console.error('Error getting session history:', error);
    throw error;
  }
};
