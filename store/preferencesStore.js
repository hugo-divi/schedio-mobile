import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { RHYTHMS, DEFAULT_RHYTHM } from '../services/studyRhythm';

/** Each preset keeps its own numbers, so switching away and back doesn't wipe
 *  what the student set. This is what makes "my routine" work without a
 *  routines feature: put 30/10 in once and it's there next time. */
const initialRhythms = Object.fromEntries(
  Object.entries(RHYTHMS).map(([key, { work, rest, blocks }]) => [key, { work, rest, blocks }])
);

const usePreferencesStore = create(
  persist(
    (set) => ({
      autoGradePrompt: true, // Default to true
      toggleAutoGradePrompt: () => set((state) => ({ autoGradePrompt: !state.autoGradePrompt })),
      setAutoGradePrompt: (value) => set({ autoGradePrompt: value }),

      // "Silencia las notificaciones" reminder before a study session.
      // Ticked away by the student, so it has to survive a restart.
      hideFocusReminder: false,
      setHideFocusReminder: (value) => set({ hideFocusReminder: value }),

      // The settings switch used to be `value={true}` with an empty
      // handler: it snapped back and controlled nothing. This is what it
      // controls now, checked by every call in notificationService.
      notificationsEnabled: true,
      setNotificationsEnabled: (value) => set({ notificationsEnabled: value }),

      // Opt-in on purpose: enabling it sends the student to Android's system
      // settings to grant Notification Policy Access (Do Not Disturb), a
      // special-access permission Android won't let us request silently.
      // Off by default until they've actually granted it.
      focusModeEnabled: false,
      setFocusModeEnabled: (value) => set({ focusModeEnabled: value }),

      // ── Study rhythm ──

      /** Which preset Estudiar opens on. Persisted so it opens on whatever was
       *  used last rather than always on Continuo — a student whose routine is
       *  Pomodoro never has to open the picker at all. */
      studyRhythmMode: DEFAULT_RHYTHM,
      setStudyRhythmMode: (mode) => set({ studyRhythmMode: mode }),

      studyRhythms: initialRhythms,
      setStudyRhythm: (mode, patch) =>
        set((state) => ({
          studyRhythms: {
            ...state.studyRhythms,
            [mode]: { ...(state.studyRhythms?.[mode] || RHYTHMS[mode]), ...patch },
          },
        })),

      /**
       * False until the first session is started, and while it's false the
       * picker renders open. It's how anyone finds out rhythms exist at all:
       * collapsed, the card just says "Continuo" and there's nothing telling
       * you it's worth tapping.
       *
       * Flipped by *starting* a session rather than by tapping the header, so
       * having seen it once is enough even if you scrolled straight past.
       */
      hasSeenRhythmPicker: false,
      markRhythmPickerSeen: () => set({ hasSeenRhythmPicker: true }),

      // ── Language ──
      // Spanish always, for every install, regardless of device locale — the
      // audience is Spanish students. English is opt-in only, from the row in
      // Settings; app/_layout.js watches this and pushes it onto i18next.
      language: 'es',
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'schedio-preferences-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

/**
 * Resolves once the persisted preferences have actually been read back out of
 * AsyncStorage.
 *
 * Rehydration is asynchronous, so during startup `getState()` can still be
 * handing out the in-memory defaults — every one of which is the "on" value.
 * Anything that acts on a preference while the app is starting has to wait for
 * this first, or it acts on a default the student already turned off. Waiting a
 * fixed number of milliseconds instead only makes the race less likely, not
 * impossible: a cold start on a slow device loses it.
 */
export const whenPreferencesHydrated = () =>
  usePreferencesStore.persist.hasHydrated()
    ? Promise.resolve()
    : new Promise((resolve) => {
        const unsubscribe = usePreferencesStore.persist.onFinishHydration(() => {
          unsubscribe();
          resolve();
        });
      });

export default usePreferencesStore;
