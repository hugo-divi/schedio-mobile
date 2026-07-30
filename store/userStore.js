import { create } from 'zustand';
import { db } from '../services/firebase';
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  limit,
  addDoc,
  deleteDoc,
  where,
} from 'firebase/firestore';
import {
  getUserSubjects,
  updateUserProfile,
  createSubject,
  updateSubject,
  deleteSubject,
} from '../services/userData';
import { createSession } from '../services/sessions';
import {
  calculateLevel,
  getRankForLevel,
  checkNewBadges,
  BASE_XP_PER_MINUTE,
} from '../services/gamification';
import { hasPrimeAccess } from '../services/permissions';
import { logger } from '../utils/logger';
import useAuthStore from './authStore';

const initialState = {
  profile: null,
  subjects: [],
  microplans: [],
  resources: [],
  sessionHistory: [],
  stats: {
    totalSessions: 0,
    totalTime: 0,
    streak: 0,
    lastStudyDate: null,
    lastPlanGenerationDate: null,
  },
  gamification: {
    xp: 0,
    level: 1,
    rank: 'Novato',
    badges: [],
  },
  loading: false,
  error: null,
  examRefreshTrigger: 0,
  hasSeenTour: false,
};

const useUserStore = create((set, get) => ({
  ...initialState,

  loadUserData: async (uid) => {
    set({ loading: true, error: null });
    try {
      const subjectsData = await getUserSubjects(uid);
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);

      let profileData = null;
      let statsData = initialState.stats;
      let gameData = initialState.gamification;
      let microplansData = [];

      if (userSnap.exists()) {
        const data = userSnap.data() || {};
        profileData = {
          displayName: data.displayName || null,
          photoURL: data.photoURL || null,
          course: data.course || null,
          grade: data.grade || null,
          organizationLevel: data.organizationLevel || null,
          onboardingCompleted: data.onboardingCompleted || false,
          averageGrade: data.profile?.averageGrade || 0,
        };
        statsData = { ...initialState.stats, ...(data.stats || {}) };
        gameData = { ...initialState.gamification, ...(data.gamification || {}) };
        microplansData = data.microplans || [];
        statsData.lastPlanGenerationDate = data.stats?.lastPlanGenerationDate || null; // Load date from stats or root if moved

        const calculatedLevel = calculateLevel(gameData.xp);
        gameData.level = calculatedLevel;
        gameData.rank = getRankForLevel(calculatedLevel).title;

        set({
          subjects: subjectsData,
          profile: profileData,
          stats: statsData,
          gamification: gameData,
          uploadsHistory: data?.uploadsHistory || [], // Load history
          microplans: microplansData,
          loading: false,
        });
      } else {
        set({
          subjects: subjectsData,
          loading: false,
        });
      }

      // Load Resources
      try {
        const resourcesRef = collection(db, 'users', uid, 'resources');
        const resourcesSnap = await getDocs(query(resourcesRef, limit(50)));
        const resources = resourcesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        set({ resources });
      } catch (rErr) {
        // Silently fail if resources subcollection isn't accessible or doesn't exist
        // console.debug("Resources not loaded:", rErr.message);
      }
    } catch (error) {
      logger.error('Error loading user data:', error);
      set({ error: error.message, loading: false });
    }
  },

  loadSessionHistory: async (uid) => {
    try {
      const { getSessionHistory } = await import('../services/sessions');
      const history = await getSessionHistory(uid, 50);
      set({ sessionHistory: history });
    } catch (error) {
      console.error('Error loading session history:', error);
    }
  },

  addQuickNote: async (uid, content) => {
    try {
      const { db } = await import('../services/firebase');
      const { collection, addDoc } = await import('firebase/firestore');

      await addDoc(collection(db, 'users', uid, 'notes'), {
        content,
        createdAt: new Date().toISOString(),
      });
      return true;
    } catch (error) {
      console.error('Error adding quick note:', error);
      throw error;
    }
  },

  canUpload: () => {
    const { uploadsHistory, profile } = get();
    // Entitlement comes from RevenueCat (see authStore), never from Firestore.
    const isPrime = useAuthStore.getState().isPrime;
    // Use centralized permission check
    if (hasPrimeAccess({ isPrime, ...profile })) return true;

    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

    // Filter uploads from the last 7 days
    const recentUploads = (uploadsHistory || []).filter((timestamp) => timestamp > oneWeekAgo);

    return recentUploads.length < 3;
  },

  recordUpload: async (userId) => {
    const { uploadsHistory } = get();
    const now = Date.now();
    const newHistory = [...(uploadsHistory || []), now];

    set({ uploadsHistory: newHistory });

    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { uploadsHistory: newHistory });
    } catch (error) {
      console.error('Error recording upload:', error);
    }
  },

  addResource: async (userId, resourceData) => {
    const { resources } = get();
    // Optimistic update
    set({ resources: [resourceData, ...resources] });

    try {
      const resourcesRef = collection(db, 'users', userId, 'resources');
      await addDoc(resourcesRef, resourceData);
    } catch (error) {
      console.error('Error adding resource:', error);
    }
  },

  removeResource: async (userId, resourcePath) => {
    const { resources } = get();
    const updatedResources = resources.filter((r) => r.path !== resourcePath);
    set({ resources: updatedResources });

    try {
      const resourcesRef = collection(db, 'users', userId, 'resources');
      const q = query(resourcesRef, where('path', '==', resourcePath));
      const snapshot = await getDocs(q);
      snapshot.forEach(async (doc) => {
        await deleteDoc(doc.ref);
      });
    } catch (error) {
      console.error('Error removing resource:', error);
    }
  },

  addSession: async (uid, sessionData) => {
    const { stats, gamification } = get();

    // 1. Update Stats
    const now = new Date();
    const todayStr = now.toDateString();
    const lastDate = stats.lastStudyDate ? new Date(stats.lastStudyDate) : null;
    const lastDateStr = lastDate ? lastDate.toDateString() : null;

    // 1. Use centralized reliable streak logic
    const { recordActivity } = await import('../services/streaks');
    const streakResult = await recordActivity(uid, sessionData.duration);
    const newStreak = streakResult.currentStreak;

    const newStats = {
      ...stats,
      totalSessions: stats.totalSessions + 1,
      totalTime: stats.totalTime + sessionData.duration,
      streak: newStreak,
      lastStudyDate: now.toISOString(),
    };

    // 2. XP Logic
    const xpEarned = sessionData.duration * BASE_XP_PER_MINUTE;
    const newXp = gamification.xp + xpEarned;
    const newLevel = calculateLevel(newXp);
    const newRank = getRankForLevel(newLevel).title;

    // 3. Badges
    const unlockedBadges = checkNewBadges(gamification.badges, newStats, {
      duration: sessionData.duration,
    });
    const newBadges = [...gamification.badges, ...unlockedBadges];

    const newGameData = {
      xp: newXp,
      level: newLevel,
      rank: newRank,
      badges: newBadges,
    };

    // 4. Create local session for immediate UI update
    const newLocalSession = {
      id: 'temp-' + Date.now(),
      userId: uid,
      subjectId: sessionData.subjectId,
      duration: sessionData.duration,
      date: now,
      goals: sessionData.goals || [],
      notes: sessionData.notes || '',
      focusScore: sessionData.focusScore || 5,
    };

    set((state) => ({
      stats: newStats,
      gamification: newGameData,
      sessionHistory: [newLocalSession, ...state.sessionHistory],
    }));

    try {
      const userRef = doc(db, 'users', uid);

      // Parallel writes for efficiency
      const [, createdSession] = await Promise.all([
        updateDoc(userRef, {
          stats: newStats,
          gamification: newGameData,
        }),
        createSession({
          userId: uid,
          subjectId: sessionData.subjectId,
          duration: sessionData.duration,
          date: new Date(),
          goals: sessionData.goals || [],
          notes: sessionData.notes || '',
          focusScore: sessionData.focusScore || 5,
        }),
      ]);

      // Swap the optimistic id for the real one so a later patch (notes, mood)
      // has something to write to.
      if (createdSession?.id) {
        set((state) => ({
          sessionHistory: state.sessionHistory.map((s) =>
            s.id === newLocalSession.id ? { ...s, id: createdSession.id } : s
          ),
        }));
      }

      return { xpEarned, newLevel, unlockedBadges, newRank, sessionId: createdSession?.id ?? null };
    } catch (error) {
      console.error('Error saving session:', error);
      return { xpEarned, newLevel, unlockedBadges, newRank, sessionId: null };
    }
  },

  /**
   * Attach what the student wrote after the timer stopped. Kept separate from
   * `addSession` because that one runs the moment the session ends — waiting
   * for the summary screen would risk losing the streak and the XP if the app
   * went away first.
   */
  updateSessionFeedback: async (sessionId, { notes, focusScore }) => {
    if (!sessionId) return;

    const fields = {};
    if (typeof notes === 'string') fields.notes = notes;
    if (typeof focusScore === 'number') fields.focusScore = focusScore;
    if (Object.keys(fields).length === 0) return;

    set((state) => ({
      sessionHistory: state.sessionHistory.map((s) =>
        s.id === sessionId ? { ...s, ...fields } : s
      ),
    }));

    try {
      const { updateSession } = await import('../services/sessions');
      await updateSession(sessionId, fields);
    } catch (error) {
      console.error('Error saving session feedback:', error);
    }
  },

  updateProfile: async (userId, updates) => {
    try {
      set((state) => ({
        profile: state.profile ? { ...state.profile, ...updates } : updates,
      }));
      await updateUserProfile(userId, updates);
    } catch (error) {
      console.error('Error updating profile:', error);
    }
  },

  setUserPhoto: async (userId, photoURL) => {
    try {
      set((state) => ({
        profile: state.profile ? { ...state.profile, photoURL } : { photoURL },
      }));
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { photoURL });
    } catch (error) {
      console.error('Error updating user photo:', error);
    }
  },

  updateAverageGrade: async (userId) => {
    try {
      const { getCompletedExams } = await import('../services/exams');
      const completedExams = await getCompletedExams(userId, 100);

      // 1. Global Average
      let averageGrade = 0;
      if (completedExams && completedExams.length > 0) {
        const gradesWithValues = completedExams.filter(
          (e) => e.grade !== undefined && e.grade !== null
        );
        if (gradesWithValues.length > 0) {
          let totalWeightedGrade = 0;
          let totalWeight = 0;

          gradesWithValues.forEach((e) => {
            const grade = parseFloat(e.grade) || 0;
            const weight = parseFloat(e.weight) || 1; // Default to 1 if no weight
            totalWeightedGrade += grade * weight;
            totalWeight += weight;
          });

          averageGrade = totalWeight > 0 ? (totalWeightedGrade / totalWeight).toFixed(1) : 0;
        }
      }

      // 2. Subject Averages
      const subjectGrades = {};
      completedExams.forEach((exam) => {
        if (exam.subjectId && exam.grade !== undefined && exam.grade !== null) {
          if (!subjectGrades[exam.subjectId]) subjectGrades[exam.subjectId] = [];
          subjectGrades[exam.subjectId].push({
            grade: parseFloat(exam.grade) || 0,
            weight: parseFloat(exam.weight) || 1,
          });
        }
      });

      // Update subjects in Store & DB
      const { subjects } = get();
      const updatedSubjects = await Promise.all(
        subjects.map(async (subject) => {
          const grades = subjectGrades[subject.id];
          if (grades && grades.length > 0) {
            let subTotalWeighted = 0;
            let subTotalWeight = 0;

            grades.forEach((g) => {
              subTotalWeighted += g.grade * g.weight;
              subTotalWeight += g.weight;
            });

            const avg = subTotalWeight > 0 ? (subTotalWeighted / subTotalWeight).toFixed(1) : '0.0';

            if (subject.average !== avg) {
              const subjectRef = doc(db, 'subjects', subject.id);
              await updateDoc(subjectRef, { average: avg });
            }
            return { ...subject, average: avg };
          }
          return subject;
        })
      );

      // 3. Persist Global Average to Profile
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { 'profile.averageGrade': averageGrade });

      set((state) => ({
        subjects: updatedSubjects,
        profile: state.profile ? { ...state.profile, averageGrade } : { averageGrade },
      }));

      return averageGrade;
    } catch (error) {
      console.error('Error updating average grades:', error);
      return 0;
    }
  },

  initDailyMicroplans: async (uid, force = false) => {
    const { subjects, microplans, stats } = get();
    const today = new Date().toDateString();

    const shouldGenerate =
      force || microplans.length === 0 || stats.lastPlanGenerationDate !== today;

    if (shouldGenerate) {
      try {
        let currentSubjects = subjects;
        if (currentSubjects.length === 0) {
          const { getUserSubjects } = await import('../services/userData');
          currentSubjects = await getUserSubjects(uid);
          set({ subjects: currentSubjects });
        }

        const { getUpcomingExams } = await import('../services/exams');
        const exams = await getUpcomingExams(uid, 20);

        const { generateExamPlan } = await import('../services/microplanService');
        const newPlans = generateExamPlan(exams, currentSubjects);

        const newStats = { ...stats, lastPlanGenerationDate: today };

        set({
          microplans: newPlans,
          stats: newStats,
        });

        const userRef = doc(db, 'users', uid);
        await updateDoc(userRef, {
          microplans: newPlans,
          'stats.lastPlanGenerationDate': today,
        });
      } catch (error) {
        console.error('Error generating microplans:', error);
      }
    }
  },

  generateAiPlans: async (uid) => {
    set({ loading: true });
    const { subjects } = get();
    try {
      const { getUpcomingExams } = await import('../services/exams');
      const { getSessionHistory } = await import('../services/sessions');
      const { getStudyPlanSuggestion } = await import('../services/aiService');

      const exams = await getUpcomingExams(uid, 20);
      const sessions = await getSessionHistory(uid, 10);

      const aiPlans = await getStudyPlanSuggestion(exams, subjects, sessions);

      if (aiPlans && Array.isArray(aiPlans) && aiPlans.length > 0) {
        set({ microplans: aiPlans, loading: false });

        const userRef = doc(db, 'users', uid);
        await updateDoc(userRef, {
          microplans: aiPlans,
          'stats.lastPlanGenerationDate': new Date().toDateString(),
        });
        return true;
      } else {
        set({ loading: false });
        return false;
      }
    } catch (error) {
      console.error('Error generating AI plans:', error);
      set({ error: 'No se pudo generar el plan con IA', loading: false });
      return false;
    }
  },

  completeMicroTask: async (uid, taskId) => {
    const { microplans, gamification } = get();
    const updatedPlans = microplans.map((task) =>
      task.id === taskId ? { ...task, completed: !task.completed } : task
    );

    set({ microplans: updatedPlans });

    const bonusXp = 50;
    const newXp = gamification.xp + bonusXp;
    const newLevel = calculateLevel(newXp);
    const newRank = getRankForLevel(newLevel).title;

    const newGameData = {
      ...gamification,
      xp: newXp,
      level: newLevel,
      rank: newRank,
    };

    set({ gamification: newGameData });

    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        microplans: updatedPlans,
        gamification: newGameData,
      });
      return { bonusXp, newLevel, newRank };
    } catch (error) {
      console.error('Error updating microtask:', error);
    }
  },

  addManualTask: async (uid, taskData) => {
    const { microplans } = get();

    const newTask = {
      id: `manual-${Date.now()}`,
      date: taskData.date || new Date().toISOString(),
      text: taskData.text,
      duration: taskData.duration || 30,
      completed: false,
      phase: 'PERSONAL',
      type: 'manual',
      isPanicMode: false,
      subjectId: taskData.subjectId || null,
      subjectName: taskData.subjectName || 'General',
      subjectColor: taskData.subjectColor || '#A1A1AA',
    };

    const updatedPlans = [...microplans, newTask].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    set({ microplans: updatedPlans });

    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { microplans: updatedPlans });
      return newTask;
    } catch (error) {
      console.error('Error adding manual task:', error);
    }
  },

  updateMicroTask: async (uid, taskId, updates) => {
    const { microplans } = get();
    const updatedPlans = microplans.map((task) =>
      task.id === taskId ? { ...task, ...updates } : task
    );
    set({ microplans: updatedPlans });

    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { microplans: updatedPlans });
      return true;
    } catch (error) {
      console.error('Error updating microtask:', error);
    }
  },

  postponeMicroTask: async (uid, taskId) => {
    const { microplans } = get();
    let targetTask = microplans.find((t) => t.id === taskId);
    if (!targetTask) return;

    const currentTaskDate = new Date(targetTask.date);
    const tomorrow = new Date(currentTaskDate);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const updatedPlans = microplans
      .map((task) => (task.id === taskId ? { ...task, date: tomorrow.toISOString() } : task))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    set({ microplans: updatedPlans });

    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { microplans: updatedPlans });
      return true;
    } catch (error) {
      console.error('Error postponing microtask:', error);
    }
  },

  deleteMicroTask: async (uid, taskId) => {
    const { microplans } = get();
    const updatedPlans = microplans.filter((task) => task.id !== taskId);
    set({ microplans: updatedPlans });

    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { microplans: updatedPlans });
      return true;
    } catch (error) {
      console.error('Error deleting microtask:', error);
    }
  },

  addSubject: async (userId, subjectData) => {
    try {
      const newSubject = await createSubject({ ...subjectData, userId });
      set((state) => ({
        subjects: [...state.subjects, newSubject],
      }));
      return newSubject;
    } catch (error) {
      console.error('Error in addSubject action:', error);
      throw error;
    }
  },

  editSubject: async (userId, subjectId, data) => {
    try {
      await updateSubject(subjectId, data);
      set((state) => ({
        subjects: state.subjects.map((s) => (s.id === subjectId ? { ...s, ...data } : s)),
      }));
    } catch (error) {
      console.error('Error in editSubject action:', error);
      throw error;
    }
  },

  updateExam: async (userId, examId, data) => {
    try {
      const { updateExam } = await import('../services/exams');
      await updateExam(examId, data);

      // Refresh averages after grade change
      if (data.grade !== undefined || data.completed !== undefined) {
        await get().updateAverageGrade(userId);
      }
      return true;
    } catch (error) {
      console.error('Error in updateExam action:', error);
      throw error;
    }
  },

  removeSubject: async (userId, subjectId) => {
    try {
      await deleteSubject(userId, subjectId);
      set((state) => ({
        subjects: state.subjects.filter((s) => s.id !== subjectId),
      }));
    } catch (error) {
      console.error('Error in removeSubject action:', error);
      throw error;
    }
  },

  triggerExamRefresh: () => set((state) => ({ examRefreshTrigger: state.examRefreshTrigger + 1 })),

  clearData: () => set(initialState),
}));

export default useUserStore;
