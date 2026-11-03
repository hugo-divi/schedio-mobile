import { create } from 'zustand';

/**
 * How long a tapped push's destination waits for the dashboard. Long enough to
 * cover a cold start, a slow restore and the splash; short enough that a tap
 * made while signed out doesn't fire the moment someone signs in much later.
 */
export const PENDING_ROUTE_TTL_MS = 10 * 60 * 1000;

/**
 * The route a tapped notification asked for, until somebody can take it.
 *
 * Kept apart from the tap itself because the tap can land anywhere: on a cold
 * start it arrives before auth has restored and before `/` has decided between
 * login, onboarding and dashboard. app/dashboard/_layout.js is the one place
 * that knows the student is signed in and onboarded, so that is who consumes
 * it.
 */
const useNotificationRouteStore = create((set, get) => ({
  pending: null,

  queue: (route) => set({ pending: route ? { route, at: Date.now() } : null }),

  /** Hands the route over once, and only if it is still fresh. */
  take: () => {
    const { pending } = get();
    if (!pending) return null;
    set({ pending: null });
    return Date.now() - pending.at <= PENDING_ROUTE_TTL_MS ? pending.route : null;
  },
}));

export default useNotificationRouteStore;
