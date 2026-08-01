import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const usePreferencesStore = create(
  persist(
    (set) => ({
      autoGradePrompt: true, // Default to true
      toggleAutoGradePrompt: () => set((state) => ({ autoGradePrompt: !state.autoGradePrompt })),
      setAutoGradePrompt: (value) => set({ autoGradePrompt: value }),

      // The settings switch used to be `value={true}` with an empty
      // handler: it snapped back and controlled nothing. This is what it
      // controls now, checked by every call in notificationService.
      notificationsEnabled: true,
      setNotificationsEnabled: (value) => set({ notificationsEnabled: value }),
    }),
    {
      name: 'schedio-preferences-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default usePreferencesStore;
