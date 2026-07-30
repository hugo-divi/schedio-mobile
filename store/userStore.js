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

/**
 * Record what the student did to a task, and reflect it immediately.
 *
 * Every mutation of the plan goes through here, because the plan itself is
 * derived and gets rebuilt from the exam list every day. Writing only to
 * `microplans` — which is what completing, postponing and deleting all used to do
 * — meant the change lasted until the next rebuild and no longer.
 *
 * The in-memory plan is patched as well as the override map, so a tap shows up
 * without waiting for a regeneration or for Firestore.
 *
 * @param {Object} patch - fields the student changed. `{ dismissed: true }`
 *   removes the task; anything else is applied on top of the generated version.
 * @param {Object} [extra] - additional state/document fields to write in the same
 *   round trip (gamification after a tick, say).
 */
const writePlanOverride = async (get, set, uid, taskId, patch, extra = {}) => {
  const { planOverrides, microplans } = get();

  const nextOverrides = {
    ...planOverrides,
    [taskId]: {
      ...planOverrides[taskId],
      ...patch,
      // Drives pruning in reconcilePlan. Without it an override is immortal.
      updatedAt: new Date().toISOString(),
    },
  };

  const nextPlans = microplans
    .filter((task) => !(task.id === taskId && patch.dismissed))
    .map((task) => (task.id === taskId ? { ...task, ...patch } : task))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  set({ planOverrides: nextOverrides, microplans: nextPlans, ...extra });

  if (!uid) return true; // local-only update; nothing to persist against
  try {
    await updateDoc(doc(db, 'users', uid), {
      planOverrides: nextOverrides,
      microplans: nextPlans,
      ...extra,
    });
    return true;
  } catch (error) {
    console.error('Error saving plan override:', error);
    return false;
  }
};

/** Files a free account may upload per rolling seven days. */
export const FREE_WEEKLY_UPLOADS = 3;

const initialState = {
  profile: null,
  subjects: [],
  // Timestamps of past uploads, used for the rolling weekly allowance.
  uploadsHistory: [],
  // The plan the UI renders. DERIVED — regenerated from exams and then merged
  // with `manualTasks` + `planOverrides`. Still persisted so the first paint
  // after a cold start doesn't need a round trip, but it is no longer the source
  // of truth for anything the student did.
  microplans: [],
  // Tasks the student typed in themselves. No exam regenerates these, so they
  // need their own home — inside `microplans` they were wiped every morning.
  manualTasks: [],
  // What the student did to the plan, keyed by task id:
  // `{ [taskId]: { completed?, date?, dismissed?, updatedAt } }`.
  // Kept apart from the plan because the plan is disposable and this is not.
  planOverrides: {},
  // Why the last plan came out the way it did: daily capacity used, total effort,
  // and any work that didn't fit. Not persisted — it's derived, and it's rebuilt
  // every time the plan is.
  planDiagnostics: null,
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
      // Independent reads — awaiting them in sequence cost a round trip on
      // every cold start.
      const userRef = doc(db, 'users', uid);
      const [subjectsData, userSnap] = await Promise.all([getUserSubjects(uid), getDoc(userRef)]);

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
          // Both must load before any regeneration, or reconciliation runs with
          // an empty override map and reverts everything the student did.
          manualTasks: data.manualTasks || [],
          planOverrides: data.planOverrides || {},
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
    const { profile } = get();
    // Entitlement comes from RevenueCat (see authStore), never from Firestore.
    const isPrime = useAuthStore.getState().isPrime;
    // Use centralized permission check
    if (hasPrimeAccess({ isPrime, ...profile })) return true;

    return get().uploadsThisWeek() < FREE_WEEKLY_UPLOADS;
  },

  /**
   * Uploads inside the rolling seven-day window. Split out of `canUpload` so
   * the Mochila can show how much of the free allowance is left, instead of
   * only finding out when an upload is refused.
   */
  uploadsThisWeek: () => {
    const { uploadsHistory } = get();
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return (uploadsHistory || []).filter((timestamp) => timestamp > oneWeekAgo).length;
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
    const { subjects, microplans, stats, profile, sessionHistory, manualTasks, planOverrides } =
      get();
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

        // History feeds two things now: the daily capacity the plan is budgeted
        // against, and the coverage factor that pushes neglected subjects up.
        // Load it if this ran before the dashboard did.
        let currentSessions = sessionHistory;
        if (currentSessions.length === 0) {
          const { getSessionHistory } = await import('../services/sessions');
          currentSessions = await getSessionHistory(uid, 50);
          set({ sessionHistory: currentSessions });
        }

        const { generateStudyPlan, reconcilePlan } = await import('../services/microplanService');
        const { tasks: generated, diagnostics } = generateStudyPlan(exams, currentSubjects, {
          sessions: currentSessions,
          profile,
        });

        // Generation is only half of it: the fresh plan then has to absorb
        // everything the student already did to the previous one. Skipping this
        // is what made every regeneration wipe ticks, manual tasks, postpones
        // and deletions.
        const {
          tasks: newPlans,
          overrides: keptOverrides,
          pruned,
        } = reconcilePlan({
          generated,
          manualTasks,
          overrides: planOverrides,
        });

        if (pruned.length > 0) {
          console.log(`Pruned ${pruned.length} stale plan override(s)`);
        }

        // The scheduler is work-conserving, so anything left over genuinely did
        // not fit in the days available — that's a real finding about the
        // student's week, not noise. Kept in state for the UI to surface;
        // logged meanwhile so it isn't invisible.
        if (diagnostics.unscheduled.length > 0) {
          console.warn('Plan overloaded, work did not fit:', diagnostics.unscheduled);
        }

        const newStats = { ...stats, lastPlanGenerationDate: today };

        set({
          microplans: newPlans,
          planOverrides: keptOverrides,
          planDiagnostics: diagnostics,
          stats: newStats,
        });

        const userRef = doc(db, 'users', uid);
        await updateDoc(userRef, {
          microplans: newPlans,
          planOverrides: keptOverrides,
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
    const task = microplans.find((t) => t.id === taskId);
    if (!task) return;

    const nowCompleted = !task.completed;

    // Un-ticking is just an override write — no XP involved. The previous version
    // granted 50 XP on *every* call, so un-ticking paid out as well and tapping
    // the checkbox back and forth minted XP indefinitely.
    if (!nowCompleted) {
      await writePlanOverride(get, set, uid, taskId, { completed: false });
      return { bonusXp: 0 };
    }

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

    // Same write as the override, so a tick costs one Firestore round trip.
    await writePlanOverride(
      get,
      set,
      uid,
      taskId,
      { completed: true },
      { gamification: newGameData }
    );

    return { bonusXp, newLevel, newRank };
  },

  addManualTask: async (uid, taskData) => {
    const { microplans, manualTasks } = get();

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

    // Kept in its own persisted list, not just in `microplans`: nothing
    // regenerates a manual task, so living only in the derived plan meant being
    // erased by the next daily rebuild.
    const nextManual = [...manualTasks, newTask];
    const nextPlans = [...microplans, newTask].sort((a, b) => new Date(a.date) - new Date(b.date));

    set({ manualTasks: nextManual, microplans: nextPlans });

    if (!uid) return newTask;
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { manualTasks: nextManual, microplans: nextPlans });
      return newTask;
    } catch (error) {
      console.error('Error adding manual task:', error);
    }
  },

  updateMicroTask: async (uid, taskId, updates) =>
    writePlanOverride(get, set, uid, taskId, updates),

  postponeMicroTask: async (uid, taskId) => {
    const { microplans } = get();
    const targetTask = microplans.find((t) => t.id === taskId);
    if (!targetTask) return;

    const tomorrow = new Date(targetTask.date);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Recorded as an override rather than by mutating the task. A task's id
    // encodes the day it was generated for, so the generator re-emitted the
    // original slot on the next rebuild and the postponed copy survived beside
    // it — one postpone, two tasks.
    return writePlanOverride(get, set, uid, taskId, { date: tomorrow.toISOString() });
  },

  deleteMicroTask: async (uid, taskId) => {
    const { manualTasks } = get();

    // A dismissal has to be remembered, not just applied: deleting a generated
    // task only removed it from the array, so the next rebuild brought it back.
    // Manual tasks are dropped from their own list too, so it can't grow forever.
    const nextManual = manualTasks.filter((task) => task.id !== taskId);
    const extra = nextManual.length !== manualTasks.length ? { manualTasks: nextManual } : {};

    return writePlanOverride(get, set, uid, taskId, { dismissed: true }, extra);
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
