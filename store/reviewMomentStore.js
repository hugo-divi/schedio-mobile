import { create } from 'zustand';
import { MOMENT_TTL_MS } from '../services/reviewPolicy';

/**
 * A good moment that just happened, waiting for Inicio to be on screen and
 * idle before anything is asked.
 *
 * Moments happen in different places — the end of a session, a tick in Plan, a
 * grade saved — and some of those screens are full of questions (the
 * end-of-session mood picker, the grade sheet). Google forbids showing the
 * review card next to a question, so whoever notices the moment only marks it
 * here, and app/dashboard/index.js is the one that asks, once nothing else is
 * open. See services/reviewPolicy.js for the rules.
 */
const useReviewMomentStore = create((set, get) => ({
  pending: null,

  mark: (moment) => set({ pending: { moment, at: Date.now() } }),

  /** Hands the moment over once, and only while it is still fresh. */
  take: () => {
    const { pending } = get();
    if (!pending) return null;
    set({ pending: null });
    return Date.now() - pending.at <= MOMENT_TTL_MS ? pending.moment : null;
  },
}));

export const markReviewMoment = (moment) => useReviewMomentStore.getState().mark(moment);

export default useReviewMomentStore;
