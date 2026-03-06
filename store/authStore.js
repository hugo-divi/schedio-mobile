import { create } from 'zustand';
import { onAuthChange } from '../services/auth';
import { checkEntitlements } from '../services/revenuecat';

/**
 * Authentication store using Zustand
 * Manages user authentication state
 */
const useAuthStore = create((set) => ({
    user: null,
    isPrime: false,
    loading: true,
    error: null,

    // Set Prime state
    setIsPrime: (isPrime) => set({ isPrime }),

    // Set user
    setUser: (user) => set({ user, loading: false, error: null }),

    // Clear user
    clearUser: () => set({ user: null, loading: false, error: null }),

    // Set loading state
    setLoading: (loading) => set({ loading }),

    // Set error
    setError: (error) => set({ error, loading: false }),

    // Clear error
    clearError: () => set({ error: null }),

    // Initialize auth listener
    initAuth: () => {
        try {
            console.log("[AuthStore] Initializing auth listener...");
            const unsubscribe = onAuthChange(async (user) => {
                console.log("[AuthStore] Auth change detected. User:", user?.uid || 'guest');
                set({ user, loading: false });

                if (user) {
                    const isPrime = await checkEntitlements();
                    set({ isPrime });
                } else {
                    set({ isPrime: false });
                }
            });
            return unsubscribe;
        } catch (error) {
            console.error('Firebase not configured:', error.message);
            // Set loading to false so app doesn't hang
            set({ user: null, loading: false, error: 'Firebase not configured' });
            // Return empty function to prevent errors
            return () => { };
        }
    },
}));

export default useAuthStore;
