import { collection, addDoc, getDocs, query, where, orderBy, limit, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Get upcoming exams for a user
 * @param {string} userId 
 * @param {number} limitCount - Number of exams to return
 */
export const getUpcomingExams = async (userId, limitCount = 10) => {
    try {
        const now = new Date();
        const q = query(
            collection(db, 'exams'),
            where('userId', '==', userId)
        );

        const querySnapshot = await getDocs(q);
        const exams = querySnapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
            date: doc.data().date.toDate ? doc.data().date.toDate() : new Date(doc.data().date),
        }));

        // Filter and sort client-side to avoid complex index requirements
        return exams
            .filter(exam => {
                const isValidDate = exam.date instanceof Date && !isNaN(exam.date);
                if (!isValidDate) console.warn('Invalid date for exam:', exam);
                return !exam.completed && isValidDate && exam.date >= now;
            })
            .sort((a, b) => a.date - b.date)
            .slice(0, limitCount);
    } catch (error) {
        console.error('Error getting upcoming exams:', error);
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

        const querySnapshot = await getDocs(q);
        const exams = querySnapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
            date: doc.data().date.toDate ? doc.data().date.toDate() : new Date(doc.data().date),
        }));

        // Filter for exams in the PAST
        return exams
            .filter(exam => {
                const isValidDate = exam.date instanceof Date && !isNaN(exam.date);
                return isValidDate && exam.date < now;
            })
            .sort((a, b) => b.date - a.date); // Most recent first
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

        const querySnapshot = await getDocs(q);
        const exams = querySnapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
            date: doc.data().date.toDate ? doc.data().date.toDate() : new Date(doc.data().date),
        }));

        // Sort client-side to avoid compound index requirements
        return exams
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

/**
 * Calculate priority score
 * @param {Date} examDate 
 * @param {number} difficulty 
 */
export const calculatePriority = (examDate, difficulty) => {
    const now = new Date();
    const daysUntil = Math.ceil((examDate - now) / (1000 * 60 * 60 * 24));

    if (daysUntil <= 0) return 10; // Exam is today or past
    if (daysUntil === 1) return 9;
    if (daysUntil === 2) return 8;

    return Math.min(10, Math.max(1, (1 / daysUntil) * difficulty * 10));
};
