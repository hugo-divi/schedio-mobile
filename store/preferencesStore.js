import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const usePreferencesStore = create(
    persist(
        (set) => ({
            autoGradePrompt: true, // Default to true
            toggleAutoGradePrompt: () => set((state) => ({ autoGradePrompt: !state.autoGradePrompt })),
            setAutoGradePrompt: (value) => set({ autoGradePrompt: value }),
        }),
        {
            name: 'schedio-preferences-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);

export default usePreferencesStore;
