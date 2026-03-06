import { create } from 'zustand';

/**
 * Toast store for managing toast notifications
 */
const useToastStore = create((set) => ({
    toasts: [],

    // Add a new toast
    addToast: (message, type = 'info', duration = 3000) => {
        const id = Date.now();
        set((state) => ({
            toasts: [...state.toasts, { id, message, type, duration }]
        }));
        return id;
    },

    // Remove a toast by id
    removeToast: (id) => {
        set((state) => ({
            toasts: state.toasts.filter((toast) => toast.id !== id)
        }));
    },

    // Helper methods for different types
    success: (message, duration) => {
        return useToastStore.getState().addToast(message, 'success', duration);
    },

    error: (message, duration) => {
        return useToastStore.getState().addToast(message, 'error', duration);
    },

    warning: (message, duration) => {
        return useToastStore.getState().addToast(message, 'warning', duration);
    },

    info: (message, duration) => {
        return useToastStore.getState().addToast(message, 'info', duration);
    },
}));

export default useToastStore;
