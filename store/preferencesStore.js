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
    }),
    {
      name: 'schedio-preferences-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default usePreferencesStore;
