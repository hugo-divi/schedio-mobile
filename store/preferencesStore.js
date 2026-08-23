import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
