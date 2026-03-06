import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const useThemeStore = create(
    persist(
        (set) => ({
            isDarkMode: true,
            toggleTheme: () => { }, // Disabled
            setDarkMode: () => { }, // Disabled
        }),
        {
            name: 'schedio-theme-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);

export default useThemeStore;
